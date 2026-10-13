import test from "node:test";
import assert from "node:assert/strict";
import { fifoPlan } from "../server/domain/allocation";
import { paymentInput } from "../server/domain/validation";
const targets = [
  {
    transactionId: "old",
    displayId: "INV-1",
    date: "2026-10-10",
    balanceMinor: 4000000,
  },
  {
    transactionId: "next",
    displayId: "INV-2",
    date: "2026-10-20",
    balanceMinor: 3000000,
  },
];
test("customer receipt allocates oldest first and retains exact advance", () => {
  assert.deepEqual(
    fifoPlan(5000000, targets).allocations.map((a) => a.amountMinor),
    [4000000, 1000000],
  );
  assert.equal(fifoPlan(5000000, targets.slice(0, 1)).advanceMinor, 1000000);
  assert.equal(targets[0].balanceMinor, 4000000);
});
test("supplier payment applies same allocation rule without changing cash amount", () => {
  const p = fifoPlan(10000000, [{ ...targets[0], balanceMinor: 8000000 }]);
  assert.equal(p.allocations[0].amountMinor, 8000000);
  assert.equal(p.advanceMinor, 2000000);
});
test("allocation conserves paisa for partial, settled and empty target lists", () => {
  for (let amount = 0; amount < 10000; amount += 137) {
    const p = fifoPlan(amount, [
      { ...targets[0], balanceMinor: 0 },
      { ...targets[1], balanceMinor: 4351 },
    ]);
    assert.equal(
      p.advanceMinor + p.allocations.reduce((s, a) => s + a.amountMinor, 0),
      amount,
    );
    assert.ok(
      p.allocations.every(
        (a) => a.amountMinor > 0 && a.amountMinor <= a.balanceMinor,
      ),
    );
  }
  assert.equal(fifoPlan(250, []).advanceMinor, 250);
  for (const value of [-1, NaN, Infinity, 1.5])
    assert.throws(() => fifoPlan(value, targets));
});
test("payment schema preserves explicit FIFO choice and rejects invalid mode", () => {
  const input = {
    partyId: "p",
    invoiceId: "",
    amount: 50000,
    method: "Cash",
    direction: "Received",
    date: "2026-10-12",
    reference: "",
    notes: "",
  };
  assert.equal(
    paymentInput.parse({ ...input, allocationMode: "fifo" }).allocationMode,
    "fifo",
  );
  assert.equal(paymentInput.parse(input).allocationMode, undefined);
  assert.equal(
    paymentInput.safeParse({ ...input, allocationMode: "anything" }).success,
    false,
  );
});
