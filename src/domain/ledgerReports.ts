import { z } from "zod";
import { fromMinor, safeMinor, sumMinor } from "../utils/money.js";
import type { FinancialReport, SalesRow } from "../types/financialReports.js";

export const reportMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((v) => Number(v.slice(0, 4)) >= 1000, "Invalid reporting year");
export function reportMonthBounds(value: string) {
  const period = reportMonth.parse(value);
  const [year, month] = period.split("-").map(Number);
  return {
    start: `${period}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}
export interface SaleRecord {
  id: string;
  displayId: string;
  invoiceId?: string;
  date: string;
  party: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}
export function salesReport(
  period: string,
  source: SaleRecord[],
): FinancialReport | null {
  const { start, end } = reportMonthBounds(period);
  const records = source
    .filter((r) => r.date >= start && r.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (!records.length) return null;
  const sales: SalesRow[] = records.map((r) => ({
    id: r.id,
    displayId: r.displayId,
    invoiceId: r.invoiceId,
    date: r.date,
    party: r.party,
    subtotal: fromMinor(r.subtotalMinor),
    discount: fromMinor(r.discountMinor),
    tax: fromMinor(r.taxMinor),
    total: fromMinor(r.totalMinor),
  }));
  const totals = (
    key: "subtotalMinor" | "discountMinor" | "taxMinor" | "totalMinor",
  ) => fromMinor(sumMinor(records.map((r) => r[key])));
  return {
    kind: "sales",
    period,
    aging: [],
    cash: [],
    chart: [],
    sales,
    lines: [
      { label: "Subtotal", amount: totals("subtotalMinor") },
      { label: "Discounts", amount: totals("discountMinor") },
      { label: "Tax", amount: totals("taxMinor") },
      { label: "Sales Total (including tax)", amount: totals("totalMinor") },
    ],
  };
}
export interface PayableRecord {
  partyId: string;
  party: string;
  date: string;
  dueDate: string;
  balanceMinor: number;
}
export function payableAging(
  period: string,
  records: PayableRecord[],
): FinancialReport | null {
  const { end } = reportMonthBounds(period);
  const groups = new Map<
    string,
    {
      partyId: string;
      party: string;
      current: number;
      thirty: number;
      sixty: number;
      ninety: number;
    }
  >();
  for (const r of records) {
    if (r.date > end || r.balanceMinor <= 0) continue;
    safeMinor(r.balanceMinor);
    const days = Math.floor(
      (Date.parse(end) - Date.parse(r.dueDate)) / 86400000,
    );
    if (!Number.isFinite(days)) throw Error("Invalid bill due date");
    const key =
      days <= 0
        ? "current"
        : days <= 30
          ? "thirty"
          : days <= 60
            ? "sixty"
            : "ninety";
    const row = groups.get(r.partyId) || {
      partyId: r.partyId,
      party: r.party,
      current: 0,
      thirty: 0,
      sixty: 0,
      ninety: 0,
    };
    row[key] = sumMinor([row[key], r.balanceMinor]);
    groups.set(r.partyId, row);
  }
  if (!groups.size) return null;
  const rows = [...groups.values()].sort(
    (a, b) =>
      a.party.localeCompare(b.party) || a.partyId.localeCompare(b.partyId),
  );
  const total = {
    partyId: "__total__",
    party: "TOTAL",
    current: 0,
    thirty: 0,
    sixty: 0,
    ninety: 0,
  };
  for (const key of ["current", "thirty", "sixty", "ninety"] as const)
    total[key] = sumMinor(rows.map((r) => r[key]));
  return {
    kind: "ap-aging",
    period,
    lines: [],
    cash: [],
    chart: [],
    aging: [...rows, total].map((r) => ({
      partyId: r.partyId,
      party: r.party,
      current: fromMinor(r.current),
      thirty: fromMinor(r.thirty),
      sixty: fromMinor(r.sixty),
      ninety: fromMinor(r.ninety),
      total: fromMinor(sumMinor([r.current, r.thirty, r.sixty, r.ninety])),
    })),
  };
}
