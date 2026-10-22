import type { Queryable } from "./ledger.js";
import { fromMinor } from "../domain/money.js";
const monthBounds = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
};

export async function dashboardReport(pool: Queryable, businessId: string) {
  const result = await pool.query(
    `select b.opening_cash_minor
       + coalesce((select sum(case direction when 'Received' then amount_minor else -amount_minor end) from payments where business_id=b.id and status='Completed'),0) as cash_minor,
       coalesce((select sum(case when t.type='Sale' then t.total_minor-coalesce(p.paid,0) else 0 end) from transactions t left join (select transaction_id,sum(amount_minor) paid from ledger_settlements group by transaction_id) p on p.transaction_id=t.id where t.business_id=b.id),0) as receivable_minor,
       coalesce((select sum(case when t.type='Purchase' then t.total_minor-coalesce(p.paid,0) else 0 end) from transactions t left join (select transaction_id,sum(amount_minor) paid from ledger_settlements group by transaction_id) p on p.transaction_id=t.id where t.business_id=b.id),0) as payable_minor
       from businesses b where b.id=$1`,
    [businessId],
  );
  const row = result.rows[0];
  return [
    {
      id: "dashboard",
      businessId,
      asOf: new Date().toISOString().slice(0, 10),
      totalCash: fromMinor(Number(row.cash_minor)),
      receivable: fromMinor(Number(row.receivable_minor)),
      payable: fromMinor(Number(row.payable_minor)),
    },
  ];
}
export async function financialReport(
  pool: Queryable,
  businessId: string,
  kind: "daily" | "ar-aging" | "profit-loss" | "cash-flow",
  period: string,
) {
  const empty = { kind, period, lines: [], aging: [], cash: [], chart: [] };
  if (kind === "daily") {
    const result = await pool.query(
      `select
          coalesce(sum(total_minor) filter(where type='Sale'),0)::bigint sales,
          coalesce(sum(total_minor) filter(where type='Purchase'),0)::bigint purchases
         from ledger_movements where business_id=$1 and date=$2`,
      [businessId, period],
    );
    const payments = await pool.query(
      `select coalesce(sum(amount_minor) filter(where direction='Received'),0)::bigint incoming,
                coalesce(sum(amount_minor) filter(where direction='Sent'),0)::bigint outgoing,
                count(*)::int count
         from payments where business_id=$1 and date=$2 and status='Completed'`,
      [businessId, period],
    );
    const row = result.rows[0],
      cash = payments.rows[0];
    if (
      Number(row.sales) === 0 &&
      Number(row.purchases) === 0 &&
      cash.count === 0
    )
      return null;
    return {
      ...empty,
      lines: [
        { label: "Sales Today", amount: fromMinor(Number(row.sales)) },
        { label: "Purchases Today", amount: fromMinor(Number(row.purchases)) },
        { label: "Cash In", amount: fromMinor(Number(cash.incoming)) },
        { label: "Cash Out", amount: fromMinor(Number(cash.outgoing)) },
        {
          label: "Net Cash",
          amount: fromMinor(Number(cash.incoming) - Number(cash.outgoing)),
          emphasis: "success",
        },
      ],
    };
  }
  const { start, end } = monthBounds(period);
  if (kind === "ar-aging") {
    const result = await pool.query(
      `select party.name,i.due_date,
         i.total_minor-coalesce(c.future_delta,0)-coalesce(s.paid,0) balance_minor
         from invoices i join parties party on party.id=i.party_id
         left join (select invoice_id,sum(total_delta) future_delta from invoice_corrections where date>$2 group by invoice_id) c on c.invoice_id=i.id
         left join (select transaction_id,sum(amount_minor) paid from ledger_settlements where effective_date<=$2 group by transaction_id) s on s.transaction_id=i.transaction_id
         where i.business_id=$1 and i.status<>'Draft' and i.date<=$2 and party.kind='Customer'
         and i.total_minor-coalesce(c.future_delta,0)-coalesce(s.paid,0)>0`,
      [businessId, end],
    );
    if (!result.rows.length) return null;
    const groups = new Map<
      string,
      { current: number; thirty: number; sixty: number; ninety: number }
    >();
    for (const row of result.rows) {
      const days = Math.floor(
        (Date.parse(end) - Date.parse(row.due_date)) / 86_400_000,
      );
      const bucket =
        days <= 0
          ? "current"
          : days <= 30
            ? "thirty"
            : days <= 60
              ? "sixty"
              : "ninety";
      const current = groups.get(row.name) || {
        current: 0,
        thirty: 0,
        sixty: 0,
        ninety: 0,
      };
      current[bucket] += Number(row.balance_minor);
      groups.set(row.name, current);
    }
    const aging = [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([party, row]) => ({
        party,
        current: fromMinor(row.current),
        thirty: fromMinor(row.thirty),
        sixty: fromMinor(row.sixty),
        ninety: fromMinor(row.ninety),
        total: fromMinor(row.current + row.thirty + row.sixty + row.ninety),
      }));
    aging.push({
      party: "TOTAL",
      current: aging.reduce((s, r) => s + r.current, 0),
      thirty: aging.reduce((s, r) => s + r.thirty, 0),
      sixty: aging.reduce((s, r) => s + r.sixty, 0),
      ninety: aging.reduce((s, r) => s + r.ninety, 0),
      total: aging.reduce((s, r) => s + r.total, 0),
    });
    return { ...empty, aging };
  }
  if (kind === "profit-loss") {
    const result = await pool.query(
      `select coalesce(sum(total_minor) filter(where type='Sale'),0)::bigint revenue,
                coalesce(sum(total_minor) filter(where type='Purchase'),0)::bigint expenses,count(*)::int count
         from ledger_movements where business_id=$1 and date between $2 and $3`,
      [businessId, start, end],
    );
    if (!result.rows[0].count) return null;
    const revenue = Number(result.rows[0].revenue),
      expenses = Number(result.rows[0].expenses);
    const chartResult = await pool.query(
      `select to_char(date_trunc('month', date), 'YYYY-MM') AS "month",
          coalesce(sum(total_minor) filter(where type='Sale'),0)::bigint revenue,
          coalesce(sum(total_minor) filter(where type='Purchase'),0)::bigint expenses
         from ledger_movements where business_id=$1 and date >= ($2::date - interval '5 months') and date <= $3
         group by 1 order by 1`,
      [businessId, start, end],
    );
    const chartValues = new Map(
      chartResult.rows.map((row) => [row.month, row]),
    );
    const [year, month] = period.split("-").map(Number);
    const chart = Array.from({ length: 6 }, (_, index) => {
      const monthKey = new Date(Date.UTC(year, month - 1 + index - 5, 1))
        .toISOString()
        .slice(0, 7);
      const row = chartValues.get(monthKey);
      return {
        label: new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en", {
          month: "short",
          timeZone: "UTC",
        }),
        revenue: row ? fromMinor(Number(row.revenue)) : 0,
        expenses: row ? fromMinor(Number(row.expenses)) : 0,
      };
    });
    return {
      ...empty,
      lines: [
        { label: "Sales Revenue", amount: fromMinor(revenue) },
        { label: "Other Income", amount: 0 },
        {
          label: "Total Revenue",
          amount: fromMinor(revenue),
          emphasis: "success",
        },
        { label: "Purchases", amount: fromMinor(expenses) },
        { label: "Operating Expenses", amount: 0 },
        { label: "Salaries", amount: 0 },
        { label: "Other Expenses", amount: 0 },
        {
          label: "Total Expenses",
          amount: fromMinor(expenses),
          emphasis: "danger",
        },
        {
          label: "NET PROFIT",
          amount: fromMinor(revenue - expenses),
          emphasis: "net",
        },
      ],
      chart,
    };
  }
  const opening = await pool.query(
    `select opening_cash_minor + coalesce((select sum(case direction when 'Received' then amount_minor else -amount_minor end)
       from payments where business_id=$1 and status='Completed' and date<$2),0) balance from businesses where id=$1`,
    [businessId, start],
  );
  const movements = await pool.query(
    `select p.*,party.name from payments p join parties party on party.id=p.party_id
       where p.business_id=$1 and p.status='Completed' and p.date between $2 and $3 order by p.date,p.display_id`,
    [businessId, start, end],
  );
  if (!movements.rows.length) return null;
  let balance = Number(opening.rows[0].balance);
  const daily = new Map<string, { incoming: number; outgoing: number }>();
  const cash = movements.rows
    .map((row) => {
      balance +=
        row.direction === "Received"
          ? Number(row.amount_minor)
          : -Number(row.amount_minor);
      const totals = daily.get(row.date) || { incoming: 0, outgoing: 0 };
      if (row.direction === "Received")
        totals.incoming += Number(row.amount_minor);
      else totals.outgoing += Number(row.amount_minor);
      daily.set(row.date, totals);
      return {
        date: row.date,
        description: `${row.method} ${row.direction.toLowerCase()} — ${row.name}`,
        category:
          row.direction === "Received"
            ? "Customer receipts"
            : "Supplier payments",
        incoming:
          row.direction === "Received"
            ? fromMinor(Number(row.amount_minor))
            : 0,
        outgoing:
          row.direction === "Sent" ? fromMinor(Number(row.amount_minor)) : 0,
        balance: fromMinor(balance),
      };
    })
    .reverse();
  const incoming = movements.rows
    .filter((row) => row.direction === "Received")
    .reduce((sum, row) => sum + Number(row.amount_minor), 0);
  const outgoing = movements.rows
    .filter((row) => row.direction === "Sent")
    .reduce((sum, row) => sum + Number(row.amount_minor), 0);
  return {
    ...empty,
    lines: [
      {
        label: "Opening Balance",
        amount: fromMinor(Number(opening.rows[0].balance)),
      },
      { label: "Cash In", amount: fromMinor(incoming), emphasis: "success" },
      { label: "Cash Out", amount: fromMinor(outgoing), emphasis: "danger" },
      {
        label: "Closing Balance",
        amount: fromMinor(
          Number(opening.rows[0].balance) + incoming - outgoing,
        ),
      },
    ],
    cash,
    chart: [...daily].map(([date, row]) => ({
      label: date.slice(5),
      revenue: fromMinor(row.incoming),
      expenses: fromMinor(row.outgoing),
    })),
  };
}
