import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPayment,
  paymentSchema,
  editSchema,
  filterTransactions,
} from "../src/features/transactions/domain";
import { transactions, parties } from "../src/services/mock/data";
const transaction = transactions[0];
const input = { amount: 1000, method: "Cash" as const, date: "2026-11-28" };
test("partial payment updates amounts without mutating the original", () => {
  const updated = applyPayment(transaction, input);
  assert.equal(updated.paid, 26000);
  assert.equal(updated.balance, 16000);
  assert.equal(updated.status, "Partial");
  assert.equal(transaction.paid, 25000);
});
test("full balance payment completes a transaction", () => {
  const updated = applyPayment(transaction, {
    ...input,
    amount: transaction.balance,
  });
  assert.equal(updated.balance, 0);
  assert.equal(updated.status, "Completed");
});
test("overpayments and invalid money values are rejected", () => {
  assert.throws(() =>
    applyPayment(transaction, { ...input, amount: 17000.01 }),
  );
  for (const amount of [0, -1, NaN, Infinity, 1.001]) {
    assert.equal(paymentSchema.safeParse({ ...input, amount }).success, false);
  }
});
test("invalid calendar dates are rejected", () => {
  assert.equal(
    editSchema.safeParse({ date: "2026-02-30", notes: "" }).success,
    false,
  );
  assert.equal(
    editSchema.safeParse({ date: "2028-02-29", notes: "" }).success,
    true,
  );
});
test("filters combine date, party, type, status and case-insensitive search", () => {
  const names = new Map(parties.map((p) => [p.id, p.name]));
  const result = filterTransactions(
    transactions,
    {
      type: "Sale",
      partyId: "party-1",
      status: "Partial",
      from: "2026-11-28",
      to: "2026-11-28",
      search: "ahmed",
      page: 1,
      pageSize: 10,
    },
    names,
  );
  assert.deepEqual(
    result.map((row) => row.id),
    ["SALE-000128"],
  );
  assert.equal(
    filterTransactions(
      transactions,
      { status: "Unpaid", page: 1, pageSize: 10 },
      names,
    ).length,
    0,
  );
});
