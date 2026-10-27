export type TransactionType = "Sale" | "Purchase";
export type PaymentStatus = "Completed" | "Partial" | "Overdue" | "Unpaid";
export type PaymentMethod =
  "Cash" | "Bank Transfer" | "Easypaisa" | "JazzCash" | "Cheque";
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface Business {
  id: string;
  name: string;
  currency: "PKR";
  city: string;
}
export interface Party {
  id: string;
  businessId: string;
  name: string;
  kind: "Customer" | "Supplier";
  phone: string;
  email: string;
  ntn: string;
  address: string;
  paymentTerms: "Due on receipt" | "Net 15" | "Net 30" | "Net 60";
}
export interface TransactionItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
}
export interface Transaction {
  credited?: number;
  netTotal?: number;
  id: string;
  businessId: string;
  date: string;
  dueDate: string;
  partyId: string;
  type: TransactionType;
  status: PaymentStatus;
  createdBy: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number | null;
  total: number;
  paid: number;
  balance: number;
  notes: string;
}
export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Partial" | "Overdue";
export interface InvoiceItem {
  productId?: string;
  id: string;
  item: string;
  description: string;
  quantity: number;
  unit: string;
  rateMinor: number;
  taxPercent: number;
}
export interface Invoice {
  stockMode?:"Immediate"|"Deferred";
  warehouseId?:string;
  hasCreditHistory?: boolean;
  creditedMinor?: number;
  netTotalMinor?: number;
  revision?: string;
  /** Human-readable number. Optional for existing mock fixtures/previews. */
  displayId?: string;
  id: string;
  businessId: string;
  transactionId?: string;
  partyId: string;
  date: string;
  dueDate: string;
  reference: string;
  items: InvoiceItem[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  status: InvoiceStatus;
  notes: string;
  terms: string;
  daysOverdue: number;
}
export interface Payment {
  allocationMode?: "manual" | "fifo";
  advanceMinor?: number;
  allocations?: {
    transactionId: string;
    invoiceId?: string;
    displayId: string;
    amountMinor: number;
    effectiveDate: string;
  }[];
  id: string;
  businessId: string;
  partyId: string;
  invoiceId?: string;
  invoiceDisplayId?: string;
  transactionId?: string;
  direction: "Received" | "Sent";
  amountMinor: number;
  method: PaymentMethod;
  date: string;
  reference: string;
  notes: string;
  status: "Completed" | "Pending" | "Failed";
}
export interface PartySummary extends Party {
  balanceMinor: number;
  totalMinor: number;
  receivedMinor: number;
  invoiceCount: number;
  paymentCount: number;
}
export interface PartyDetail {
  party: PartySummary;
  transactions: Transaction[];
  invoices: Invoice[];
  payments: Payment[];
}
export interface Report {
  id: string;
  businessId: string;
  asOf: string;
  totalCash: number;
  receivable: number;
  payable: number;
}
export interface Notification {
  id: string;
  businessId: string;
  title: string;
  description: string;
  read: boolean;
  href: string;
  date: string;
}
export interface TeamMember extends User {
  businessId: string;
  status: "Active" | "Invited" | "Inactive";
  lastActive: string;
  permissions: string[];
}
export interface TransactionFilters {
  type?: string;
  partyId?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  page: number;
  pageSize: number;
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface TransactionEdit {
  date: string;
  notes: string;
}
export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  date: string;
}
