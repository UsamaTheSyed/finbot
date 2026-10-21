import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { salesReport } from "../src/domain/ledgerReports";
import { mockLedgerReport } from "../src/domain/mockLedgerReports";
import { reportCsv } from "../src/utils/reportExport";
import { reportRoutes } from "../server/routes/reports";
import { salesApReport } from "../server/services/salesApReports";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
import type { Transaction, Party } from "../src/types";

test("purchase report sums paisa, preserves bill IDs and escapes CSV", () => {
  const row = {
    id: "PUR-1",
    displayId: "INV-000021",
    invoiceId: "internal-id",
    date: "2026-10-01",
    party: '=Supplier "One"',
    subtotalMinor: 30030,
    discountMinor: 1000,
    taxMinor: 1502,
    totalMinor: 30532,
  };
  const r = salesReport(
    "2026-10",
    [
      row,
      { ...row, id: "PUR-2", date: "2026-10-31" },
      { ...row, id: "outside", date: "2026-11-01" },
    ],
    "purchases",
  )!;
  assert.equal(r.kind, "purchases");
  assert.equal(r.sales, undefined);
  assert.equal(r.purchases!.length, 2);
  assert.equal(r.lines.at(-1)!.amount, 610.64);
  assert.equal(r.purchases![0].invoiceId, "internal-id");
  const csv = reportCsv(r);
  assert.match(csv, /"Supplier"/);
  assert.match(csv, /'=Supplier ""One""/);
  assert.doesNotMatch(csv, /"Customer"/);
  assert.equal(salesReport("2026-11", [row], "purchases"), null);
  assert.equal(salesReport("2026-10", [row])!.kind, "sales");
});
test("mock purchases exclude sales and other workspaces; payment status does not change purchase totals", () => {
  const p = {
    id: "p",
    businessId: "b",
    name: "Supplier",
    kind: "Supplier",
  } as Party;
  const t = {
    id: "PUR-1",
    businessId: "b",
    type: "Purchase",
    partyId: "p",
    date: "2026-10-01",
    subtotal: 100,
    tax: 5,
    discount: 10,
    total: 95,
    paid: 95,
    status: "Completed",
  } as Transaction;
  const r = mockLedgerReport(
    "b",
    "purchases",
    "2026-10",
    [
      t,
      { ...t, id: "SALE-1", type: "Sale" },
      { ...t, id: "private", businessId: "private" },
    ],
    [],
    [p],
    [],
  )!;
  assert.equal(r.purchases!.length, 1);
  assert.equal(r.purchases![0].total, 95);
  assert.equal(r.lines.at(-1)!.amount, 95);
});
test("purchase service scopes and parameterizes transaction type and period", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as DatabasePool;
  assert.equal(await salesApReport(pool, "b", "purchases", "2026-10"), null);
  assert.deepEqual(calls[0].params, [
    "b",
    "2026-10-01",
    "2026-10-31",
    "Purchase",
  ]);
  assert.match(calls[0].sql, /t.business_id=\$1 and t.type=\$4/);
  assert.doesNotMatch(calls[0].sql, /join payments|join transaction_items/i);
});
test("purchase route enforces membership and rejects invalid months before reads", async () => {
  for (const code of [401, 404, 200]) {
    let reads = 0;
    const pool = {
      async query() {
        reads++;
        return { rows: [] };
      },
    } as unknown as DatabasePool;
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await reportRoutes(app, pool, {
      async requireMembership() {
        if (code !== 200) throw new ApiError(code, "DENIED", "Denied");
      },
    } as unknown as Auth);
    try {
      const r = await app.inject(
        "/api/businesses/b/reports/purchases?period=2026-13",
      );
      assert.equal(r.statusCode, code === 200 ? 400 : code);
      assert.equal(reads, 0);
      if (code === 200) {
        const ok = await app.inject(
          "/api/businesses/b/reports/purchases?period=2026-10",
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.json(), null);
        assert.equal(reads, 1);
      }
    } finally {
      await app.close();
    }
  }
});
