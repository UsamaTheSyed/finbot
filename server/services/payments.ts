import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/client.js";
import type { PaymentInput } from "../domain/validation.js";
import { toMinor } from "../domain/money.js";
import { ApiError } from "../lib/errors.js";
import { paymentDto, requireScopedRecord } from "./ledger.js";

export async function createPayment(
  pool: DatabasePool,
  businessId: string,
  input: PaymentInput,
  forcedTransactionId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await requireScopedRecord(client, "parties", businessId, input.partyId, true);
    const invoice = input.invoiceId
      ? await requireScopedRecord(client, "invoices", businessId, input.invoiceId, true)
      : undefined;
    let transaction = forcedTransactionId
      ? await requireScopedRecord(client, "transactions", businessId, forcedTransactionId, true)
      : undefined;
    if (invoice?.transaction_id)
      transaction = await requireScopedRecord(client, "transactions", businessId, String(invoice.transaction_id), true);
    if (invoice && invoice.status === "Draft") throw new ApiError(409, "DRAFT_PAYMENT", "Issue the draft before recording a payment.");
    if ((invoice && invoice.party_id !== input.partyId) || (transaction && transaction.party_id !== input.partyId))
      throw new ApiError(400, "PARTY_MISMATCH", "Payment party must match the linked record.");
    if (invoice && !transaction) throw new ApiError(409, "MISSING_TRANSACTION", "Invoice is missing its linked transaction.");
    const expected = transaction?.type === "Purchase" ? "Sent" : "Received";
    if (transaction && input.direction !== expected)
      throw new ApiError(400, "DIRECTION_MISMATCH", "Payment direction does not match the linked record.");
    if (transaction) {
      const transactionDate =
        transaction.date instanceof Date
          ? transaction.date.toISOString().slice(0, 10)
          : String(transaction.date).slice(0, 10);

      if (input.date < transactionDate) {
        throw new ApiError(
          400,
          "PAYMENT_DATE_INVALID",
          "Payment date cannot precede the linked transaction.",
        );
      }
    }

    const amountMinor = toMinor(input.amount);
    if (invoice) {
      const allocations = await client.query(
        `select coalesce(sum(pa.amount_minor),0)::bigint as paid_minor
         from payment_allocations pa join payments p on p.id=pa.payment_id
         where pa.invoice_id=$1 and p.status='Completed'`,
        [invoice.id],
      );
      const outstanding = Number(invoice.total_minor) - Number(allocations.rows[0].paid_minor);
      if (amountMinor > outstanding)
        throw new ApiError(409, "OVERPAYMENT", "Payment cannot exceed the outstanding balance.");
    } else if (transaction) {
      const settled = await client.query(
        `select coalesce(sum(amount_minor),0)::bigint as paid_minor from payments
         where business_id=$1 and transaction_id=$2 and status='Completed'`,
        [businessId, transaction.id],
      );
      const outstanding = Number(transaction.total_minor) - Number(settled.rows[0].paid_minor);
      if (amountMinor > outstanding)
        throw new ApiError(409, "OVERPAYMENT", "Payment cannot exceed the outstanding balance.");
    }

    const paymentId = `PAY-${randomUUID()}`;
    await client.query(
      `insert into payments
       (id, display_id, business_id, party_id, transaction_id, direction, amount_minor, method, date, reference, notes, status)
       values ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Completed')`,
      [paymentId, businessId, input.partyId, transaction?.id || null, input.direction, amountMinor, input.method, input.date, input.reference, input.notes],
    );
    if (invoice) {
      await client.query(
        "insert into payment_allocations (payment_id, invoice_id, amount_minor) values ($1,$2,$3)",
        [paymentId, invoice.id, amountMinor],
      );
      const paid = await client.query(
        `select coalesce(sum(pa.amount_minor),0)::bigint as paid_minor
         from payment_allocations pa join payments p on p.id=pa.payment_id
         where pa.invoice_id=$1 and p.status='Completed'`,
        [invoice.id],
      );
      const paidMinor = Number(paid.rows[0].paid_minor);
      const status = paidMinor >= Number(invoice.total_minor) ? "Paid" : "Partial";
      await client.query("update invoices set status=$2, updated_at=now() where id=$1", [invoice.id, status]);
    }
    if (transaction) {
      const paid = await client.query(
        `select coalesce(sum(amount_minor),0)::bigint as paid_minor from payments
         where business_id=$1 and transaction_id=$2 and status='Completed'`,
        [businessId, transaction.id],
      );
      const status = Number(paid.rows[0].paid_minor) >= Number(transaction.total_minor) ? "Completed" : "Partial";
      await client.query("update transactions set status=$2, updated_at=now() where id=$1", [transaction.id, status]);
    }
    await client.query("commit");
    return paymentDto(pool, businessId, paymentId);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
