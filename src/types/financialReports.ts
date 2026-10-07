export type ReportKind = "daily" | "ar-aging" | "profit-loss" | "cash-flow";
export interface ReportLine {
  label: string;
  amount: number;
  emphasis?: "success" | "danger" | "net";
}
export interface AgingRow {
  party: string;
  current: number;
  thirty: number;
  sixty: number;
  ninety: number;
  total: number;
}
export interface CashRow {
  date: string;
  description: string;
  category: string;
  incoming: number;
  outgoing: number;
  balance: number;
}
export interface FinancialReport {
  kind: ReportKind;
  period: string;
  lines: ReportLine[];
  aging: AgingRow[];
  cash: CashRow[];
  chart: { label: string; revenue: number; expenses: number }[];
}
