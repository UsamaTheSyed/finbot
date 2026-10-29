import { safeMinor, sumMinor } from "../utils/money.js";

/** Net each account before splitting debit/credit; do not use gross turnover. */
export function trialBalance(accounts: { account: string; closing: number }[]) {
  const net = new Map<string, number>();
  for (const row of accounts)
    net.set(
      row.account,
      sumMinor([net.get(row.account) || 0, safeMinor(row.closing)]),
    );
  const rows = [...net]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, balance]) => ({
      account,
      debit: Math.max(balance, 0),
      credit: Math.max(-balance, 0),
    }));
  const debit = sumMinor(rows.map((r) => r.debit));
  const credit = sumMinor(rows.map((r) => r.credit));
  const difference = sumMinor([debit, -credit]);
  return { rows, debit, credit, difference, balanced: difference === 0 };
}
