import type { Payment } from "../../types";
import {
  recordPaymentSchema,
  type RecordPaymentInput,
} from "../../domain/validation";
import { fromMinor, sumMinor, toMinor } from "../../utils/money";
import { payments, invoices } from "./data";
import {
  requireParty,
  requireInvoice,
  requireTransaction,
  nextId,
  decorateInvoice,
} from "./ledgerSelectors";
/** Atomic synchronous mock operation: validate every relationship before mutating. */
export function recordPayment(
  businessId: string,
  input: RecordPaymentInput,
  transactionId?: string,
): Payment {
  const value = recordPaymentSchema.parse(input);
  requireParty(businessId, value.partyId);
  let invoice = value.invoiceId
    ? requireInvoice(businessId, value.invoiceId)
    : undefined;
  let transaction = transactionId
    ? requireTransaction(businessId, transactionId)
    : undefined;
  if (!invoice && transaction)
    invoice = invoices.find(
      (i) => i.businessId === businessId && i.transactionId === transaction?.id,
    );
  if (invoice?.transactionId)
    transaction = requireTransaction(businessId, invoice.transactionId);
  if (invoice && invoice.status === "Draft")
    throw new Error("Issue the draft before recording a payment.");
  if (
    (invoice && invoice.partyId !== value.partyId) ||
    (transaction && transaction.partyId !== value.partyId)
  )
    throw new Error("Payment party must match the linked record.");
  if (invoice && !transaction)
    throw new Error("Invoice is missing its linked transaction.");
  const expected = transaction?.type === "Purchase" ? "Sent" : "Received";
  if (transaction && expected !== value.direction)
    throw new Error("Payment direction does not match the linked record.");
  const amountMinor = toMinor(value.amount);
  if (
    (transaction && amountMinor > toMinor(transaction.balance)) ||
    (invoice && amountMinor > invoice.balanceMinor)
  )
    throw new Error("Payment cannot exceed the outstanding balance.");
  if (transaction && value.date < transaction.date)
    throw new Error("Payment date cannot precede the linked transaction.");
  const newPaid = transaction
    ? sumMinor([toMinor(transaction.paid), amountMinor])
    : 0;
  const payment: Payment = {
    id: nextId("PAY", payments),
    businessId,
    partyId: value.partyId,
    invoiceId: invoice?.id,
    transactionId: transaction?.id,
    direction: value.direction,
    amountMinor,
    method: value.method,
    date: value.date,
    reference: value.reference,
    notes: value.notes,
    status: "Completed",
  };
  if (transaction) {
    transaction.paid = fromMinor(newPaid);
    transaction.balance = fromMinor(
      sumMinor([toMinor(transaction.total), -newPaid]),
    );
    transaction.status = transaction.balance === 0 ? "Completed" : "Partial";
  }
  if (invoice) {
    invoice.paidMinor = sumMinor([invoice.paidMinor, amountMinor]);
    invoice.balanceMinor = sumMinor([invoice.totalMinor, -invoice.paidMinor]);
    Object.assign(invoice, decorateInvoice(invoice));
  }
  payments.push(payment);
  return payment;
}
