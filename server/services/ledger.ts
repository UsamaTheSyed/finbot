import type { Pool, PoolClient } from "pg";
import { ApiError } from "../lib/errors.js";
import { fromMinor } from "../domain/money.js";

export type Queryable = Pick<Pool | PoolClient, "query">;

export function businessDate() {
  return process.env.APP_DATE_OVERRIDE || new Date().toISOString().slice(0, 10);
}

export async function requireScopedRecord(
  client: Queryable,
  table: "parties" | "transactions" | "invoices" | "payments",
  businessId: string,
  id: string,
  lock = false,
) {
  const result = await client.query(
    `select * from ${table} where id = $1 and business_id = $2${lock ? " for update" : ""}`,
    [id, businessId],
  );
  if (!result.rows[0])
    throw new ApiError(404, "NOT_FOUND", `${table.slice(0, -1)} not found.`);
  return result.rows[0] as Record<string, unknown>;
}

export function invoiceStatus(
  stored: string,
  totalMinor: number,
  paidMinor: number,
  dueDate: string,
) {
  if (stored === "Draft") return "Draft";
  if (paidMinor >= totalMinor) return "Paid";
  if (paidMinor > 0) return "Partial";
  return dueDate < businessDate() ? "Overdue" : "Sent";
}

export async function transactionDto(
  client: Queryable,
  businessId: string,
  id: string,
) {
  const result = await client.query(
    `select t.*,
       coalesce(sum(p.amount_minor), 0)::bigint as settled_minor,
       coalesce((select sum(c.total_minor) from credit_notes c where c.transaction_id=t.id),0)::bigint credited_minor
     from transactions t
     left join ledger_settlements p on p.transaction_id = t.id and p.business_id = t.business_id
     where t.id = $1 and t.business_id = $2
     group by t.id`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row)
    throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.");
  const itemResult = await client.query(
    `select * from transaction_items where transaction_id = $1 order by position`,
    [id],
  );
  const totalMinor = Number(row.total_minor);
  const creditedMinor = Number(row.credited_minor || 0);
  const paidMinor = Number(row.settled_minor) - creditedMinor;
  const balanceMinor = totalMinor - creditedMinor - paidMinor;
  return {
    id: row.display_id,
    businessId: row.business_id,
    date: row.date,
    dueDate: row.due_date,
    partyId: row.party_id,
    type: row.type,
    status:
      balanceMinor === 0
        ? "Completed"
        : paidMinor > 0
          ? "Partial"
          : row.due_date < businessDate()
            ? "Overdue"
            : "Unpaid",
    createdBy: row.created_by,
    items: itemResult.rows.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity_milli) / 1000,
      unit: item.unit,
      rate: fromMinor(Number(item.rate_minor)),
    })),
    subtotal: fromMinor(Number(row.subtotal_minor)),
    discount: fromMinor(Number(row.discount_minor)),
    tax: fromMinor(Number(row.tax_minor)),
    taxRate:
      row.tax_rate_basis_points === null
        ? null
        : Number(row.tax_rate_basis_points) / 100,
    total: fromMinor(totalMinor),
    ...(creditedMinor
      ? {
          credited: fromMinor(creditedMinor),
          netTotal: fromMinor(totalMinor - creditedMinor),
        }
      : {}),
    paid: fromMinor(paidMinor),
    balance: fromMinor(balanceMinor),
    notes: row.notes,
  };
}

export async function invoiceDto(
  client: Queryable,
  businessId: string,
  id: string,
) {
  const result = await client.query(
    `select i.*, i.xmin::text as revision,
       coalesce((select sum(s.amount_minor) from ledger_settlements s where s.transaction_id=i.transaction_id and s.business_id=i.business_id),0)::bigint settled_minor,
       coalesce((select sum(c.total_minor) from credit_notes c where c.invoice_id=i.id),0)::bigint credited_minor
     from invoices i where i.id=$1 and i.business_id=$2`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  const itemResult = await client.query(
    `select * from invoice_items where invoice_id = $1 order by position`,
    [id],
  );
  const totalMinor = Number(row.total_minor);
  const creditedMinor = Number(row.credited_minor || 0);
  const paidMinor = Number(row.settled_minor) - creditedMinor;
  const balanceMinor = totalMinor - creditedMinor - paidMinor;
  const status = invoiceStatus(
    row.status,
    totalMinor - creditedMinor,
    paidMinor,
    row.due_date,
  );
  return {
    id: row.id,
    displayId: row.display_id,
    revision: row.revision,
    businessId: row.business_id,
    transactionId: row.transaction_id || undefined,
    partyId: row.party_id,
    date: row.date,
    dueDate: row.due_date,
    reference: row.reference,
    items: itemResult.rows.map((item) => ({
      id: item.id,
      item: item.item,
      description: item.description,
      quantity: Number(item.quantity_milli) / 1000,
      unit: item.unit,
      rateMinor: Number(item.rate_minor),
      taxPercent: Number(item.tax_basis_points) / 100,
    })),
    subtotalMinor: Number(row.subtotal_minor),
    taxMinor: Number(row.tax_minor),
    discountMinor: Number(row.discount_minor),
    totalMinor,
    ...(creditedMinor
      ? { creditedMinor, netTotalMinor: totalMinor - creditedMinor }
      : {}),
    paidMinor,
    balanceMinor,
    status,
    notes: row.notes,
    terms: row.terms,
    daysOverdue:
      balanceMinor > 0 && status !== "Draft"
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(businessDate()) - Date.parse(row.due_date)) /
                86_400_000,
            ),
          )
        : 0,
  };
}

export async function paymentDto(
  client: Queryable,
  businessId: string,
  id: string,
) {
  const result = await client.query(
    `select p.*, pa.invoice_id, i.display_id as invoice_display_id
     from payments p left join payment_allocations pa on pa.payment_id = p.id
     left join invoices i on i.id = pa.invoice_id and i.business_id = p.business_id
     where p.id = $1 and p.business_id = $2`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  const splits = await client.query(
    `select a.transaction_id, a.amount_minor, a.effective_date,
      i.id invoice_id, coalesce(i.display_id,t.display_id) display_id
    from payment_transaction_allocations a join transactions t on t.id=a.transaction_id
    left join invoices i on i.transaction_id=t.id and i.business_id=t.business_id
    where a.payment_id=$1 order by t.date,t.created_at,t.id`,
    [id],
  );
  const allocations = splits.rows.map((a) => ({
    transactionId: a.transaction_id,
    invoiceId: a.invoice_id || undefined,
    displayId: a.display_id,
    amountMinor: Number(a.amount_minor),
    effectiveDate: a.effective_date,
  }));
  const fifo = row.allocation_mode === "fifo";
  const only = allocations.length === 1 ? allocations[0] : undefined;
  return {
    id: row.display_id,
    businessId: row.business_id,
    partyId: row.party_id,
    invoiceId: fifo ? only?.invoiceId : row.invoice_id || undefined,
    invoiceDisplayId: fifo
      ? only?.displayId
      : row.invoice_display_id || undefined,
    transactionId: fifo ? only?.transactionId : row.transaction_id || undefined,
    allocationMode: row.allocation_mode,
    allocations,
    advanceMinor: fifo
      ? Number(row.amount_minor) -
        allocations.reduce((sum, a) => sum + a.amountMinor, 0)
      : 0,
    direction: row.direction,
    amountMinor: Number(row.amount_minor),
    method: row.method,
    date: row.date,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
  };
}
