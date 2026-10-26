import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  productInput,
  adjustmentInput,
  stockAfter,
} from "../server/domain/inventory";
import { reminderText, deliverReminder } from "../server/domain/reminders";
import {
  validateProducts,
  postInvoiceStock,
} from "../server/services/inventory";
import { inventoryRoutes } from "../server/routes/inventory";
import { reminderRoutes } from "../server/routes/reminders";
import { errorHandler, ApiError } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { Pool, PoolClient } from "pg";
import type { InvoiceInput } from "../server/domain/validation";
import { randomUUID } from "node:crypto";

test("stock uses integer milli-units, prevents underflow and validates precision", () => {
  assert.equal(stockAfter(10000, -1250), 8750);
  assert.throws(() => stockAfter(1000, -1001));
  assert.throws(() => stockAfter(Number.MAX_SAFE_INTEGER, 1));
  assert.equal(
    productInput.parse({
      sku: " rice ",
      name: "Rice",
      unit: "kg",
      opening: 1.125,
      minimum: 0,
      date: "2026-11-28",
    }).sku,
    "RICE",
  );
  for (const quantity of [0, -1, 0.0001, Infinity])
    assert.equal(
      adjustmentInput.safeParse({
        requestId: randomUUID(),
        date: "2026-11-28",
        kind: "Customer return",
        quantity,
        reason: "Returned goods",
      }).success,
      false,
    );
});
test("product validation scopes workspace, sorts locks and rejects wrong stock unit", async () => {
  const calls: unknown[][] = [];
  const c = {
    query: async (_sql: string, values: unknown[]) => {
      calls.push(values);
      return {
        rows: values[0] === "missing" ? [] : [{ active: true, unit: "kg" }],
      };
    },
  } as unknown as PoolClient;
  await validateProducts(c, "workspace", [
    { productId: "z", unit: "kg" },
    { productId: "a", unit: "kg" },
  ] as InvoiceInput["items"]);
  assert.deepEqual(calls, [
    ["a", "workspace"],
    ["z", "workspace"],
  ]);
  await assert.rejects(
    validateProducts(c, "workspace", [
      { productId: "missing", unit: "kg" },
    ] as InvoiceInput["items"]),
    /unavailable/,
  );
  await assert.rejects(
    validateProducts(c, "workspace", [
      { productId: "a", unit: "Bag" },
    ] as InvoiceInput["items"]),
    /stock unit/,
  );
});
test("untracked invoice items create no stock movements", async () => {
  await postInvoiceStock(
    {
      query: () => {
        throw Error("Unexpected stock query");
      },
    } as unknown as PoolClient,
    "b",
    "u",
    "i",
    { items: [{ quantity: 2 }] } as InvoiceInput,
    false,
  );
});
test("reminder templates include exact PKR, invoice, due date and unsubscribe", () => {
  const text = reminderText(
    {
      business: "Ali",
      customer: "Ahmed",
      invoice: "INV-1",
      dueDate: "2026-11-28",
      balanceMinor: 123456,
    },
    "polite",
  );
  assert.match(text, /1,234.56/);
  assert.match(text, /INV-1/);
  assert.match(text, /\/stop/);
});
for (const scenario of [
  "sent",
  "rate",
  "forbidden",
  "timeout",
  "server",
  "malformed",
] as const)
  test(`Telegram reminder ${scenario} classifies delivery without exposing credentials`, async () => {
    const fetcher = (async () => {
      if (scenario === "timeout") throw Error("sensitive provider token");
      if (scenario === "malformed")
        return new Response("bad json", { status: 502 });
      const data =
        scenario === "sent"
          ? { ok: true, result: { message_id: 123 } }
          : scenario === "rate"
            ? { ok: false, error_code: 429, parameters: { retry_after: 25 } }
            : scenario === "forbidden"
              ? { ok: false, error_code: 403 }
              : { ok: false, error_code: 500 };
      return new Response(JSON.stringify(data), {
        status:
          scenario === "sent"
            ? 200
            : scenario === "rate"
              ? 429
              : scenario === "forbidden"
                ? 403
                : 500,
      });
    }) as typeof fetch;
    const r = await deliverReminder(
      "private-token",
      "customer-chat",
      "Payment reminder",
      fetcher,
    );
    assert.equal(
      r.status,
      scenario === "sent"
        ? "Sent"
        : scenario === "rate"
          ? "Retry"
          : scenario === "forbidden"
            ? "Failed"
            : "Unknown",
    );
    assert.ok(!JSON.stringify(r).includes("private-token"));
    assert.ok(!JSON.stringify(r).includes("sensitive"));
    if (r.status === "Retry") assert.equal(r.retrySeconds, 25);
  });
test("inventory and reminder endpoints reject unauthenticated calls before database access", async () => {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  const auth = {
    requireMembership: async () => {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
    },
  } as unknown as Auth;
  const pool = {
    query: () => {
      throw Error("Unexpected database access");
    },
    connect: () => {
      throw Error("Unexpected database access");
    },
  } as unknown as Pool;
  await inventoryRoutes(app, pool, auth);
  await reminderRoutes(app, pool, auth, {
    TELEGRAM_MODE: "off",
    OPENAI_MODEL: "test",
    BOT_ACTION_TTL_MINUTES: 15,
  });
  try {
    for (const [method, url] of [
      ["GET", "inventory"],
      ["POST", "inventory"],
      ["POST", "inventory/p/adjustments"],
      ["GET", "reminders"],
      ["POST", "reminders"],
      ["POST", "reminders/recipients/p/link"],
      ["POST", "reminders/recipients/p/approve"],
      ["DELETE", "reminders/recipients/p"],
    ] as const) {
      const r = await app.inject({ method, url: `/api/businesses/b/${url}` });
      assert.equal(r.statusCode, 401, r.body);
    }
  } finally {
    await app.close();
  }
});

// Worker tests use controlled database responses and a fake Telegram boundary.
// Real PostgreSQL locking and persistence cases live in inventoryReminderIntegration.
for (const mode of [
  "sent",
  "changed-balance",
  "revoked",
  "retry",
  "exhausted",
  "uncertain",
] as const)
  test(`reminder worker ${mode} maintains delivery states and notification semantics`, async () => {
    const { processReminder } = await import("../server/services/reminders");
    let sent = 0,
      notification = 0,
      final = "",
      claimed = false;
    const job = {
      id: "r1",
      business_id: "b",
      invoice_id: "i",
      party_id: "p",
      user_id: "u",
      recipient_version: "v1",
      balance_minor: 10000,
      text: "Reminder",
      attempts: mode === "exhausted" ? 3 : 0,
    };
    const client = {
      release() {},
      async query(sql: string, values: unknown[] = []) {
        let rows: object[] = [];
        if (sql.includes("for update skip locked")) rows = [job];
        else if (sql.includes("from reminder_recipients"))
          rows = [
            {
              state: mode === "revoked" ? "Disconnected" : "Connected",
              version: "v1",
              chat_id: "customer",
            },
          ];
        else if (sql.includes("from workspace_memberships"))
          rows = [{ id: "u" }];
        else if (sql.includes("select i.*"))
          rows = [
            {
              id: "i",
              status: "Sent",
              total_minor: 10000,
              settled_minor: mode === "changed-balance" ? 5000 : 0,
              due_date: "2026-11-28",
              party_id: "p",
              business_id: "b",
            },
          ];
        else if (sql.includes("set status='Sending'")) claimed = true;
        else if (sql.startsWith("update reminders set status=$2")) {
          final = String(values[1]);
          rows = [job];
        } else if (sql.includes("insert into notifications")) notification++;
        else if (sql.includes("p.name customer"))
          rows = [{ customer: "Ahmed", display_id: "INV-1" }];
        return { rows, rowCount: rows.length };
      },
    };
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => client,
    } as unknown as Pool;
    const fetcher = (async () => {
      sent++;
      assert.equal(
        claimed,
        true,
        "must commit a sending claim before contacting Telegram",
      );
      if (mode === "uncertain") throw Error("Timeout");
      return new Response(
        JSON.stringify(
          mode === "retry" || mode === "exhausted"
            ? { ok: false, error_code: 429, parameters: { retry_after: 1 } }
            : { ok: true, result: { message_id: 1 } },
        ),
        { status: mode === "retry" || mode === "exhausted" ? 429 : 200 },
      );
    }) as typeof fetch;
    await processReminder(pool, "redacted", fetcher);
    const cancelled = mode === "changed-balance" || mode === "revoked";
    assert.equal(sent, cancelled ? 0 : 1);
    assert.equal(
      final,
      cancelled
        ? "Cancelled"
        : mode === "retry"
          ? "Retry"
          : mode === "exhausted"
            ? "Failed"
            : mode === "uncertain"
              ? "Unknown"
              : "Sent",
    );
    assert.equal(notification, mode === "retry" ? 0 : 1);
  });
