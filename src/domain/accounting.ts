import { safeMinor, sumMinor } from "../utils/money.js";
export interface JournalLine {
  account: string;
  amountMinor: number;
}
export interface Journal {
  description?: string;
  invoiceId?: string;
  source: string;
  date: string;
  lines: JournalLine[];
}
export function journalBalances(journals: Journal[], from: string, to: string) {
  const accounts = new Map<
    string,
    {
      account: string;
      opening: number;
      debit: number;
      credit: number;
      closing: number;
    }
  >();
  for (const j of journals) {
    if (j.date > to) continue;
    for (const l of j.lines) {
      const row = accounts.get(l.account) || {
          account: l.account,
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        },
        amount = safeMinor(l.amountMinor);
      if (j.date < from) row.opening = sumMinor([row.opening, amount]);
      else if (amount >= 0) row.debit = sumMinor([row.debit, amount]);
      else row.credit = sumMinor([row.credit, -amount]);
      row.closing = sumMinor([row.opening, row.debit, -row.credit]);
      accounts.set(l.account, row);
    }
  }
  return [...accounts.values()].sort((a, b) =>
    a.account.localeCompare(b.account),
  );
}
export function profitAmounts(journals: Journal[], from: string, to: string) {
  const balances = journalBalances(
    journals.filter((j) => j.source !== "opening" && j.date >= from),
    from,
    to,
  );
  const value = (name: string) =>
    balances.find((a) => a.account === name)?.closing || 0;
  const revenue = -value("Sales revenue"),
    cogs = value("Cost of goods sold"),
    expenses = value("Untracked purchase expense"),
    adjustments = value("Inventory adjustments");
  return {
    revenue,
    cogs,
    expenses,
    adjustments,
    profit: sumMinor([revenue, -cogs, -expenses, -adjustments]),
  };
}
