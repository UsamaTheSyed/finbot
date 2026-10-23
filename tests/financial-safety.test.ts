import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { transactionRoutes } from "../server/routes/transactions";
import { partyRoutes } from "../server/routes/parties";
import { invoiceDto } from "../server/services/ledger";
import { errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
const auth = {
  async requireMembership() {
    return {};
  },
} as unknown as Auth;
for (const mode of ["manual", "fifo", "credit", "unpaid"] as const)
  test(`delete ${mode} transaction preserves protected financial history`, async () => {
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        let rows: object[] = [];
        if (sql.includes("select * from transactions"))
          rows = [{ id: "SALE-1", party_id: "party-1" }];
        else if (sql.includes("select * from parties"))
          rows = [{ id: "party-1" }];
        else if (sql.includes("select 1 from invoice_corrections"))
          rows = mode === "credit" ? [{}] : [];
        else if (sql.includes("select 1 from payment_transaction_allocations"))
          rows = mode === "fifo" ? [{}] : [];
        else if (sql.includes("select 1 from payments"))
          rows = mode === "manual" ? [{}] : [];
        return { rows, rowCount: rows.length };
      },
      release() {
        calls.push("release");
      },
    };
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await transactionRoutes(
      app,
      {
        async connect() {
          return client;
        },
      } as unknown as DatabasePool,
      auth,
    );
    try {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/businesses/business-1/transactions/SALE-1",
      });
      assert.equal(
        response.statusCode,
        mode === "unpaid" ? 204 : 409,
        response.body,
      );
      assert.ok(
        !calls.some((s) =>
          /^delete from payments|^delete from payment_allocations/.test(s),
        ),
      );
      if (mode !== "unpaid")
        assert.ok(!calls.some((s) => s.startsWith("delete ")));
      if (mode === "credit")
        assert.ok(
          !response.json().message.includes("Use its financial correction"),
        );
      assert.equal(calls.at(-2), mode === "unpaid" ? "commit" : "rollback");
      assert.equal(calls.at(-1), "release");
    } finally {
      await app.close();
    }
  });
for (const linked of [true, false])
  test(`party type change holds lock through validation and ${linked ? "rollback" : "commit"}`, async () => {
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes("select * from parties"))
          return { rows: [{ id: "party-1", kind: "Customer" }] };
        if (sql.includes("select exists")) return { rows: [{ linked }] };
        return { rows: [] };
      },
      release() {
        calls.push("release");
      },
    };
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await partyRoutes(
      app,
      {
        async connect() {
          return client;
        },
        async query() {
          throw Error("Unlocked query");
        },
      } as unknown as DatabasePool,
      auth,
    );
    try {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/businesses/business-1/parties/party-1",
        payload: {
          kind: "Supplier",
          name: "Test Party",
          phone: "",
          email: "",
          ntn: "",
          address: "",
          paymentTerms: "Net 30",
        },
      });
      assert.equal(response.statusCode, linked ? 400 : 200, response.body);
      assert.equal(calls[0], "begin");
      assert.match(calls[1], /for update/);
      assert.equal(calls.at(-2), linked ? "rollback" : "commit");
      assert.equal(calls.at(-1), "release");
      assert.equal(
        calls.some((s) => s.includes("update parties set")),
        !linked,
      );
    } finally {
      await app.close();
    }
  });
test("invoice DTO publishes credit lock for both source notes and applied credit", async () => {
  const invoice = await invoiceDto(
    {
      async query(sql: string) {
        if (sql.includes("invoice_items")) return { rows: [] } as never;
        assert.match(sql, /credit_notes/);
        assert.match(sql, /credit_uses/);
        return {
          rows: [
            {
              id: "INV-1",
              has_credit_history: true,
              revision: "1",
              total_minor: 10000,
              credited_minor: 0,
              settled_minor: 5000,
              due_date: "2026-12-28",
              status: "Partial",
              subtotal_minor: 10000,
              tax_minor: 0,
              discount_minor: 0,
            },
          ],
        } as never;
      },
    },
    "business-1",
    "INV-1",
  );
  assert.equal(invoice.hasCreditHistory, true);
});
