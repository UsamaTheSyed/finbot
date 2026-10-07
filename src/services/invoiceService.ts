import type { Invoice, Payment } from "../types";
import { invoices, transactions, payments } from "./mock/data";
import {
  decorateInvoice,
  nextId,
  requireParty,
  requireInvoice,
  transactionFromInvoice,
} from "./mock/ledgerSelectors";
import { invoiceSchema, type InvoiceInput } from "../domain/validation";
import { calculateInvoiceTotal } from "../domain/invoiceCalculations";
import { toMinor } from "../utils/money";
import { httpApi, mockResponse, useMock } from "./api";
const base = (id: string) => `/businesses/${encodeURIComponent(id)}/invoices`;
const getInvoices = (businessId: string): Promise<Invoice[]> =>
  useMock
    ? mockResponse(() =>
        invoices
          .filter((i) => i.businessId === businessId)
          .map(decorateInvoice),
      )
    : httpApi.get(base(businessId));
function prepare(
  businessId: string,
  input: InvoiceInput,
  draft: boolean,
  id: string,
): Invoice {
  const value = invoiceSchema.parse(input),
    party = requireParty(businessId, value.partyId);
  if (party.kind !== "Customer")
    throw new Error("Choose a customer for a new sales invoice.");
  if (draft && value.amountPaid > 0)
    throw new Error(
      "A draft cannot record a payment. Set Amount Paid to zero or create the invoice.",
    );
  const items = value.items.map((l, i) => ({
    id: `${id}-line-${i + 1}`,
    item: l.item,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    rateMinor: toMinor(l.rate),
    taxPercent: l.taxPercent,
  }));
  const totals = calculateInvoiceTotal(items, toMinor(value.discount)),
    paidMinor = toMinor(value.amountPaid);
  return decorateInvoice({
    id,
    businessId,
    partyId: value.partyId,
    date: value.date,
    dueDate: value.dueDate,
    reference: value.reference,
    items,
    ...totals,
    paidMinor,
    balanceMinor: totals.totalMinor - paidMinor,
    status: draft ? "Draft" : "Sent",
    notes: value.notes,
    terms: value.terms,
    daysOverdue: 0,
  });
}
export const invoiceService = {
  list: getInvoices,
  getInvoices,
  getInvoiceById(businessId: string, id: string): Promise<Invoice> {
    return useMock
      ? mockResponse(() => decorateInvoice(requireInvoice(businessId, id)))
      : httpApi.get(`${base(businessId)}/${encodeURIComponent(id)}`);
  },
  overdue(businessId: string): Promise<Invoice[]> {
    return getInvoices(businessId).then((rows) =>
      rows.filter(
        (i) => i.status !== "Draft" && i.balanceMinor > 0 && i.daysOverdue > 0,
      ),
    );
  },
  createInvoice(
    businessId: string,
    input: InvoiceInput,
    draft = false,
  ): Promise<Invoice> {
    const value = invoiceSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const invoice = prepare(
            businessId,
            value,
            draft,
            nextId("INV", invoices, 3),
          );
          const transaction = draft
            ? undefined
            : transactionFromInvoice(invoice);
          invoice.transactionId = transaction?.id;
          const payment: Payment | undefined =
            invoice.paidMinor > 0
              ? {
                  id: nextId("PAY", payments),
                  businessId,
                  partyId: invoice.partyId,
                  invoiceId: invoice.id,
                  transactionId: transaction?.id,
                  direction: "Received",
                  amountMinor: invoice.paidMinor,
                  method: value.method,
                  date: value.date,
                  reference: value.reference,
                  notes: "Initial invoice payment",
                  status: "Completed",
                }
              : undefined;
          invoices.push(invoice);
          if (transaction) transactions.unshift(transaction);
          if (payment) payments.push(payment);
          return invoice;
        })
      : httpApi.post(base(businessId), { ...value, draft });
  },
  updateInvoice(
    businessId: string,
    id: string,
    input: InvoiceInput,
    draft = true,
  ): Promise<Invoice> {
    const value = invoiceSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const current = requireInvoice(businessId, id);
          if (current.status !== "Draft")
            throw new Error("Only drafts can be edited in this phase.");
          if (value.amountPaid > 0)
            throw new Error("Issue the draft first, then record its payment.");
          const updated = prepare(businessId, value, draft, id);
          const transaction = draft
            ? undefined
            : transactionFromInvoice(updated);
          if (transaction) {
            updated.transactionId = transaction.id;
            transactions.unshift(transaction);
          }
          Object.assign(current, updated);
          return current;
        })
      : httpApi.patch(`${base(businessId)}/${encodeURIComponent(id)}`, {
          ...value,
          draft,
        });
  },
};
