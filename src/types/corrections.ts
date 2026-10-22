import type { Invoice } from "./index";
import type { InvoiceInput } from "../domain/validation";
export interface InvoiceCorrection {
  id: string;
  date: string;
  reason: string;
  actor: string;
  createdAt: string;
  before: Invoice;
  after: Invoice;
  deltaMinor: number;
}
export interface CorrectionContext {
  today: string;
  entries: InvoiceCorrection[];
}
export interface CorrectionRequest {
  revision: string;
  reason: string;
  effectiveDate: string;
  data: InvoiceInput & { draft: false };
}
