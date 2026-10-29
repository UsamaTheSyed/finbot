import test from "node:test";
import assert from "node:assert/strict";
import { journalBalances } from "../src/domain/accounting";
import { trialBalance } from "../src/domain/trialBalance";
import { trialBalanceCsv } from "../src/utils/trialBalanceExport";
test("trial balance includes opening, nets accounts and excludes future journals", () => {
  const accounts = journalBalances(
    [
      {
        source: "opening",
        date: "2026-10-01",
        lines: [
          { account: "Cash", amountMinor: 10000 },
          { account: "Equity", amountMinor: -10000 },
        ],
      },
      {
        source: "sale",
        date: "2026-10-02",
        lines: [
          { account: "Cash", amountMinor: 2000 },
          { account: "Revenue", amountMinor: -2000 },
        ],
      },
      {
        source: "payment",
        date: "2026-10-02",
        lines: [
          { account: "Cash", amountMinor: -500 },
          { account: "Expense", amountMinor: 500 },
        ],
      },
      {
        source: "future",
        date: "2026-10-03",
        lines: [{ account: "Cash", amountMinor: 999 }],
      },
    ],
    "2026-10-02",
    "2026-10-02",
  );
  const r = trialBalance(accounts);
  assert.deepEqual(
    r.rows.find((r) => r.account === "Cash"),
    { account: "Cash", debit: 11500, credit: 0 },
  );
  assert.equal(r.debit, 12000);
  assert.equal(r.credit, 12000);
  assert.equal(r.difference, 0);
});
test("opposite and duplicate balances net without a balancing plug", () => {
  const r = trialBalance([
    { account: "Control", closing: -101 },
    { account: "Control", closing: 1 },
    { account: "Zero", closing: 0 },
  ]);
  assert.equal(r.credit, 100);
  assert.equal(r.debit, 0);
  assert.equal(r.balanced, false);
  assert.equal(r.difference, -100);
  assert.equal(r.rows.length, 2);
});
test("unsafe money fails instead of silently rounding", () => {
  assert.throws(() => trialBalance([{ account: "A", closing: 0.1 }]));
  assert.throws(() =>
    trialBalance([
      { account: "A", closing: Number.MAX_SAFE_INTEGER },
      { account: "B", closing: 1 },
    ]),
  );
});
test("CSV preserves exact paisa, cutoff, warning and formula protection", () => {
  const csv = trialBalanceCsv(
    trialBalance([{ account: '=Bad,"name"', closing: 101 }]),
    "2026-10-02",
    "2026-10-01",
    ["Pending valuation"],
  );
  assert.ok(csv.includes('"1.01"'));
  assert.ok(csv.includes('"\'=Bad,""name"""'));
  assert.ok(csv.includes("Pending valuation"));
  assert.ok(csv.includes("Out of balance"));
  assert.ok(csv.includes("2026-10-01"));
});
