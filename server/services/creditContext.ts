import { sumMinor } from "../../src/utils/money.js";
import type { Queryable } from "./ledger.js";
import { requireScopedRecord } from "./ledger.js";
import type { CreditLot } from "../../src/domain/creditNotes.js";
export async function workspaceToday(db: Queryable, businessId: string) {
  const r = await db.query("select timezone from businesses where id=$1", [
    businessId,
  ]);
  return (
    process.env.APP_DATE_OVERRIDE ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: r.rows[0]?.timezone || "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  );
}
export async function creditContext(
  db: Queryable,
  businessId: string,
  partyId: string,
) {
  const party = await requireScopedRecord(db, "parties", businessId, partyId);
  const notes = await db.query(
    `select n.*,i.display_id,u.name actor,
 coalesce((select sum(x.amount_minor) from credit_uses x where x.credit_id=n.id and x.kind='application'),0) applied_minor,
 coalesce((select sum(x.amount_minor) from credit_uses x where x.credit_id=n.id and x.kind='refund'),0) refunded_minor
 from credit_notes n join invoices i on i.id=n.invoice_id join users u on u.id=n.user_id
 where n.business_id=$1 and n.party_id=$2 order by n.date,n.created_at,n.id`,
    [businessId, partyId],
  );
  const entries = notes.rows.map((n) => ({
    id: n.id,
    invoiceId: n.invoice_id,
    displayId: n.display_id,
    date: n.date,
    reason: n.reason,
    actor: n.actor,
    subtotalMinor: Number(n.subtotal_minor),
    taxMinor: Number(n.tax_minor),
    discountMinor: Number(n.discount_minor),
    totalMinor: Number(n.total_minor),
    fundedMinor: Number(n.funded_minor),
    appliedMinor: Number(n.applied_minor),
    refundedMinor: Number(n.refunded_minor),
    availableMinor:
      Number(n.funded_minor) -
      Number(n.applied_minor) -
      Number(n.refunded_minor),
  }));
  const lots: CreditLot[] = entries.map((n) => ({
    ...n,
    businessId,
    partyId,
    kind: party.kind as CreditLot["kind"],
  }));
  const uses = await db.query(
    `select x.*,n.invoice_id source_invoice_id,i.id invoice_id,i.display_id,u.name actor
 from credit_uses x join credit_notes n on n.id=x.credit_id left join invoices i on i.transaction_id=x.transaction_id join users u on u.id=x.user_id
 where x.business_id=$1 and n.party_id=$2 order by x.date,x.created_at,x.id`,
    [businessId, partyId],
  );
  const today = await workspaceToday(db, businessId);
  return {
    today,
    partyId,
    kind: party.kind as CreditLot["kind"],
    lots,
    notes: entries,
    availableMinor: sumMinor(
      entries.filter((n) => n.date <= today).map((n) => n.availableMinor),
    ),
    history: uses.rows.map((x) => ({
      id: x.id,
      creditId: x.credit_id,
      kind: x.kind,
      date: x.date,
      amountMinor: Number(x.amount_minor),
      reason: x.reason,
      actor: x.actor,
      invoiceId: x.invoice_id || undefined,
      displayId: x.display_id || undefined,
      paymentId: x.payment_id || undefined,
      sourceInvoiceId: x.source_invoice_id,
    })),
  };
}
