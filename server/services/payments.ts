import { validateAccountingDate } from "./accountingDate.js";
import { applyAdvance, previewAllocation } from "./allocations.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { DatabasePool } from "../db/client.js";
import { paymentInput, type PaymentInput } from "../domain/validation.js";
import { toMinor } from "../domain/money.js";
import { ApiError } from "../lib/errors.js";
import { paymentDto, invoiceDto, requireScopedRecord } from "./ledger.js";

export async function validatePayment(
  client: PoolClient,
  businessId: string,
  raw: PaymentInput,
  forcedTransactionId?: string,
) {
  const input = paymentInput.parse(raw);
  await validateAccountingDate(client, businessId, input.date);
  const party = await requireScopedRecord(
    client,
    "parties",
    businessId,
    input.partyId,
    true,
  );
  if (input.direction !== (party.kind === "Customer" ? "Received" : "Sent"))
    throw new ApiError(
      400,
      "DIRECTION_MISMATCH",
      "Use Record Refund to return or recover funded credit.",
    );
  if (input.allocationMode === "fifo") {
    if (input.invoiceId || forcedTransactionId)
      throw new ApiError(
        400,
        "ALLOCATION_CONFLICT",
        "FIFO cannot target one invoice.",
      );
    await previewAllocation(
      client,
      businessId,
      input.partyId,
      input.direction,
      toMinor(input.amount),
    );
    return {
      input,
      invoice: undefined,
      transaction: undefined,
      amountMinor: toMinor(input.amount),
    };
  }
  let invoice = input.invoiceId
    ? await requireScopedRecord(
        client,
        "invoices",
        businessId,
        input.invoiceId,
        true,
      )
    : undefined;
  let transaction = forcedTransactionId
    ? await requireScopedRecord(
        client,
        "transactions",
        businessId,
        forcedTransactionId,
        true,
      )
    : undefined;
  if (!invoice && forcedTransactionId) {
    const linked = await client.query(
      "select id from invoices where business_id=$1 and transaction_id=$2",
      [businessId, forcedTransactionId],
    );
    if (linked.rows[0])
      invoice = await requireScopedRecord(
        client,
        "invoices",
        businessId,
        linked.rows[0].id,
        true,
      );
  }
  if (invoice?.transaction_id)
    transaction = await requireScopedRecord(
      client,
      "transactions",
      businessId,
      String(invoice.transaction_id),
      true,
    );
  if (invoice && invoice.status === "Draft")
    throw new ApiError(
      409,
      "DRAFT_PAYMENT",
      "Issue the draft before recording a payment.",
    );
  if (
    (invoice && invoice.party_id !== input.partyId) ||
    (transaction && transaction.party_id !== input.partyId)
  )
    throw new ApiError(
      400,
      "PARTY_MISMATCH",
      "Payment party must match the linked record.",
    );
  if (invoice && !transaction)
    throw new ApiError(
      409,
      "MISSING_TRANSACTION",
      "Invoice is missing its linked transaction.",
    );
  const expected = transaction?.type === "Purchase" ? "Sent" : "Received";
  if (transaction && input.direction !== expected)
    throw new ApiError(
      400,
      "DIRECTION_MISMATCH",
      "Payment direction does not match the linked record.",
    );
  if (transaction) {
    const correction = await client.query(
      "select max(date) date from (select date from ledger_movements where business_id=$1 and transaction_id=$2 union all select effective_date from ledger_settlements where business_id=$1 and transaction_id=$2) activity",
      [businessId, transaction.id],
    );
    if (correction.rows[0]?.date && input.date < correction.rows[0].date)
      throw new ApiError(
        400,
        "PAYMENT_DATE_INVALID",
        "Payment date cannot precede the latest financial activity.",
      );
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
    const current = await invoiceDto(client, businessId, String(invoice.id));
    const outstanding = current.balanceMinor;
    if (amountMinor > outstanding)
      throw new ApiError(
        409,
        "OVERPAYMENT",
        "Payment cannot exceed the outstanding balance.",
      );
  } else if (transaction) {
    const settled = await client.query(
      `select coalesce(sum(amount_minor),0)::bigint as paid_minor from ledger_settlements
         where business_id=$1 and transaction_id=$2`,
      [businessId, transaction.id],
    );
    const outstanding =
      Number(transaction.total_minor) - Number(settled.rows[0].paid_minor);
    if (amountMinor > outstanding)
      throw new ApiError(
        409,
        "OVERPAYMENT",
        "Payment cannot exceed the outstanding balance.",
      );
  }

  return { input, invoice, transaction, amountMinor };
}
export async function executePayment(
  client: PoolClient,
  businessId: string,
  raw: PaymentInput,
  forcedTransactionId?: string,
) {
  const { input, invoice, transaction, amountMinor } = await validatePayment(
    client,
    businessId,
    raw,
    forcedTransactionId,
  );
  if (input.allocationMode === "fifo") {
    const paymentId = `PAY-${randomUUID()}`;
    await client.query(
      `insert into payments(id,display_id,business_id,party_id,direction,amount_minor,method,date,reference,notes,status,allocation_mode)
      values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,'Completed','fifo')`,
      [
        paymentId,
        businessId,
        input.partyId,
        input.direction,
        amountMinor,
        input.method,
        input.date,
        input.reference,
        input.notes,
      ],
    );
    await applyAdvance(client, businessId, input.partyId, input.direction);
    return paymentDto(client, businessId, paymentId);
  }
  const paymentId = `PAY-${randomUUID()}`;
  await client.query(
    `insert into payments
       (id, display_id, business_id, party_id, transaction_id, direction, amount_minor, method, date, reference, notes, status)
       values ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Completed')`,
    [
      paymentId,
      businessId,
      input.partyId,
      transaction?.id || null,
      input.direction,
      amountMinor,
      input.method,
      input.date,
      input.reference,
      input.notes,
    ],
  );
  if (invoice) {
    await client.query(
      "insert into payment_allocations (payment_id, invoice_id, amount_minor) values ($1,$2,$3)",
      [paymentId, invoice.id, amountMinor],
    );
    const current = await invoiceDto(client, businessId, String(invoice.id));
    const status = current.status;
    await client.query(
      "update invoices set status=$2, updated_at=now() where id=$1",
      [invoice.id, status],
    );
  }
  if (transaction) {
    const paid = await client.query(
      `select coalesce(sum(amount_minor),0)::bigint as paid_minor from ledger_settlements
         where business_id=$1 and transaction_id=$2`,
      [businessId, transaction.id],
    );
    const status =
      Number(paid.rows[0].paid_minor) >= Number(transaction.total_minor)
        ? "Completed"
        : "Partial";
    await client.query(
      "update transactions set status=$2, updated_at=now() where id=$1",
      [transaction.id, status],
    );
  }

  return paymentDto(client, businessId, paymentId);
}
export async function createPayment(
  pool: DatabasePool,
  businessId: string,
  input: PaymentInput,
  forcedTransactionId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await executePayment(
      client,
      businessId,
      input,
      forcedTransactionId,
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
