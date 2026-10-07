import { invoices, parties, payments, transactions, demoDate } from "./data";
import type { PartySummary, Invoice, Transaction } from "../../types";
import { sumMinor, toMinor, fromMinor } from "../../utils/money";
import { ApiError } from "../api";
const sequences = new Map<string, number>();
export function nextId(prefix: string, records: { id: string }[], digits = 4) {
  const highest = Math.max(
    0,
    ...records.map((r) =>
      r.id.startsWith(prefix + "-")
        ? Number(r.id.slice(prefix.length + 1)) || 0
        : 0,
    ),
  );
  const n = Math.max(sequences.get(prefix) || 0, highest) + 1;
  sequences.set(prefix, n);
  return `${prefix}-${String(n).padStart(digits, "0")}`;
}
export function requireParty(businessId: string, id: string) {
  const row = parties.find((p) => p.businessId === businessId && p.id === id);
  if (!row) throw new ApiError("Party not found", 404);
  return row;
}
export function requireInvoice(businessId: string, id: string) {
  const row = invoices.find((p) => p.businessId === businessId && p.id === id);
  if (!row) throw new ApiError("Invoice not found", 404);
  return row;
}
export function requireTransaction(businessId: string, id: string) {
  const row = transactions.find(
    (p) => p.businessId === businessId && p.id === id,
  );
  if (!row) throw new ApiError("Transaction not found", 404);
  return row;
}
export function invoiceStatus(row: Invoice): Invoice["status"] {
  return row.status === "Draft"
    ? "Draft"
    : row.balanceMinor === 0
      ? "Paid"
      : row.paidMinor > 0
        ? "Partial"
        : row.dueDate < demoDate
          ? "Overdue"
          : "Sent";
}
export function decorateInvoice(row: Invoice): Invoice {
  return {
    ...row,
    status: invoiceStatus(row),
    daysOverdue:
      row.balanceMinor > 0 && row.status !== "Draft"
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(demoDate) - Date.parse(row.dueDate)) / 86400000,
            ),
          )
        : 0,
  };
}
export function partySummary(businessId: string, id: string): PartySummary {
  const party = requireParty(businessId, id),
    txns = transactions.filter(
      (t) => t.businessId === businessId && t.partyId === id,
    ),
    history = payments.filter(
      (p) =>
        p.businessId === businessId &&
        p.partyId === id &&
        p.status === "Completed",
    );
  const unallocated = history.filter((p) => !p.transactionId);
  return {
    ...party,
    totalMinor: sumMinor(txns.map((t) => toMinor(t.total))),
    receivedMinor: sumMinor(
      history.map(
        (p) =>
          p.amountMinor *
          (p.direction === (party.kind === "Customer" ? "Received" : "Sent")
            ? 1
            : -1),
      ),
    ),
    balanceMinor: sumMinor([
      ...txns.map((t) => (t.type === "Sale" ? 1 : -1) * toMinor(t.balance)),
      ...unallocated.map(
        (p) => (p.direction === "Received" ? -1 : 1) * p.amountMinor,
      ),
    ]),
    invoiceCount: invoices.filter(
      (i) =>
        i.businessId === businessId && i.partyId === id && i.status !== "Draft",
    ).length,
    paymentCount: history.length,
  };
}
export function transactionFromInvoice(invoice: Invoice): Transaction {
  const party = requireParty(invoice.businessId, invoice.partyId);
  return {
    id: nextId(party.kind === "Customer" ? "SALE" : "PUR", transactions, 6),
    businessId: invoice.businessId,
    partyId: invoice.partyId,
    date: invoice.date,
    dueDate: invoice.dueDate,
    type: party.kind === "Customer" ? "Sale" : "Purchase",
    status:
      invoice.balanceMinor === 0
        ? "Completed"
        : invoice.paidMinor > 0
          ? "Partial"
          : "Unpaid",
    createdBy: "user-1",
    items: invoice.items.map((l) => ({
      id: l.id,
      description: l.description || l.item,
      quantity: l.quantity,
      unit: l.unit,
      rate: fromMinor(l.rateMinor),
    })),
    subtotal: fromMinor(invoice.subtotalMinor),
    tax: fromMinor(invoice.taxMinor),
    taxRate: invoice.items.every(
      (l) => l.taxPercent === invoice.items[0]?.taxPercent,
    )
      ? invoice.items[0]?.taxPercent || 0
      : null,
    discount: fromMinor(invoice.discountMinor),
    total: fromMinor(invoice.totalMinor),
    paid: fromMinor(invoice.paidMinor),
    balance: fromMinor(invoice.balanceMinor),
    notes: invoice.notes,
  };
}
