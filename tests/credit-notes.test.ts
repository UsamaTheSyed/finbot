import test from "node:test";
import assert from "node:assert/strict";
import {
  planCreditNote,
  planRefund,
  planCreditUse,
  planCreditApplication,
  availableCredit,
  type CreditDocument,
  type CreditLot,
} from "../src/domain/creditNotes";
import {
  creditNoteInput,
  creditRefundInput,
} from "../server/domain/creditNoteInput";
const document: CreditDocument = {
  id: "INV-1",
  businessId: "b",
  partyId: "p",
  kind: "Customer",
  status: "Issued",
  revision: "1",
  date: "2026-10-10",
  grossMinor: 100000,
  creditedMinor: 0,
  allocatedMinor: 80000,
};
const scope = { businessId: "b", partyId: "p", kind: "Customer" as const };
const lot = (id: string, date = "2026-10-20"): CreditLot => ({
  ...scope,
  id,
  date,
  fundedMinor: 20000,
  appliedMinor: 0,
  refundedMinor: 0,
});
const credit = (amountMinor: number) => ({
  revision: "1",
  amountMinor,
  effectiveDate: "2026-10-22",
});
test("unpaid credit reduces debt without manufacturing refundable cash", () => {
  const plan = planCreditNote(
    { ...document, allocatedMinor: 0 },
    credit(50000),
    "2026-10-22",
  );
  assert.equal(plan.debtReductionMinor, 50000);
  assert.equal(plan.fundedCreditMinor, 0);
  assert.equal(plan.balanceMinor, 50000);
  assert.equal(plan.cashMovementMinor, 0);
});
test("partially paid credit separates debt reduction from funded excess exactly", () => {
  const before = structuredClone(document),
    plan = planCreditNote(document, credit(50000), "2026-10-22");
  assert.deepEqual(
    [
      plan.debtReductionMinor,
      plan.fundedCreditMinor,
      plan.netTotalMinor,
      plan.allocatedMinor,
      plan.balanceMinor,
    ],
    [20000, 30000, 50000, 50000, 0],
  );
  assert.deepEqual(document, before);
});
test("customer and supplier credits use opposite refund directions and the same arithmetic", () => {
  for (const kind of ["Customer", "Supplier"] as const) {
    const plan = planCreditNote(
      { ...document, kind, allocatedMinor: 100000 },
      credit(30000),
      "2026-10-22",
    );
    assert.equal(plan.fundedCreditMinor, 30000);
    assert.equal(
      plan.refundDirection,
      kind === "Customer" ? "Sent" : "Received",
    );
    const refund = planRefund(
      { ...scope, kind },
      [{ ...lot("c"), kind, fundedMinor: 30000 }],
      10000,
      "2026-10-22",
      "2026-10-22",
    );
    assert.equal(refund.cashDeltaMinor, kind === "Customer" ? -10000 : 10000);
    assert.equal(refund.remainingCreditMinor, 20000);
  }
});
test("draft, stale, excessive, zero, negative, fractional and backdated credits reject", () => {
  for (const n of [0, -1, 0.5, 100001, NaN, Infinity])
    assert.throws(() => planCreditNote(document, credit(n), "2026-10-22"));
  assert.throws(() =>
    planCreditNote({ ...document, status: "Draft" }, credit(1), "2026-10-22"),
  );
  assert.throws(() =>
    planCreditNote({ ...document, revision: "2" }, credit(1), "2026-10-22"),
  );
  assert.throws(() => planCreditNote(document, credit(1), "2026-10-23"));
  assert.throws(() =>
    planCreditNote(
      { ...document, creditedMinor: 100001 },
      credit(1),
      "2026-10-22",
    ),
  );
});
test("credit consumption is oldest first, deterministic and does not mutate balances", () => {
  const lots = [lot("b", "2026-10-21"), lot("a")],
    before = structuredClone(lots);
  const plan = planCreditUse(scope, lots, 25000, "2026-10-22");
  assert.deepEqual(plan.allocations, [
    { creditId: "a", amountMinor: 20000 },
    { creditId: "b", amountMinor: 5000 },
  ]);
  assert.equal(plan.remainingCreditMinor, 15000);
  assert.deepEqual(lots, before);
});
test("refunded and applied credit cannot be reused and future credit cannot fund a refund", () => {
  const used = { ...lot("c"), appliedMinor: 10000, refundedMinor: 5000 };
  assert.equal(availableCredit(used), 5000);
  assert.throws(() =>
    planRefund(scope, [used], 5001, "2026-10-22", "2026-10-22"),
  );
  assert.throws(() =>
    planRefund(
      scope,
      [lot("future", "2026-10-23")],
      1,
      "2026-10-22",
      "2026-10-22",
    ),
  );
  assert.throws(() => availableCredit({ ...used, refundedMinor: 11000 }));
});
test("credit application settles another issued invoice without changing cash", () => {
  const plan = planCreditApplication(
    scope,
    [lot("c")],
    document,
    20000,
    "2026-10-22",
    "2026-10-22",
  );
  assert.equal(plan.balanceMinor, 0);
  assert.equal(plan.allocatedMinor, 100000);
  assert.equal(plan.cashMovementMinor, 0);
  assert.throws(() =>
    planCreditApplication(
      scope,
      [lot("c")],
      document,
      20001,
      "2026-10-22",
      "2026-10-22",
    ),
  );
  assert.throws(() =>
    planCreditApplication(
      scope,
      [lot("c")],
      { ...document, status: "Draft" },
      1,
      "2026-10-22",
      "2026-10-22",
    ),
  );
});
test("cross-workspace, cross-party, wrong-kind and duplicate funding are rejected", () => {
  for (const bad of [
    { ...lot("c"), businessId: "other" },
    { ...lot("c"), partyId: "other" },
    { ...lot("c"), kind: "Supplier" as const },
  ])
    assert.throws(() => planCreditUse(scope, [bad], 1, "2026-10-22"));
  assert.throws(() =>
    planCreditUse(scope, [lot("c"), lot("c")], 1, "2026-10-22"),
  );
  assert.throws(() =>
    planCreditApplication(
      scope,
      [lot("c")],
      { ...document, partyId: "other" },
      1,
      "2026-10-22",
      "2026-10-22",
    ),
  );
});
test("credit plans conserve paisa over full and partial credits", () => {
  for (let paid = 0; paid <= 100; paid += 5)
    for (let amount = 1; amount <= 100; amount++) {
      const p = planCreditNote(
        { ...document, grossMinor: 100, allocatedMinor: paid },
        credit(amount),
        "2026-10-22",
      );
      assert.equal(p.debtReductionMinor + p.fundedCreditMinor, amount);
      assert.equal(p.allocatedMinor + p.balanceMinor, p.netTotalMinor);
      assert.equal(p.allocatedMinor + p.fundedCreditMinor, paid);
      assert.ok(p.balanceMinor >= 0 && p.allocatedMinor >= 0);
    }
});
test("schemas require idempotency, reason and integer paisa and reject injected direction", () => {
  const value = {
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    invoiceId: "INV-1",
    revision: "1",
    amountMinor: 100,
    subtotalMinor: 100,
    taxMinor: 0,
    discountMinor: 0,
    effectiveDate: "2026-10-22",
    reason: "Wrong rate",
  };
  assert.equal(creditNoteInput.safeParse(value).success, true);
  for (const bad of [
    { ...value, amountMinor: 0.5 },
    { ...value, requestId: "" },
    { ...value, reason: "" },
    { ...value, effectiveDate: "2026-02-30" },
    { ...value, direction: "Received" },
  ])
    assert.equal(creditNoteInput.safeParse(bad).success, false);
  assert.equal(
    creditRefundInput.safeParse({
      requestId: value.requestId,
      partyId: "p",
      amountMinor: 100,
      effectiveDate: value.effectiveDate,
      reason: value.reason,
      method: "Cash",
      reference: "R-1",
    }).success,
    true,
  );
});
