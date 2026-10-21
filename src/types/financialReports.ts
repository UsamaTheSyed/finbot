export type ReportKind =
  | "daily"
  | "ar-aging"
  | "profit-loss"
  | "cash-flow"
  | "sales"
  | "ap-aging"
  | "purchases";
export interface ReportLine {
  label: string;
  amount: number;
  emphasis?: "success" | "danger" | "net";
}
export interface AgingRow {
  partyId?: string;
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
export interface SalesRow {
  id: string;
  displayId: string;
  invoiceId?: string;
  date: string;
  party: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}
export interface FinancialReport {
  sales?: SalesRow[];
  purchases?: SalesRow[];
  kind: ReportKind;
  period: string;
  lines: ReportLine[];
  aging: AgingRow[];
  cash: CashRow[];
  chart: { label: string; revenue: number; expenses: number }[];
}
