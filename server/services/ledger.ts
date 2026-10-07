import type { Pool, PoolClient } from "pg";
import { ApiError } from "../lib/errors.js";
import { fromMinor } from "../domain/money.js";

type Queryable = Pick<Pool | PoolClient, "query">;

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
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", `${table.slice(0, -1)} not found.`);
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

export async function transactionDto(client: Queryable, businessId: string, id: string) {
  const result = await client.query(
    `select t.*,
       coalesce(sum(p.amount_minor) filter (where p.status = 'Completed'), 0)::bigint as paid_minor
     from transactions t
     left join payments p on p.transaction_id = t.id and p.business_id = t.business_id
     where t.id = $1 and t.business_id = $2
     group by t.id`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.");
  const itemResult = await client.query(
    `select * from transaction_items where transaction_id = $1 order by position`,
    [id],
  );
  const totalMinor = Number(row.total_minor);
  const paidMinor = Number(row.paid_minor);
  const balanceMinor = totalMinor - paidMinor;
  return {
    id: row.display_id,
    businessId: row.business_id,
    date: row.date,
    dueDate: row.due_date,
    partyId: row.party_id,
    type: row.type,
    status: balanceMinor === 0 ? "Completed" : paidMinor > 0 ? "Partial" : row.due_date < businessDate() ? "Overdue" : "Unpaid",
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
    taxRate: row.tax_rate_basis_points === null ? null : Number(row.tax_rate_basis_points) / 100,
    total: fromMinor(totalMinor),
    paid: fromMinor(paidMinor),
    balance: fromMinor(balanceMinor),
    notes: row.notes,
  };
}

export async function invoiceDto(client: Queryable, businessId: string, id: string) {
  const result = await client.query(
    `select i.*,
       coalesce(sum(pa.amount_minor) filter (where p.status = 'Completed'), 0)::bigint as paid_minor
     from invoices i
     left join payment_allocations pa on pa.invoice_id = i.id
     left join payments p on p.id = pa.payment_id and p.business_id = i.business_id
     where i.id = $1 and i.business_id = $2
     group by i.id`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  const itemResult = await client.query(
    `select * from invoice_items where invoice_id = $1 order by position`,
    [id],
  );
  const totalMinor = Number(row.total_minor);
  const paidMinor = Number(row.paid_minor);
  const balanceMinor = totalMinor - paidMinor;
  const status = invoiceStatus(row.status, totalMinor, paidMinor, row.due_date);
  return {
    id: row.display_id,
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
    paidMinor,
    balanceMinor,
    status,
    notes: row.notes,
    terms: row.terms,
    daysOverdue: balanceMinor > 0 && status !== "Draft"
      ? Math.max(0, Math.floor((Date.parse(businessDate()) - Date.parse(row.due_date)) / 86_400_000))
      : 0,
  };
}

export async function paymentDto(client: Queryable, businessId: string, id: string) {
  const result = await client.query(
    `select p.*, pa.invoice_id
     from payments p left join payment_allocations pa on pa.payment_id = p.id
     where p.id = $1 and p.business_id = $2`,
    [id, businessId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  return {
    id: row.display_id,
    businessId: row.business_id,
    partyId: row.party_id,
    invoiceId: row.invoice_id || undefined,
    transactionId: row.transaction_id || undefined,
    direction: row.direction,
    amountMinor: Number(row.amount_minor),
    method: row.method,
    date: row.date,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
  };
}
