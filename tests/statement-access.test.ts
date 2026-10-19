import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { statementRoutes } from "../server/routes/statements";
import { loadStatement } from "../server/services/statements";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
test("statement JSON/PDF enforce membership before any database work", async () => {
  for (const status of [401, 404]) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    let touched = false;
    const pool = {
      connect() {
        touched = true;
        throw Error("Unexpected read");
      },
    } as unknown as DatabasePool;
    const auth = {
      async requireMembership() {
        throw new ApiError(status, "DENIED", "Denied");
      },
    } as unknown as Auth;
    await statementRoutes(app, pool, auth);
    try {
      for (const suffix of ["", "/pdf"]) {
        const r = await app.inject(
          `/api/businesses/private/parties/secret/statement${suffix}`,
        );
        assert.equal(r.statusCode, status);
      }
      assert.equal(touched, false);
    } finally {
      await app.close();
    }
  }
});
test("statement rejects invalid date ranges before connecting and scoped missing parties rollback", async () => {
  const calls: string[] = [];
  const pool = {
    async connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          calls.push(sql);
          if (sql.includes("from parties"))
            assert.deepEqual(params, ["missing", "business-1"]);
          return { rows: [] };
        },
        release() {
          calls.push("release");
        },
      };
    },
  } as unknown as DatabasePool;
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await statementRoutes(app, pool, {
    async requireMembership() {},
  } as unknown as Auth);
  try {
    const r = await app.inject(
      "/api/businesses/business-1/parties/missing/statement?from=2026-02-30",
    );
    assert.equal(r.statusCode, 400);
    assert.deepEqual(calls, []);
  } finally {
    await app.close();
  }
  await assert.rejects(
    loadStatement(pool, "business-1", "missing", { from: "", to: "" }),
    /not found/,
  );
  assert.equal(calls[0], "begin isolation level repeatable read read only");
  assert.deepEqual(calls.slice(-2), ["rollback", "release"]);
});

test("statement snapshot reads scoped movements once and never allocation rows", async () => {
  const calls: string[] = [];
  const pool = {
    async connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          calls.push(sql);
          if (sql.includes("from parties")) {
            assert.deepEqual(params, ["party-1", "business-1"]);
            return { rows: [{ name: "Customer", kind: "Customer" }] };
          }
          if (sql.includes("from businesses")) {
            assert.deepEqual(params, ["business-1"]);
            return { rows: [{ name: "Business" }] };
          }
          if (sql.includes("from transactions")) {
            assert.deepEqual(params, ["business-1", "party-1"]);
            return {
              rows: [
                {
                  id: "sale-1",
                  date: "2026-10-10",
                  type: "Sale",
                  total_minor: "4000000",
                  invoice_id: "invoice-1",
                  display_id: "INV-000001",
                },
              ],
            };
          }
          if (sql.includes("from payments")) {
            assert.deepEqual(params, ["business-1", "party-1"]);
            assert.ok(sql.includes("status='Completed'"));
            return {
              rows: [
                {
                  id: "pay-1",
                  date: "2026-10-11",
                  direction: "Received",
                  amount_minor: "5000000",
                  display_id: "PAY-1",
                },
              ],
            };
          }
          return { rows: [] };
        },
        release() {
          calls.push("release");
        },
      };
    },
  } as unknown as DatabasePool;
  const result = await loadStatement(pool, "business-1", "party-1", {
    from: "2026-10-12",
    to: "2026-10-19",
  });
  assert.equal(result.openingMinor, -1000000);
  assert.equal(result.closingMinor, -1000000);
  assert.equal(result.rows.length, 0);
  assert.deepEqual(calls.slice(-2), ["commit", "release"]);
  assert.ok(!calls.some((sql) => sql.includes("payment_allocations")));
});
