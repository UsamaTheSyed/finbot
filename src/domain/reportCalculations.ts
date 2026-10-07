import type { Invoice, Party, Payment, Transaction } from "../types";
import type {
  AgingRow,
  CashRow,
  FinancialReport,
} from "../types/financialReports";
import { fromMinor, sumMinor, toMinor } from "../utils/money";

const DAY = 86_400_000;

export type AgingBucket = "current" | "thirty" | "sixty" | "ninety";

export function getAgingBucket(
  dueDate: string,
  reportDate: string,
): AgingBucket {
  const days = Math.floor((Date.parse(reportDate) - Date.parse(dueDate)) / DAY);
  if (days <= 0) return "current";
  if (days <= 30) return "thirty";
  if (days <= 60) return "sixty";
  return "ninety";
}

export function monthBounds(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Invalid report period.");
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1)
    throw new Error("Invalid report period.");
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const inRange = (date: string, start: string, end: string) =>
  date >= start && date <= end;

const paymentMovement = (payment: Payment) =>
  payment.amountMinor * (payment.direction === "Received" ? 1 : -1);

export function dailySummary(
  businessId: string,
  date: string,
  transactions: Transaction[],
  payments: Payment[],
): FinancialReport | null {
  const dayTransactions = transactions.filter(
    (row) => row.businessId === businessId && row.date === date,
  );
  const dayPayments = payments.filter(
    (row) =>
      row.businessId === businessId &&
      row.date === date &&
      row.status === "Completed",
  );
  if (!dayTransactions.length && !dayPayments.length) return null;
  const sales = sumMinor(
    dayTransactions
      .filter((row) => row.type === "Sale")
      .map((row) => toMinor(row.total)),
  );
  const purchases = sumMinor(
    dayTransactions
      .filter((row) => row.type === "Purchase")
      .map((row) => toMinor(row.total)),
  );
  const cashIn = sumMinor(
    dayPayments
      .filter((row) => row.direction === "Received")
      .map((row) => row.amountMinor),
  );
  const cashOut = sumMinor(
    dayPayments
      .filter((row) => row.direction === "Sent")
      .map((row) => row.amountMinor),
  );
  return {
    kind: "daily",
    period: date,
    aging: [],
    cash: [],
    chart: [],
    lines: [
      { label: "Sales Today", amount: fromMinor(sales) },
      { label: "Purchases Today", amount: fromMinor(purchases) },
      { label: "Cash In", amount: fromMinor(cashIn) },
      { label: "Cash Out", amount: fromMinor(cashOut) },
      {
        label: "Net Cash",
        amount: fromMinor(sumMinor([cashIn, -cashOut])),
        emphasis: "success",
      },
    ],
  };
}

export function arAging(
  businessId: string,
  period: string,
  invoices: Invoice[],
  parties: Party[],
): FinancialReport | null {
  const { end } = monthBounds(period);
  const names = new Map(
    parties
      .filter((party) => party.businessId === businessId)
      .map((party) => [party.id, party]),
  );
  const rows = new Map<string, Omit<AgingRow, "party" | "total">>();
  for (const invoice of invoices) {
    const party = names.get(invoice.partyId);
    if (
      invoice.businessId !== businessId ||
      invoice.status === "Draft" ||
      invoice.balanceMinor <= 0 ||
      invoice.date > end ||
      party?.kind !== "Customer"
    )
      continue;
    const row = rows.get(party.id) || {
      current: 0,
      thirty: 0,
      sixty: 0,
      ninety: 0,
    };
    const bucket = getAgingBucket(invoice.dueDate, end);
    row[bucket] = sumMinor([row[bucket], invoice.balanceMinor]);
    rows.set(party.id, row);
  }
  if (!rows.size) return null;
  const aging: AgingRow[] = [...rows.entries()]
    .map(([partyId, row]) => ({
      party: names.get(partyId)!.name,
      current: fromMinor(row.current),
      thirty: fromMinor(row.thirty),
      sixty: fromMinor(row.sixty),
      ninety: fromMinor(row.ninety),
      total: fromMinor(
        sumMinor([row.current, row.thirty, row.sixty, row.ninety]),
      ),
    }))
    .sort((a, b) => a.party.localeCompare(b.party));
  aging.push({
    party: "TOTAL",
    current: aging.reduce((sum, row) => sum + row.current, 0),
    thirty: aging.reduce((sum, row) => sum + row.thirty, 0),
    sixty: aging.reduce((sum, row) => sum + row.sixty, 0),
    ninety: aging.reduce((sum, row) => sum + row.ninety, 0),
    total: aging.reduce((sum, row) => sum + row.total, 0),
  });
  return { kind: "ar-aging", period, lines: [], cash: [], chart: [], aging };
}

function monthTotals(
  businessId: string,
  period: string,
  transactions: Transaction[],
) {
  const { start, end } = monthBounds(period);
  const rows = transactions.filter(
    (row) => row.businessId === businessId && inRange(row.date, start, end),
  );
  return {
    rows,
    revenue: sumMinor(
      rows
        .filter((row) => row.type === "Sale")
        .map((row) => toMinor(row.total)),
    ),
    expenses: sumMinor(
      rows
        .filter((row) => row.type === "Purchase")
        .map((row) => toMinor(row.total)),
    ),
  };
}

const shiftMonth = (period: string, offset: number) => {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
};

export function profitAndLoss(
  businessId: string,
  period: string,
  transactions: Transaction[],
): FinancialReport | null {
  const selected = monthTotals(businessId, period, transactions);
  if (!selected.rows.length) return null;
  const totalRevenue = selected.revenue;
  const totalExpenses = selected.expenses;
  return {
    kind: "profit-loss",
    period,
    aging: [],
    cash: [],
    lines: [
      { label: "Sales Revenue", amount: fromMinor(selected.revenue) },
      { label: "Other Income", amount: 0 },
      {
        label: "Total Revenue",
        amount: fromMinor(totalRevenue),
        emphasis: "success",
      },
      { label: "Purchases", amount: fromMinor(selected.expenses) },
      { label: "Operating Expenses", amount: 0 },
      { label: "Salaries", amount: 0 },
      { label: "Other Expenses", amount: 0 },
      {
        label: "Total Expenses",
        amount: fromMinor(totalExpenses),
        emphasis: "danger",
      },
      {
        label: "NET PROFIT",
        amount: fromMinor(sumMinor([totalRevenue, -totalExpenses])),
        emphasis: "net",
      },
    ],
    chart: Array.from({ length: 6 }, (_, index) =>
      shiftMonth(period, index - 5),
    )
      .map((month) => ({
        month,
        ...monthTotals(businessId, month, transactions),
      }))
      .map(({ month, revenue, expenses }) => ({
        label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
          month: "short",
          timeZone: "UTC",
        }),
        revenue: fromMinor(revenue),
        expenses: fromMinor(expenses),
      })),
  };
}

export function cashFlow(
  businessId: string,
  period: string,
  openingMinor: number,
  payments: Payment[],
  parties: Party[],
): FinancialReport | null {
  const { start, end } = monthBounds(period);
  const movements = payments
    .filter(
      (row) =>
        row.businessId === businessId &&
        row.status === "Completed" &&
        inRange(row.date, start, end),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!movements.length) return null;
  const names = new Map(parties.map((party) => [party.id, party.name]));
  let balance = openingMinor;
  const cash: CashRow[] = movements.map((payment) => {
    balance = sumMinor([balance, paymentMovement(payment)]);
    return {
      date: payment.date,
      description: `${payment.method} ${payment.direction.toLowerCase()} — ${names.get(payment.partyId) || "Unknown party"}`,
      category:
        payment.direction === "Received"
          ? "Customer receipts"
          : "Supplier payments",
      incoming:
        payment.direction === "Received" ? fromMinor(payment.amountMinor) : 0,
      outgoing:
        payment.direction === "Sent" ? fromMinor(payment.amountMinor) : 0,
      balance: fromMinor(balance),
    };
  });
  const cashIn = sumMinor(
    movements
      .filter((row) => row.direction === "Received")
      .map((row) => row.amountMinor),
  );
  const cashOut = sumMinor(
    movements
      .filter((row) => row.direction === "Sent")
      .map((row) => row.amountMinor),
  );
  const daily = new Map<string, { incoming: number; outgoing: number }>();
  for (const movement of movements) {
    const row = daily.get(movement.date) || { incoming: 0, outgoing: 0 };
    if (movement.direction === "Received")
      row.incoming = sumMinor([row.incoming, movement.amountMinor]);
    else row.outgoing = sumMinor([row.outgoing, movement.amountMinor]);
    daily.set(movement.date, row);
  }
  return {
    kind: "cash-flow",
    period,
    aging: [],
    lines: [
      { label: "Opening Balance", amount: fromMinor(openingMinor) },
      { label: "Cash In", amount: fromMinor(cashIn), emphasis: "success" },
      { label: "Cash Out", amount: fromMinor(cashOut), emphasis: "danger" },
      { label: "Closing Balance", amount: fromMinor(balance) },
    ],
    chart: [...daily.entries()].map(([date, row]) => ({
      label: date.slice(5),
      revenue: fromMinor(row.incoming),
      expenses: fromMinor(row.outgoing),
    })),
    cash: cash.reverse(),
  };
}

export const netPaymentMinor = (rows: Payment[]) =>
  sumMinor(
    rows.filter((row) => row.status === "Completed").map(paymentMovement),
  );
