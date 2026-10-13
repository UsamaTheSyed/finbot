export interface AllocationTarget {
  transactionId: string;
  displayId: string;
  invoiceId?: string;
  date: string;
  balanceMinor: number;
}
/** Targets arrive ordered by date, creation time, then immutable ID. All money is paisa. */
export function fifoPlan(amountMinor: number, targets: AllocationTarget[]) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
    throw new Error("Invalid allocation amount");
  let advanceMinor = amountMinor;
  const allocations = targets.flatMap((target) => {
    if (!Number.isSafeInteger(target.balanceMinor) || target.balanceMinor < 0)
      throw new Error("Invalid balance");
    const amountMinor = Math.min(advanceMinor, target.balanceMinor);
    advanceMinor -= amountMinor;
    return amountMinor ? [{ ...target, amountMinor }] : [];
  });
  return { allocations, advanceMinor };
}
