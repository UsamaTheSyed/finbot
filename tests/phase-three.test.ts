import test from "node:test";
import assert from "node:assert/strict";
import { financialReportService } from "../src/services/financialReportService";
import { settingsService } from "../src/services/settingsService";
import { authService } from "../src/services/authService";
import { reportCsv, csvCell } from "../src/utils/reportExport";
import { getAgingBucket } from "../src/domain/reportCalculations";
import { partyService } from "../src/services/partyService";
import { invoiceService } from "../src/services/invoiceService";
import { paymentService } from "../src/services/paymentService";

test("daily summary derives sales and settled cash from the shared ledger", async () => {
  const report = await financialReportService.get(
    "business-1",
    "daily",
    "2026-11-28",
  );
  assert.deepEqual(
    report?.lines.map((line) => [line.label, line.amount]),
    [
      ["Sales Today", 42000],
      ["Purchases Today", 0],
      ["Cash In", 25000],
      ["Cash Out", 0],
      ["Net Cash", 25000],
    ],
  );
  assert.equal(
    await financialReportService.get("unknown", "daily", "2026-11-28"),
    null,
  );
  assert.equal(
    await financialReportService.get("business-1", "daily", "2027-01-01"),
    null,
  );
});

test("A/R aging assigns each balance once and reconciles its grand total", async () => {
  assert.equal(getAgingBucket("2026-11-30", "2026-11-30"), "current");
  assert.equal(getAgingBucket("2026-11-01", "2026-11-30"), "thirty");
  assert.equal(getAgingBucket("2026-10-01", "2026-11-30"), "sixty");
  assert.equal(getAgingBucket("2026-09-01", "2026-11-30"), "ninety");
  const report = await financialReportService.get(
    "business-1",
    "ar-aging",
    "2026-11",
  );
  const rows = report!.aging.slice(0, -1);
  for (const row of rows)
    assert.equal(row.current + row.thirty + row.sixty + row.ninety, row.total);
  assert.equal(
    report!.aging.at(-1)?.total,
    rows.reduce((sum, row) => sum + row.total, 0),
  );
});

test("P&L and cash flow reconcile without fabricated expense categories", async () => {
  const profit = await financialReportService.get(
    "business-1",
    "profit-loss",
    "2026-11",
  );
  const values = new Map(
    profit!.lines.map((line) => [line.label, line.amount]),
  );
  assert.equal(values.get("Other Income"), 0);
  assert.equal(values.get("Operating Expenses"), 0);
  assert.equal(
    values.get("NET PROFIT"),
    values.get("Total Revenue")! - values.get("Total Expenses")!,
  );
  const cash = await financialReportService.get(
    "business-1",
    "cash-flow",
    "2026-11",
  );
  const cashValues = new Map(
    cash!.lines.map((line) => [line.label, line.amount]),
  );
  assert.equal(
    cashValues.get("Closing Balance"),
    cashValues.get("Opening Balance")! +
      cashValues.get("Cash In")! -
      cashValues.get("Cash Out")!,
  );
  let running = cashValues.get("Opening Balance")!;
  for (const row of [...cash!.cash].reverse()) {
    running += row.incoming - row.outgoing;
    assert.equal(row.balance, running);
  }
});

test("invoice and payment mutations immediately update every relevant report", async () => {
  const revenueBefore =
    (
      await financialReportService.get("business-1", "profit-loss", "2026-12")
    )?.lines.find((line) => line.label === "Total Revenue")?.amount || 0;
  const agingBefore =
    (
      await financialReportService.get("business-1", "ar-aging", "2026-12")
    )?.aging.at(-1)?.total || 0;
  const party = await partyService.createParty("business-1", {
    kind: "Customer",
    name: "Report Mutation Customer",
    phone: "03000000000",
    email: "report@example.com",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const invoice = await invoiceService.createInvoice("business-1", {
    partyId: party.id,
    date: "2026-12-05",
    dueDate: "2026-12-20",
    reference: "REPORT-MUTATION",
    items: [
      {
        item: "Ledger goods",
        description: "Report integration test",
        quantity: 1,
        unit: "Lot",
        rate: 1000,
        taxPercent: 0,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
  });
  assert.equal(
    (
      await financialReportService.get("business-1", "profit-loss", "2026-12")
    )?.lines.find((line) => line.label === "Total Revenue")?.amount,
    revenueBefore + 1000,
  );
  assert.equal(
    (
      await financialReportService.get("business-1", "ar-aging", "2026-12")
    )?.aging.at(-1)?.total,
    agingBefore + 1000,
  );
  await paymentService.createPayment("business-1", {
    direction: "Received",
    partyId: party.id,
    invoiceId: invoice.id,
    amount: 1000,
    method: "Cash",
    date: "2026-12-05",
    reference: "REPORT-PAYMENT",
    notes: "",
  });
  assert.equal(
    (
      await financialReportService.get("business-1", "daily", "2026-12-05")
    )?.lines.find((line) => line.label === "Cash In")?.amount,
    1000,
  );
  assert.equal(
    (
      await financialReportService.get("business-1", "ar-aging", "2026-12")
    )?.aging.at(-1)?.total || 0,
    agingBefore,
  );
});
test("report CSV labels demo data, preserves quotes and protects formula cells", async () => {
  const report = await financialReportService.get(
    "business-1",
    "ar-aging",
    "2026-11",
  );
  const csv = reportCsv(report!);
  assert.match(csv, /FinBot workspace report/);
  assert.match(csv, /79500/);
  assert.match(csv, /Ahmed Khan/);
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
});
test("profile validation rejects invalid saves and successful edits update workspace names", async () => {
  const old = await settingsService.get("business-1");
  assert.throws(() =>
    settingsService.update("business-1", { ...old, email: "bad" }),
  );
  await assert.rejects(settingsService.get("unknown"), /not found/);
  await settingsService.update("business-1", {
    ...old,
    name: "Updated Enterprise",
  });
  assert.equal(
    (await authService.session()).businesses[0].name,
    "Updated Enterprise",
  );
  assert.equal(
    (await settingsService.get("business-1")).name,
    "Updated Enterprise",
  );
  await settingsService.update("business-1", old);
});
