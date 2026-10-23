import { safeMinor, sumMinor } from "../utils/money.js";

/** Planning only. Posting must lock and re-read all balances in one transaction. */
export interface CreditDocument {
  id: string;
  partyId: string;
  businessId: string;
  kind: "Customer" | "Supplier";
  status: "Draft" | "Issued";
  revision: string;
  date: string;
  grossMinor: number;
  creditedMinor: number;
  allocatedMinor: number;
}
export interface CreditLot {
  id: string;
  businessId: string;
  partyId: string;
  kind: "Customer" | "Supplier";
  date: string;
  fundedMinor: number;
  appliedMinor: number;
  refundedMinor: number;
}
export interface CreditScope {
  businessId: string;
  partyId: string;
  kind: "Customer" | "Supplier";
}
const nonnegative = (value: number) => {
  safeMinor(value);
  if (value < 0) throw Error("Money cannot be negative.");
  return value;
};
const positive = (value: number) => {
  if (nonnegative(value) === 0)
    throw Error("Amount must be greater than zero.");
  return value;
};
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid date.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid date.");
  return value;
}
function scoped(scope: CreditScope, record: CreditScope) {
  if (
    scope.businessId !== record.businessId ||
    scope.partyId !== record.partyId ||
    scope.kind !== record.kind
  )
    throw Error("Credit belongs to a different party or workspace.");
}
export function planCreditNote(
  document: CreditDocument,
  value: {
    revision: string;
    amountMinor: number;
    effectiveDate: string;
  },
  today: string,
) {
  if (document.status !== "Issued")
    throw Error("Issue the draft before creating a credit note.");
  if (document.revision !== value.revision)
    throw Error("Document changed. Review the credit again.");
  if (
    date(value.effectiveDate) !== date(today) ||
    value.effectiveDate < date(document.date)
  )
    throw Error(
      "Credit date must be today's workspace date and cannot precede the document.",
    );
  const gross = nonnegative(document.grossMinor),
    credited = nonnegative(document.creditedMinor),
    allocated = nonnegative(document.allocatedMinor);
  if (credited > gross)
    throw Error("Existing credits exceed the document total.");
  const net = gross - credited;
  if (allocated > net)
    throw Error("Existing allocations exceed the net document total.");
  const amount = positive(value.amountMinor);
  if (amount > net) throw Error("Credit exceeds the remaining document value.");
  const balance = net - allocated;
  const debtReductionMinor = Math.min(balance, amount);
  const fundedCreditMinor = amount - debtReductionMinor;
  return {
    documentId: document.id,
    creditMinor: amount,
    debtReductionMinor,
    fundedCreditMinor,
    netTotalMinor: net - amount,
    allocatedMinor: allocated - fundedCreditMinor,
    balanceMinor: balance - debtReductionMinor,
    cashMovementMinor: 0 as const,
    refundDirection:
      document.kind === "Customer" ? ("Sent" as const) : ("Received" as const),
  };
}
export function availableCredit(lot: CreditLot) {
  date(lot.date);
  const funded = nonnegative(lot.fundedMinor);
  const used = sumMinor([
    nonnegative(lot.appliedMinor),
    nonnegative(lot.refundedMinor),
  ]);
  if (used > funded) throw Error("Credit has been over-consumed.");
  return funded - used;
}
export function planCreditUse(
  scope: CreditScope,
  lots: CreditLot[],
  amountMinor: number,
  effectiveDate: string,
) {
  positive(amountMinor);
  date(effectiveDate);
  const seen = new Set<string>();
  for (const lot of lots) {
    scoped(scope, lot);
    if (seen.has(lot.id)) throw Error("Duplicate credit lot.");
    seen.add(lot.id);
    availableCredit(lot);
  }
  const eligible = lots
    .filter((l) => l.date <= effectiveDate)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const availableMinor = sumMinor(eligible.map(availableCredit));
  if (amountMinor > availableMinor)
    throw Error("Amount exceeds available funded credit.");
  let remaining = amountMinor;
  const allocations: { creditId: string; amountMinor: number }[] = [];
  for (const lot of eligible) {
    const amount = Math.min(availableCredit(lot), remaining);
    if (amount) allocations.push({ creditId: lot.id, amountMinor: amount });
    remaining -= amount;
    if (!remaining) break;
  }
  return {
    allocations,
    amountMinor,
    remainingCreditMinor: availableMinor - amountMinor,
  };
}
export function planRefund(
  scope: CreditScope,
  lots: CreditLot[],
  amountMinor: number,
  effectiveDate: string,
  today: string,
) {
  if (date(effectiveDate) !== date(today))
    throw Error("Refund must use today's workspace date.");
  const use = planCreditUse(scope, lots, amountMinor, effectiveDate);
  return {
    ...use,
    direction:
      scope.kind === "Customer" ? ("Sent" as const) : ("Received" as const),
    cashDeltaMinor: scope.kind === "Customer" ? -amountMinor : amountMinor,
  };
}
export function planCreditApplication(
  scope: CreditScope,
  lots: CreditLot[],
  target: CreditDocument,
  amountMinor: number,
  effectiveDate: string,
  today: string,
) {
  scoped(scope, target);
  if (target.status !== "Issued")
    throw Error("Credit cannot be applied to a draft.");
  if (date(effectiveDate) !== date(today) || effectiveDate < date(target.date))
    throw Error("Invalid credit application date.");
  const net =
    nonnegative(target.grossMinor) - nonnegative(target.creditedMinor);
  const allocated = nonnegative(target.allocatedMinor);
  if (net < allocated) throw Error("Invalid target balance.");
  if (positive(amountMinor) > net - allocated)
    throw Error("Credit exceeds the outstanding balance.");
  return {
    ...planCreditUse(scope, lots, amountMinor, effectiveDate),
    documentId: target.id,
    allocatedMinor: sumMinor([allocated, amountMinor]),
    balanceMinor: net - allocated - amountMinor,
    cashMovementMinor: 0 as const,
  };
}
