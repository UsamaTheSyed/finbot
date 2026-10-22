import { httpApi } from "./api";
import type { Invoice } from "../types";
import type {
  CorrectionContext,
  CorrectionRequest,
} from "../types/corrections";
const path = (business: string, id: string) =>
  `/businesses/${encodeURIComponent(business)}/invoices/${encodeURIComponent(id)}/corrections`;
export const correctionService = {
  history: (business: string, id: string) =>
    httpApi.get<CorrectionContext>(path(business, id)),
  save: (business: string, id: string, data: CorrectionRequest) =>
    httpApi.post<Invoice>(path(business, id), data),
};
