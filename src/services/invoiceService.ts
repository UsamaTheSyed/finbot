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
  if (!["Customer", "Supplier"].includes(party.kind))
    throw new Error("Choose a customer or supplier.");
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
  downloadPdf(businessId: string, id: string): Promise<Blob> {
    return httpApi.blob(`${base(businessId)}/${encodeURIComponent(id)}/pdf`);
  },
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
                  direction:
                    requireParty(businessId, invoice.partyId).kind ===
                    "Supplier"
                      ? "Sent"
                      : "Received",
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
  saveDraft(
    businessId: string,
    id: string,
    input: InvoiceInput,
    revision: string,
  ): Promise<Invoice> {
    const value = invoiceSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const current = requireInvoice(businessId, id);
          if (current.status !== "Draft" || current.transactionId)
            throw new Error("Only drafts can be edited.");
          if ((current.revision ?? "0") !== revision)
            throw new Error(
              "This draft changed. Reopen Edit Draft before saving.",
            );
          if (
            requireParty(businessId, current.partyId).kind !==
            requireParty(businessId, value.partyId).kind
          )
            throw new Error("Choose a party of the same kind.");
          const updated = prepare(businessId, value, true, id);
          Object.assign(current, updated, {
            displayId: current.displayId,
            revision: String(Number(revision) + 1),
          });
          return { ...current };
        })
      : httpApi.patch(`${base(businessId)}/${encodeURIComponent(id)}/draft`, {
          data: { ...value, draft: true },
          revision,
        });
  },
  updateInvoice(
    businessId: string,
    id: string,
    input: InvoiceInput,
    draft = true,
    revision?: string,
  ): Promise<Invoice> {
    const value = invoiceSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const current = requireInvoice(businessId, id);
          if (current.status !== "Draft")
            throw new Error("Only drafts can be edited in this phase.");
          if (value.amountPaid > 0)
            throw new Error("Issue the draft first, then record its payment.");
          if (revision !== undefined && (current.revision ?? "0") !== revision)
            throw new Error("This draft changed. Refresh before issuing.");
          const updated = prepare(businessId, value, draft, id);
          updated.displayId = current.displayId;
          updated.revision = String(Number(current.revision ?? "0") + 1);
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
          revision,
        });
  },
};
