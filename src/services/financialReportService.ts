import type { FinancialReport, ReportKind } from "../types/financialReports";
import { httpApi, mockResponse, useMock } from "./api";
import {
  businesses,
  demoDate,
  invoices,
  parties,
  payments,
  reports,
  transactions,
} from "./mock/data";
import {
  arAging,
  cashFlow,
  dailySummary,
  monthBounds,
  netPaymentMinor,
  profitAndLoss,
} from "../domain/reportCalculations";
import { sumMinor, toMinor } from "../utils/money";

import { mockLedgerReport } from "../domain/mockLedgerReports";

const initialAnchorNet = new Map(
  businesses.map((business) => [
    business.id,
    netPaymentMinor(
      payments.filter(
        (payment) =>
          payment.businessId === business.id && payment.date <= demoDate,
      ),
    ),
  ]),
);

function openingCash(businessId: string, period: string) {
  const { start } = monthBounds(period);
  const fixture = reports.find((report) => report.businessId === businessId);
  if (!fixture) return 0;
  const throughAnchor = payments.filter(
    (payment) => payment.businessId === businessId && payment.date <= demoDate,
  );
  const anchor = sumMinor([
    toMinor(fixture.totalCash),
    netPaymentMinor(throughAnchor),
    -(initialAnchorNet.get(businessId) || 0),
  ]);
  if (start <= demoDate)
    return sumMinor([
      anchor,
      -netPaymentMinor(
        throughAnchor.filter((payment) => payment.date >= start),
      ),
    ]);
  return sumMinor([
    anchor,
    netPaymentMinor(
      payments.filter(
        (payment) =>
          payment.businessId === businessId &&
          payment.date > demoDate &&
          payment.date < start,
      ),
    ),
  ]);
}

function buildReport(businessId: string, kind: ReportKind, period: string) {
  if (!businesses.some((business) => business.id === businessId)) return null;
  switch (kind) {
    case "sales":
    case "purchases":
    case "ap-aging":
      return mockLedgerReport(
        businessId,
        kind,
        period,
        transactions,
        invoices,
        parties,
        payments,
      );
    case "daily":
      return dailySummary(businessId, period, transactions, payments);
    case "ar-aging":
      return arAging(businessId, period, invoices, parties);
    case "profit-loss":
      return profitAndLoss(businessId, period, transactions);
    case "cash-flow":
      return cashFlow(
        businessId,
        period,
        openingCash(businessId, period),
        payments,
        parties,
      );
  }
}
export const financialReportService = {
  get(
    businessId: string,
    kind: ReportKind,
    period: string,
  ): Promise<FinancialReport | null> {
    if (!useMock)
      return httpApi.get(
        `/businesses/${encodeURIComponent(businessId)}/reports/${kind}?period=${encodeURIComponent(period)}`,
      );
    return mockResponse(() => buildReport(businessId, kind, period));
  },
};
