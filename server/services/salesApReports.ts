import type { Queryable } from "./ledger.js";
import {
  payableAging,
  reportMonthBounds,
  salesReport,
} from "../../src/domain/ledgerReports.js";
import { safeMinor } from "../../src/utils/money.js";

export async function salesApReport(
  pool: Queryable,
  businessId: string,
  kind: "sales" | "ap-aging",
  period: string,
) {
  const { start, end } = reportMonthBounds(period);
  if (kind === "sales") {
    // One posted transaction per row; payment and item joins would duplicate sales.
    const result = await pool.query(
      `select t.id,t.display_id,t.date,party.name,
      t.subtotal_minor,t.discount_minor,t.tax_minor,t.total_minor,
      i.id invoice_id,i.display_id invoice_display_id
      from transactions t join parties party on party.id=t.party_id and party.business_id=t.business_id
      left join invoices i on i.transaction_id=t.id and i.business_id=t.business_id
      where t.business_id=$1 and t.type='Sale' and t.date between $2 and $3
      order by t.date desc,t.id`,
      [businessId, start, end],
    );
    return salesReport(
      period,
      result.rows.map((r) => ({
        id: r.display_id,
        displayId: r.invoice_display_id || r.display_id,
        invoiceId: r.invoice_id || undefined,
        date: r.date,
        party: r.name,
        subtotalMinor: safeMinor(Number(r.subtotal_minor)),
        discountMinor: safeMinor(Number(r.discount_minor)),
        taxMinor: safeMinor(Number(r.tax_minor)),
        totalMinor: safeMinor(Number(r.total_minor)),
      })),
    );
  }
  // The settlement view includes manual and FIFO payments once, with the allocation's effective date.
  const result = await pool.query(
    `select party.id party_id,party.name,i.date,i.due_date,
    i.total_minor-coalesce(s.paid_minor,0) balance_minor
    from invoices i join parties party on party.id=i.party_id and party.business_id=i.business_id
    left join (select transaction_id,business_id,sum(amount_minor) paid_minor
      from ledger_settlements where business_id=$1 and effective_date<=$2
      group by transaction_id,business_id) s on s.transaction_id=i.transaction_id and s.business_id=i.business_id
    where i.business_id=$1 and party.kind='Supplier' and i.status<>'Draft' and i.date<=$2
      and i.total_minor-coalesce(s.paid_minor,0)>0`,
    [businessId, end],
  );
  return payableAging(
    period,
    result.rows.map((r) => ({
      partyId: r.party_id,
      party: r.name,
      date: r.date,
      dueDate: r.due_date,
      balanceMinor: safeMinor(Number(r.balance_minor)),
    })),
  );
}
