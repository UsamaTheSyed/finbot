import type { InvoiceInput } from "./validation";
import type { Invoice } from "../types";
import { calculateInvoiceTotal } from "./invoiceCalculations";
import { toMinor } from "../utils/money";
export function buildInvoicePreview(value: InvoiceInput): Invoice {
  const items = value.items.map((l, index) => ({
    ...l,
    id: `preview-${index}`,
    rateMinor: toMinor(l.rate),
  }));
  const totals = calculateInvoiceTotal(items, toMinor(value.discount)),
    paidMinor = toMinor(value.amountPaid);
  return {
    id: "PREVIEW",
    businessId: "preview",
    partyId: value.partyId,
    date: value.date,
    dueDate: value.dueDate,
    reference: value.reference,
    items,
    ...totals,
    paidMinor,
    balanceMinor: totals.totalMinor - paidMinor,
    status: "Draft",
    notes: value.notes,
    terms: value.terms,
    daysOverdue: 0,
  };
}
export function tryInvoicePreview(value: InvoiceInput) {
  try {
    return { invoice: buildInvoicePreview(value), error: "" };
  } catch (e) {
    return { invoice: undefined, error: (e as Error).message };
  }
}
