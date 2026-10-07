import type { Party, PartySummary, PartyDetail } from "../types";
import { parties, transactions, invoices, payments } from "./mock/data";
import {
  requireParty,
  partySummary,
  decorateInvoice,
  nextId,
} from "./mock/ledgerSelectors";
import { partySchema, type PartyInput } from "../domain/validation";
import { httpApi, mockResponse, useMock } from "./api";
const base = (id: string) => `/businesses/${encodeURIComponent(id)}/parties`;
const getParties = (businessId: string): Promise<PartySummary[]> =>
  useMock
    ? mockResponse(() =>
        parties
          .filter((p) => p.businessId === businessId)
          .map((p) => partySummary(businessId, p.id)),
      )
    : httpApi.get(base(businessId));
const getPartyById = (businessId: string, id: string): Promise<PartyDetail> =>
  useMock
    ? mockResponse(() => ({
        party: partySummary(businessId, id),
        transactions: transactions.filter(
          (t) => t.businessId === businessId && t.partyId === id,
        ),
        invoices: invoices
          .filter((i) => i.businessId === businessId && i.partyId === id)
          .map(decorateInvoice),
        payments: payments
          .filter((p) => p.businessId === businessId && p.partyId === id)
          .sort(
            (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
          ),
      }))
    : httpApi.get(`${base(businessId)}/${encodeURIComponent(id)}`);
export const partyService = {
  list: getParties,
  getParties,
  getPartyById,
  createParty(businessId: string, input: PartyInput): Promise<Party> {
    const value = partySchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const party = { ...value, id: nextId("party", parties), businessId };
          parties.push(party);
          return party;
        })
      : httpApi.post(base(businessId), value);
  },
  updateParty(
    businessId: string,
    id: string,
    input: PartyInput,
  ): Promise<Party> {
    const value = partySchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const row = requireParty(businessId, id);
          if (
            row.kind !== value.kind &&
            [transactions, invoices, payments].some((records) =>
              records.some(
                (t) => t.businessId === businessId && t.partyId === id,
              ),
            )
          )
            throw new Error(
              "Party type cannot change after financial records exist.",
            );
          Object.assign(row, value);
          return row;
        })
      : httpApi.patch(`${base(businessId)}/${encodeURIComponent(id)}`, value);
  },
};
