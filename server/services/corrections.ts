import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/client.js";
import {
  correctionInput,
  correctionPlan,
  type CorrectionInput,
} from "../domain/correction.js";
import {
  invoiceDto,
  invoiceStatus,
  requireScopedRecord,
  type Queryable,
} from "./ledger.js";
import { ApiError } from "../lib/errors.js";

export async function correctionContext(
  pool: Queryable,
  businessId: string,
  invoiceId: string,
) {
  await requireScopedRecord(pool, "invoices", businessId, invoiceId);
  const business = await pool.query(
    "select timezone from businesses where id=$1",
    [businessId],
  );
  const today =
    process.env.APP_DATE_OVERRIDE ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: business.rows[0]?.timezone || "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const result = await pool.query(
    `select c.*,u.name actor from invoice_corrections c join users u on u.id=c.user_id
    where c.business_id=$1 and c.invoice_id=$2 order by c.created_at,c.id`,
    [businessId, invoiceId],
  );
  return {
    today,
    entries: result.rows.map((c) => ({
      id: c.id,
      date: c.date,
      reason: c.reason,
      actor: c.actor,
      createdAt: c.created_at,
      before: c.before,
      after: c.after,
      deltaMinor: Number(c.total_delta),
    })),
  };
}
export async function correctInvoice(
  pool: DatabasePool,
  businessId: string,
  invoiceId: string,
  userId: string,
  value: CorrectionInput,
) {
  const input = correctionInput.parse(value);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const original = await requireScopedRecord(
      client,
      "invoices",
      businessId,
      invoiceId,
    );
    await requireScopedRecord(
      client,
      "parties",
      businessId,
      String(original.party_id),
      true,
    );
    const locked = await requireScopedRecord(
      client,
      "invoices",
      businessId,
      invoiceId,
      true,
    );
    if (locked.party_id !== original.party_id)
      throw new ApiError(
        409,
        "DOCUMENT_CHANGED",
        "The document changed. Reopen the correction.",
      );
    const tracked = await client.query("select 1 from stock_movements where invoice_id=$1 union all select 1 from stock_lines where invoice_id=$1 limit 1",[invoiceId]);
    if (tracked.rowCount || input.data.items.some(i=>i.productId)) throw new ApiError(409,"STOCK_HISTORY","Stock-linked documents cannot be rewritten. Record a credit note for money and a separate stock return/adjustment for physical goods.");
    const before = await invoiceDto(client, businessId, invoiceId);
    const credits = await client.query(
      "select 1 from credit_notes where invoice_id=$1 union all select 1 from credit_uses where transaction_id=$2 limit 1",
      [invoiceId, before.transactionId],
    );
    if (credits.rowCount)
      throw new ApiError(
        409,
        "CREDIT_HISTORY",
        "This document has credit history. Financial corrections are locked to preserve the recorded history.",
      );
    const context = await correctionContext(client, businessId, invoiceId);
    const plan = correctionPlan(before, input, context.today);
    await requireScopedRecord(
      client,
      "transactions",
      businessId,
      before.transactionId!,
      true,
    );
    const future = await client.query(
      `select 1 from ledger_settlements where business_id=$1 and transaction_id=$2 and effective_date>$3 limit 1`,
      [businessId, before.transactionId, input.effectiveDate],
    );
    if (
      future.rowCount ||
      context.entries.some((c) => c.date > input.effectiveDate)
    )
      throw new ApiError(
        409,
        "FUTURE_ACTIVITY",
        "This document has activity after the correction date. No changes were saved.",
      );
    const { totals, items } = plan;
    const status = invoiceStatus(
      "Sent",
      totals.totalMinor,
      before.paidMinor,
      before.dueDate,
    );
    const transactionStatus =
      plan.balanceMinor === 0
        ? "Completed"
        : before.paidMinor > 0
          ? "Partial"
          : before.dueDate < context.today
            ? "Overdue"
            : "Unpaid";
    await client.query(
      `update invoices set reference=$3,subtotal_minor=$4,tax_minor=$5,discount_minor=$6,total_minor=$7,
      notes=$8,terms=$9,status=$10,updated_at=now() where id=$1 and business_id=$2`,
      [
        invoiceId,
        businessId,
        input.data.reference,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.discountMinor,
        totals.totalMinor,
        input.data.notes,
        input.data.terms,
        status,
      ],
    );
    const uniform = totals.items.every(
      (i) => i.taxBasisPoints === totals.items[0].taxBasisPoints,
    )
      ? totals.items[0].taxBasisPoints
      : null;
    await client.query(
      `update transactions set subtotal_minor=$3,tax_minor=$4,discount_minor=$5,total_minor=$6,
      notes=$7,tax_rate_basis_points=$8,status=$9,updated_at=now() where id=$1 and business_id=$2`,
      [
        before.transactionId,
        businessId,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.discountMinor,
        totals.totalMinor,
        input.data.notes,
        uniform,
        transactionStatus,
      ],
    );
    await client.query("delete from invoice_items where invoice_id=$1", [
      invoiceId,
    ]);
    await client.query(
      "delete from transaction_items where transaction_id=$1",
      [before.transactionId],
    );
    for (const [position, item] of totals.items.entries()) {
      await client.query(
        `insert into invoice_items(id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          items[position].id,
          invoiceId,
          position,
          item.item,
          item.description,
          item.quantityMilli,
          item.unit,
          item.rateMinor,
          item.taxBasisPoints,
        ],
      );
      await client.query(
        `insert into transaction_items(id,transaction_id,position,description,quantity_milli,unit,rate_minor) values($1,$2,$3,$4,$5,$6,$7)`,
        [
          `${before.transactionId}-line-${position + 1}`,
          before.transactionId,
          position,
          item.description || item.item,
          item.quantityMilli,
          item.unit,
          item.rateMinor,
        ],
      );
    }
    const after = await invoiceDto(client, businessId, invoiceId);
    const correctionId = `COR-${randomUUID()}`;
    await client.query(
      `insert into invoice_corrections(id,business_id,invoice_id,transaction_id,user_id,date,reason,"before","after",subtotal_delta,tax_delta,discount_delta,total_delta)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13)`,
      [
        correctionId,
        businessId,
        invoiceId,
        before.transactionId,
        userId,
        input.effectiveDate,
        input.reason,
        JSON.stringify(before),
        JSON.stringify(after),
        totals.subtotalMinor - before.subtotalMinor,
        totals.taxMinor - before.taxMinor,
        totals.discountMinor - before.discountMinor,
        plan.deltaMinor,
      ],
    );
    await client.query("commit");
    return after;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
