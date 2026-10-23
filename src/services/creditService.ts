import { httpApi } from "./api";
import type {
  PartyCreditContext,
  CreditAction,
  CreditRequest,
} from "../types/credits";
const base = (business: string) =>
  `/businesses/${encodeURIComponent(business)}`;
export const creditService = {
  context: (business: string, party: string) =>
    httpApi.get<PartyCreditContext>(
      `${base(business)}/parties/${encodeURIComponent(party)}/credits`,
    ),
  post: (business: string, kind: CreditAction, data: CreditRequest) =>
    httpApi.post(
      `${base(business)}/credits/${kind === "note" ? "notes" : kind === "application" ? "applications" : "refunds"}`,
      data,
    ),
};
