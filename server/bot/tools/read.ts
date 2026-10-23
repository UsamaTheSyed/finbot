import type { PoolClient } from "pg";
import { partySummaries } from "../../services/parties.js";
import { dashboardReport, financialReport } from "../../services/reports.js";
import { invoiceDto, requireScopedRecord } from "../../services/ledger.js";
import type { Conversation, Identity } from "../types.js";
import { dateRange, localDate, pkr, shiftDate } from "../core/normalize.js";

export async function searchParty(
  client: PoolClient,
  businessId: string,
  name: string,
) {
  // POSITION treats % and _ literally; every candidate stays workspace scoped.
  return (
    await client.query(
      "select id,name,kind from parties where business_id=$1 and position(lower($2) in lower(name))>0 order by name,id limit 11",
      [businessId, name],
    )
  ).rows as { id: string; name: string; kind: string }[];
}
export async function searchInvoice(
  client: PoolClient,
  businessId: string,
  partyId?: string,
  reference?: string,
  outstanding = false,
) {
  const rows = await client.query(
    `select i.id from invoices i where i.business_id=$1
    and ($2::text is null or i.party_id=$2)
    and ($3::text is null or lower(i.display_id)=lower($3) or lower(i.reference)=lower($3))
    and (not $4::boolean or (i.status<>'Draft' and i.total_minor>coalesce((select sum(a.amount_minor) from ledger_settlements a where a.transaction_id=i.transaction_id and a.business_id=i.business_id),0)))
    order by i.date desc,i.display_id limit 11`,
    [businessId, partyId ?? null, reference ?? null, outstanding],
  );
  const invoices = [];
  for (const row of rows.rows)
    invoices.push(await invoiceDto(client, businessId, row.id));
  return invoices;
}
export async function readTool(
  client: PoolClient,
  identity: Identity,
  state: Conversation,
  now: Date,
): Promise<string> {
  const { business_id: businessId, timezone } = identity,
    e = state.extraction;
  if (
    ["GET_PARTY_BALANCE", "GET_PARTY_STATEMENT", "SEARCH_PARTY"].includes(
      e.intent,
    )
  ) {
    const party = (await partySummaries(client, businessId)).find(
      (p) => p.id === state.partyId,
    );
    if (!party)
      return "Party nahi mila. Web app mein party banayein ya naam dobara dein.";
    const summary = `${party.name} (${party.kind})\nLedger balance: ${pkr(party.balanceMinor)}\nPositive = receivable; negative = payable/credit.`;
    if (e.intent !== "GET_PARTY_STATEMENT") return summary;
    const rows = await client.query(
      `select date,display_id,case when movement_kind='credit' then type::text || ' credit' when is_correction then type::text || ' correction' else type::text end as label,total_minor as amount from ledger_movements where business_id=$1 and party_id=$2
      union all select date,display_id,direction::text as label,amount_minor as amount from payments where business_id=$1 and party_id=$2 and status='Completed'
      order by date desc,display_id limit 20`,
      [businessId, party.id],
    );
    return (
      summary +
      "\nRecent ledger entries (up to 20; full statement in FinBot):\n" +
      rows.rows
        .map(
          (r) =>
            `${r.date} · ${r.display_id} · ${r.label} · ${pkr(Number(r.amount))}`,
        )
        .join("\n")
    );
  }
  if (
    ["SEARCH_INVOICE", "GET_INVOICE", "GET_OUTSTANDING_INVOICES"].includes(
      e.intent,
    )
  ) {
    if (state.invoiceId) {
      await requireScopedRecord(
        client,
        "invoices",
        businessId,
        state.invoiceId,
      );
      const i = await invoiceDto(client, businessId, state.invoiceId);
      return `${i.displayId} · ${i.status}\nDate: ${i.date}\nDue: ${i.dueDate}\nTotal: ${pkr(i.totalMinor)}\nPaid: ${pkr(i.paidMinor)}\nBalance: ${pkr(i.balanceMinor)}`;
    }
    const list = await searchInvoice(
      client,
      businessId,
      state.partyId,
      e.invoiceReference ?? undefined,
      e.intent === "GET_OUTSTANDING_INVOICES",
    );
    return list.length
      ? list
          .slice(0, 10)
          .map(
            (i) => `${i.displayId} · ${i.status} · due ${pkr(i.balanceMinor)}`,
          )
          .join("\n") +
          (list.length > 10
            ? "\nMore results: narrow by party or use FinBot."
            : "")
      : "Matching invoices nahi mile.";
  }
  if (e.intent === "GET_RECEIVABLES" || e.intent === "GET_PAYABLES") {
    const [r] = await dashboardReport(client, businessId);
    return e.intent === "GET_RECEIVABLES"
      ? `Dashboard A/R due: ${pkr(Math.round(r.receivable * 100))}`
      : `Dashboard A/P owing: ${pkr(Math.round(r.payable * 100))}`;
  }
  if (e.intent === "GET_DAILY_SUMMARY") {
    const range = dateRange(e.dateText ?? "today", timezone, now);
    const totals = new Map<string, number>();
    for (let day = range.start; day <= range.end; day = shiftDate(day, 1)) {
      const report = await financialReport(client, businessId, "daily", day);
      for (const line of report?.lines ?? [])
        totals.set(
          line.label,
          (totals.get(line.label) ?? 0) + Math.round(line.amount * 100),
        );
    }
    return (
      `${range.start} — ${range.end}\n` +
      (totals.size
        ? [...totals]
            .map(
              ([label, amount]) =>
                `${label.replace(" Today", "")}: ${pkr(amount)}`,
            )
            .join("\n")
        : "No ledger activity.")
    );
  }
  if (e.intent === "GET_CASH_FLOW") {
    const raw = e.dateText ?? "this month";
    const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)
      ? raw
      : ["this month", "is mahine"].includes(raw.toLowerCase())
        ? localDate(timezone, now).slice(0, 7)
        : null;
    if (!period)
      return "Cash-flow report ke liye month YYYY-MM dein, ya ‘this month’ likhein.";
    const r = await financialReport(client, businessId, "cash-flow", period);
    return (
      `Cash flow ${period}\n` +
      (r
        ? r.lines
            .map((l) => `${l.label}: ${pkr(Math.round(l.amount * 100))}`)
            .join("\n")
        : "No cash activity for this month.")
    );
  }
  return "Is request ko samajh nahi saka. Party balance, invoices, payment, sale, supplier bill ya daily summary poochein.";
}
