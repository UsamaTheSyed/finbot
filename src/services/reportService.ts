import type { Report } from "../types";
import { reports, parties, payments } from "./mock/data";
import { partySummary } from "./mock/ledgerSelectors";
import { sumMinor, toMinor, fromMinor } from "../utils/money";
import { httpApi, mockResponse, useMock } from "./api";
// Opening cash is a fixture. Apply only the change in settled mock payments since boot.
const netPayments = (businessId: string) =>
  sumMinor(
    payments
      .filter((p) => p.businessId === businessId && p.status === "Completed")
      .map((p) => p.amountMinor * (p.direction === "Received" ? 1 : -1)),
  );
const openingNet = new Map(
  reports.map((r) => [r.businessId, netPayments(r.businessId)]),
);
export const reportService = {
  list: (businessId: string): Promise<Report[]> =>
    useMock
      ? mockResponse(() =>
          reports
            .filter((r) => r.businessId === businessId)
            .map((r) => {
              const balances = parties
                .filter((p) => p.businessId === businessId)
                .map((p) => partySummary(businessId, p.id).balanceMinor);
              return {
                ...r,
                totalCash: fromMinor(
                  sumMinor([
                    toMinor(r.totalCash),
                    netPayments(businessId),
                    -(openingNet.get(businessId) || 0),
                  ]),
                ),
                receivable: fromMinor(sumMinor(balances.filter((v) => v > 0))),
                payable: fromMinor(-sumMinor(balances.filter((v) => v < 0))),
              };
            }),
        )
      : httpApi.get(`/businesses/${businessId}/reports`),
};
