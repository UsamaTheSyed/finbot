import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  payableAging,
  salesReport,
  reportMonthBounds,
} from "../src/domain/ledgerReports";
import { mockLedgerReport } from "../src/domain/mockLedgerReports";
import { reportCsv } from "../src/utils/reportExport";
import { reportRoutes } from "../server/routes/reports";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
import type { Invoice, Party, Payment } from "../src/types";

test("sales sums exact paisa once and respects inclusive month boundaries", () => {
  const row = {
    id: "SALE-1",
    displayId: "INV-1",
    date: "2026-11-01",
    party: "=Customer",
    subtotalMinor: 101,
    discountMinor: 1,
    taxMinor: 5,
    totalMinor: 105,
  };
  const report = salesReport("2026-11", [
    row,
    { ...row, id: "SALE-2", date: "2026-11-30" },
    { ...row, id: "excluded", date: "2026-12-01" },
  ])!;
  assert.equal(report.sales!.length, 2);
  assert.equal(report.lines.at(-1)!.amount, 2.1);
  assert.equal(report.lines[0].amount, 2.02);
  assert.match(reportCsv(report), /'=Customer/);
  assert.equal(salesReport("2027-01", [row]), null);
});
test("AP buckets cover current, 1–30, 31–60 and 61+ days and separate equal names", () => {
  const row = {
    partyId: "one",
    party: "Same name",
    date: "2026-01-01",
    balanceMinor: 101,
  };
  const report = payableAging("2026-11", [
    { ...row, dueDate: "2026-11-30" },
    { ...row, dueDate: "2026-11-29" },
    { ...row, dueDate: "2026-10-31" },
    { ...row, dueDate: "2026-10-30" },
    { ...row, dueDate: "2026-10-01" },
    { ...row, dueDate: "2026-09-30" },
    { ...row, partyId: "two", dueDate: "2026-12-01" },
    { ...row, date: "2026-12-01", dueDate: "2026-12-01" },
    { ...row, dueDate: "2026-11-01", balanceMinor: 0 },
  ])!;
  assert.equal(report.aging.length, 3);
  assert.deepEqual(report.aging[0], {
    partyId: "one",
    party: "Same name",
    current: 1.01,
    thirty: 2.02,
    sixty: 2.02,
    ninety: 1.01,
    total: 6.06,
  });
  assert.equal(report.aging.at(-1)!.total, 7.07);
  assert.match(reportCsv(report), /31–60 Days/);
});
test("AP cutoff ignores future settlements, drafts, customers and other workspaces", () => {
  const party = {
    id: "supplier",
    businessId: "b",
    name: "Supplier",
    kind: "Supplier",
  } as Party;
  const bill = {
    id: "i",
    transactionId: "t",
    businessId: "b",
    partyId: "supplier",
    date: "2026-10-01",
    dueDate: "2026-10-31",
    status: "Paid",
    totalMinor: 8000000,
  } as Invoice;
  const payment = {
    id: "p",
    businessId: "b",
    partyId: "supplier",
    direction: "Sent",
    status: "Completed",
    amountMinor: 10000000,
    date: "2026-10-10",
    allocations: [
      {
        transactionId: "t",
        invoiceId: "i",
        displayId: "i",
        amountMinor: 8000000,
        effectiveDate: "2026-11-01",
      },
    ],
  } as Payment;
  const invoices = [
    bill,
    { ...bill, id: "draft", status: "Draft" as const },
    { ...bill, id: "private", businessId: "private" },
  ];
  assert.equal(
    mockLedgerReport(
      "b",
      "ap-aging",
      "2026-10",
      [],
      invoices,
      [party],
      [payment],
    )!.aging.at(-1)!.total,
    80000,
  );
  assert.equal(
    mockLedgerReport(
      "b",
      "ap-aging",
      "2026-11",
      [],
      invoices,
      [party],
      [payment],
    ),
    null,
  );
  assert.equal(
    mockLedgerReport(
      "b",
      "ap-aging",
      "2026-10",
      [],
      [bill],
      [{ ...party, kind: "Customer" }],
      [],
    ),
    null,
  );
});
test("report month rejects impossible dates and handles leap years", () => {
  assert.equal(reportMonthBounds("2028-02").end, "2028-02-29");
  for (const bad of ["2026-13", "2026-00", "2026-11-01", "bad", "0000-01"])
    assert.throws(() => reportMonthBounds(bad));
});
test("sales/AP API enforces membership and period validation before queries", async () => {
  for (const status of [401, 404, 200]) {
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
        if (status !== 200) throw new ApiError(status, "DENIED", "Denied");
      },
    } as unknown as Auth);
    try {
      for (const kind of ["sales", "ap-aging"]) {
        const result = await app.inject(
          `/api/businesses/b/reports/${kind}?period=2026-13`,
        );
        assert.equal(result.statusCode, status === 200 ? 400 : status);
      }
      assert.equal(reads, 0);
      if (status === 200)
        for (const kind of ["sales", "ap-aging"]) {
          const r = await app.inject(
            `/api/businesses/b/reports/${kind}?period=2026-11`,
          );
          assert.equal(r.statusCode, 200);
          assert.equal(r.json(), null);
        }
    } finally {
      await app.close();
    }
  }
});
