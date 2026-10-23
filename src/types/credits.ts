export interface CreditEntry {
  id: string;
  invoiceId: string;
  displayId: string;
  date: string;
  reason: string;
  actor: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  fundedMinor: number;
  appliedMinor: number;
  refundedMinor: number;
  availableMinor: number;
}
export interface CreditHistoryEntry {
  id: string;
  creditId: string;
  kind: "application" | "refund";
  date: string;
  amountMinor: number;
  reason: string;
  actor: string;
  invoiceId?: string;
  displayId?: string;
  paymentId?: string;
  sourceInvoiceId: string;
}
export interface PartyCreditContext {
  today: string;
  partyId: string;
  kind: "Customer" | "Supplier";
  availableMinor: number;
  notes: CreditEntry[];
  history: CreditHistoryEntry[];
}
export type CreditAction = "note" | "application" | "refund";
export interface CreditRequest {
  requestId: string;
  amountMinor: number;
  effectiveDate: string;
  reason: string;
  invoiceId?: string;
  revision?: string;
  partyId?: string;
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  method?: string;
  reference?: string;
}
