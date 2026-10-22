import type { DatabasePool } from "../db/client.js";
import { invoiceDto, requireScopedRecord } from "../services/ledger.js";
import { ApiError } from "../lib/errors.js";

export interface Contact {
  name: string;
  phone: string;
  email: string;
  address: string;
  ntn: string;
  logo?: string;
  kind?: string;
}
export interface InvoicePdfData {
  corrections?: { date: string; reason: string; deltaMinor: number }[];
  invoice: Awaited<ReturnType<typeof invoiceDto>>;
  business: Contact;
  party: Contact;
  payments: {
    date: string;
    amountMinor: number;
    method: string;
    reference: string;
  }[];
}
function contact(row: Record<string, unknown>): Contact {
  return Object.fromEntries(
    ["name", "phone", "email", "address", "ntn", "logo", "kind"].map((key) => [
      key,
      String(row[key] ?? ""),
    ]),
  ) as unknown as Contact;
}
export async function loadInvoicePdf(
  pool: DatabasePool,
  businessId: string,
  id: string,
): Promise<InvoicePdfData> {
  const client = await pool.connect();
  try {
    // All displayed values belong to the same database snapshot, even during payments.
    await client.query("begin isolation level repeatable read read only");
    const invoice = await invoiceDto(client, businessId, id);
    const party = await requireScopedRecord(
      client,
      "parties",
      businessId,
      invoice.partyId,
    );
    const business = await client.query(
      "select name,phone,email,address,ntn,logo from businesses where id=$1",
      [businessId],
    );
    if (!business.rows[0])
      throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    const payments = await client.query(
      `select p.id, p.date, p.method, p.reference,
      sum(a.amount_minor)::bigint as amount_minor
      from payment_allocations a join payments p on p.id=a.payment_id
      where a.invoice_id=$1 and p.business_id=$2 and p.status='Completed'
      group by p.id order by p.date,p.id`,
      [id, businessId],
    );
    const corrections = await client.query(
      "select date,reason,total_delta from invoice_corrections where business_id=$1 and invoice_id=$2 order by created_at,id",
      [businessId, id],
    );
    await client.query("commit");
    return {
      invoice,
      corrections: corrections.rows.map((c) => ({
        date: c.date,
        reason: c.reason,
        deltaMinor: Number(c.total_delta),
      })),
      party: contact(party),
      business: contact(business.rows[0]),
      payments: payments.rows.map((p) => ({
        date: p.date,
        method: p.method,
        reference: p.reference,
        amountMinor: Number(p.amount_minor),
      })),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export function invoicePdfFilename(data: InvoicePdfData) {
  const label = String(data.invoice.displayId || data.invoice.id)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 100);
  return `finbot-${data.party.kind === "Supplier" ? "bill" : "invoice"}-${label}.pdf`;
}
