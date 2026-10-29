import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  journalBalances,
  profitAmounts,
  type Journal,
} from "../src/domain/accounting";
import { accountingRoutes } from "../server/routes/accounting";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
import { reportCsv } from "../src/utils/reportExport";
const journals: Journal[] = [
  {
    source: "opening",
    date: "2026-11-28",
    lines: [
      { account: "Inventory", amountMinor: 1000000 },
      { account: "Opening equity", amountMinor: -1000000 },
    ],
  },
  {
    source: "dispatch",
    date: "2026-11-29",
    lines: [
      { account: "Cost of goods sold", amountMinor: 400000 },
      { account: "Inventory", amountMinor: -400000 },
      { account: "Customer control", amountMinor: 600000 },
      { account: "Sales revenue", amountMinor: -600000 },
    ],
  },
  {
    source: "receipt",
    date: "2026-12-01",
    lines: [
      { account: "Cash and bank", amountMinor: 600000 },
      { account: "Customer control", amountMinor: -600000 },
    ],
  },
];
test("journal periods preserve opening balances and exclude payments/equity from profit", () => {
  assert.equal(
    profitAmounts(journals, "2026-11-01", "2026-11-30").profit,
    200000,
  );
  assert.equal(profitAmounts(journals, "2026-12-01", "2026-12-31").profit, 0);
  const rows = journalBalances(journals, "2026-12-01", "2026-12-31");
  assert.equal(
    rows.reduce((n, r) => n + r.closing, 0),
    0,
  );
  assert.equal(rows.find((r) => r.account === "Inventory")?.opening, 600000);
  assert.equal(rows.find((r) => r.account === "Customer control")?.closing, 0);
});
test("unsafe journal integers are rejected rather than rounded", () => {
  assert.throws(
    () =>
      journalBalances(
        [
          {
            source: "bad",
            date: "2026-11-01",
            lines: [
              {
                account: "Inventory",
                amountMinor: Number.MAX_SAFE_INTEGER + 1,
              },
            ],
          },
        ],
        "2026-11-01",
        "2026-11-30",
      ),
    /supported/,
  );
});
test("accounting routes require membership and owner permission before touching the database", async () => {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  let role = "Staff";
  const auth = {
    requireMembership: async (_r: unknown, b: string) => {
      if (b !== "allowed")
        throw new ApiError(404, "NOT_FOUND", "Workspace not found");
      return { role, user: { id: "owner" } };
    },
  } as unknown as Auth;
  const pool = {
    query: () => {
      throw new Error("Unexpected database access");
    },
    connect: () => {
      throw new Error("Unexpected database access");
    },
  } as unknown as DatabasePool;
  await accountingRoutes(app, pool, auth);
  try {
    for (const [method, path] of [
      ["GET", "/preview?date=2026-11-28"],
      ["POST", "/activate"],
      ["POST", "/credits/resolve"],
    ] as const) {
      const r = await app.inject({
        method,
        url: "/api/businesses/allowed/accounting" + path,
      });
      assert.equal(r.statusCode, 403, r.body);
    }
    assert.equal(
      (
        await app.inject({
          url: "/api/businesses/other/accounting?from=2026-11-01&to=2026-11-30",
        })
      ).statusCode,
      404,
    );
    role = "Owner";
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/businesses/allowed/accounting/activate",
          payload: { confirmed: false },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
test("P&L export preserves the cutover basis and provisional warning", () => {
  const csv = reportCsv({
    kind: "profit-loss",
    period: "2026-11",
    accountingBasis: "Cutover 2026-11-28",
    warnings: ["Unallocated supplier credit"],
    lines: [],
    aging: [],
    cash: [],
    chart: [],
  });
  assert.match(csv, /Cutover 2026-11-28/);
  assert.match(csv, /Unallocated supplier credit/);
});

test("active accounting rejects future posting without changing legacy workspaces", async () => {
  const { validateAccountingDate } =
    await import("../server/services/accountingDate");
  const active = {
    query: async () => ({ rowCount: 1, rows: [{}] }),
  } as unknown as import("../server/services/ledger").Queryable;
  const inactive = {
    query: async () => ({ rowCount: 0, rows: [] }),
  } as unknown as import("../server/services/ledger").Queryable;
  await assert.rejects(
    validateAccountingDate(active, "workspace", "9999-12-31"),
    /Future-dated/,
  );
  await validateAccountingDate(inactive, "workspace", "9999-12-31");
});
