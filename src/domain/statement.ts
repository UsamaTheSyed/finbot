import { accountStatement } from "./accountStatement";
import type { Payment, Transaction } from "../types";
import { toMinor } from "../utils/money";
export function buildStatement(
  transactions: Transaction[],
  payments: Payment[],
) {
  const entries = [
    ...transactions.map((t) => ({
      id: t.id,
      reference: t.id,
      date: t.date,
      label: t.type,
      amountMinor: toMinor(t.total) * (t.type === "Sale" ? 1 : -1),
      href: `/transactions/${t.id}`,
    })),
    ...payments
      .filter((p) => p.status === "Completed")
      .map((p) => ({
        id: p.id,
        reference: p.id,
        date: p.date,
        label: `Payment ${p.direction.toLowerCase()}`,
        amountMinor: p.amountMinor * (p.direction === "Received" ? -1 : 1),
        href: p.invoiceId ? `/invoices/${p.invoiceId}` : "/payments",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return accountStatement(entries, { from: "", to: "" }).rows;
}
