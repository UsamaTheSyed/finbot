import type { DatabasePool } from "../db/client.js";
import type { Queryable } from "./ledger.js";
import {
  journalBalances,
  profitAmounts,
  type Journal,
} from "../../src/domain/accounting.js";
import type { FinancialReport } from "../../src/types/financialReports.js";
export async function accountingReport(
  pool: DatabasePool,
  b: string,
  from: string,
  to: string,
) {
  const c = await pool.connect();
  try {
    await c.query("begin isolation level repeatable read read only");
    const config = (
      await c.query(
        "select date,created_at,user_id,snapshot from accounting_cutovers where business_id=$1",
        [b],
      )
    ).rows[0];
    if (!config) {
      await c.query("commit");
      return { active: false as const };
    }
    const journals = (
      await c.query(
        `select j.source,j.date,j.lines,i.id "invoiceId",
 case when j.source='opening' then 'Opening balances'
 when s.payload->>'kind'='document' then concat(s.payload->>'type',' · ',i.display_id,' · ',s.payload->>'movement')
 when s.payload->>'kind'='stock' then concat(s.payload->>'movement',' · ',p.name,' · ',i.display_id)
 when s.payload->>'kind'='payment' then concat('Payment · ',a.name,' · ',s.payload->>'direction')
 else 'Supplier credit cost allocation' end description
 from accounting_journals j left join accounting_sources s on s.business_id=j.business_id and s.source=j.source
 left join invoices i on i.id=s.payload->>'invoice' and i.business_id=j.business_id
 left join products p on p.id=s.payload->>'product' and p.business_id=j.business_id
 left join parties a on a.id=s.payload->>'party' and a.business_id=j.business_id
 where j.business_id=$1 and j.date<=$2 order by j.date,j.created_at,j.source`,
        [b, to],
      )
    ).rows as Journal[];
    const pending = (
      await c.query(
        `select cn.id,cn.invoice_id,cn.date,cn.subtotal_minor-cn.discount_minor net_minor,i.display_id
 from credit_notes cn join invoices i on i.id=cn.invoice_id join accounting_journals j on j.business_id=cn.business_id and j.source='document:'||cn.id
 where cn.business_id=$1 and cn.date<=$2 and not exists(select 1 from accounting_credit_resolutions r where r.credit_id=cn.id and r.date<=$2)
 and exists(select 1 from jsonb_array_elements(j.lines) l where l->>'account'='Supplier credits pending allocation')`,
        [b, to],
      )
    ).rows;
    const accounts = journalBalances(journals, from, to);
    const inventory = Number(
      (
        await c.query(
          "select coalesce(sum(s.value_minor),0) value from warehouse_stock s join products p on p.id=s.product_id where p.business_id=$1",
          [b],
        )
      ).rows[0].value,
    );
    await c.query("commit");
    return {
      active: true as const,
      config,
      accounts,
      journals: journals.filter((j) => j.date >= from),
      pending,
      currentInventoryMinor: inventory,
      provisional: pending.length > 0,
      warnings: pending.length
        ? ["Supplier credits need cost allocation before profit is final."]
        : [],
    };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
export async function accountingProfit(
  c: Queryable,
  b: string,
  period: string,
): Promise<FinancialReport | null | undefined> {
  // A single statement keeps the configuration, journals and pending balance consistent.
  const [year, month] = period.split("-").map(Number),
    start = period + "-01",
    end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    six = new Date(Date.UTC(year, month - 6, 1)).toISOString().slice(0, 10);
  const data = (
    await c.query(
      `select a.date,
 (select coalesce(json_agg(j order by date,source),'[]') from accounting_journals j where business_id=$1 and date between $2 and $3 and source<>'opening') journals,
 (select coalesce(sum((l->>'amountMinor')::bigint),0) from accounting_journals j cross join lateral jsonb_array_elements(j.lines) l where business_id=$1 and date<=$3 and l->>'account'='Supplier credits pending allocation') pending
 from accounting_cutovers a where business_id=$1`,
      [b, six, end],
    )
  ).rows[0];
  if (!data || end < data.date) return undefined;
  const journals = data.journals as Journal[];
  if (
    !journals.some((j) => j.date >= start) &&
    period !== String(data.date).slice(0, 7)
  )
    return null;
  const p = profitAmounts(journals, start, end),
    provisional = Number(data.pending) !== 0;
  const chart = Array.from({ length: 6 }, (_, i) => {
    const key = new Date(Date.UTC(year, month - 6 + i, 1))
        .toISOString()
        .slice(0, 7),
      v = profitAmounts(journals, key + "-01", key + "-31");
    return {
      label: key,
      revenue: v.revenue / 100,
      expenses: (v.cogs + v.expenses + v.adjustments) / 100,
    };
  });
  return {
    kind: "profit-loss",
    period,
    aging: [],
    cash: [],
    chart,
    accountingBasis: `Accounting cutover ${data.date}: post-activation journals only. Tracked sales and COGS recognized at dispatch; untracked sales at issue. Earlier months remain legacy.`,
    warnings: provisional
      ? ["Supplier credit allocations are pending. This result is provisional."]
      : [],
    lines: [
      { label: "Sales Revenue (excluding tax)", amount: p.revenue / 100 },
      { label: "Other Income", amount: 0 },
      { label: "Total Revenue", amount: p.revenue / 100, emphasis: "success" },
      { label: "Cost of Goods Sold", amount: p.cogs / 100 },
      { label: "Untracked Purchase Expenses", amount: p.expenses / 100 },
      { label: "Inventory Adjustments", amount: p.adjustments / 100 },
      {
        label: "Total Expenses",
        amount: (p.cogs + p.expenses + p.adjustments) / 100,
        emphasis: "danger",
      },
      {
        label: provisional ? "PROVISIONAL RESULT" : "NET PROFIT",
        amount: p.profit / 100,
        emphasis: "net",
      },
    ],
  };
}
