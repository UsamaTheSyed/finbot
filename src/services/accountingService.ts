import { httpApi } from "./api";
import type { Journal } from "../domain/accounting";
export interface OpeningPreview {
  date: string;
  token: string;
  blockers: string[];
  cash: number;
  customer: number;
  supplier: number;
  inventory: number;
  parties: { id: string; name: string; kind: string; balance: number }[];
  stock: {
    productId: string;
    warehouseId: string;
    name: string;
    warehouse: string;
    quantityMilli: number;
    valueMinor: number | null;
  }[];
}
export interface AccountingReport {
  active: boolean;
  canManage: boolean;
  config?: { date: string; created_at: string };
  accounts?: {
    account: string;
    opening: number;
    debit: number;
    credit: number;
    closing: number;
  }[];
  journals?: Journal[];
  pending?: {
    id: string;
    invoice_id: string;
    display_id: string;
    net_minor: string;
    date: string;
  }[];
  warnings?: string[];
  provisional?: boolean;
}
const path = (b: string) => `/businesses/${encodeURIComponent(b)}/accounting`;
export const accountingService = {
  report: (b: string, from: string, to: string) =>
    httpApi.get<AccountingReport>(
      path(b) + "?" + new URLSearchParams({ from, to }),
    ),
  preview: (b: string, date: string) =>
    httpApi.get<OpeningPreview>(
      path(b) + "/preview?" + new URLSearchParams({ date }),
    ),
  activate: (b: string, v: unknown) => httpApi.post(path(b) + "/activate", v),
  resolve: (b: string, v: unknown) =>
    httpApi.post(path(b) + "/credits/resolve", v),
};
