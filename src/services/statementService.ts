import { httpApi } from "./api";
import type {
  AccountStatement,
  StatementRange,
} from "../domain/accountStatement";
const path = (
  businessId: string,
  partyId: string,
  range: StatementRange,
  pdf = false,
) =>
  `/businesses/${encodeURIComponent(businessId)}/parties/${encodeURIComponent(partyId)}/statement${pdf ? "/pdf" : ""}?${new URLSearchParams(range)}`;
export const statementService = {
  get: (
    businessId: string,
    partyId: string,
    range: StatementRange,
  ): Promise<AccountStatement> => httpApi.get(path(businessId, partyId, range)),
  download: (businessId: string, partyId: string, range: StatementRange) =>
    httpApi.blob(path(businessId, partyId, range, true)),
};
