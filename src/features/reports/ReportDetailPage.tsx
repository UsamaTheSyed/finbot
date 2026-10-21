import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import { DatePicker, Input } from "../../components/ui/Fields";
import { Card, CurrencyDisplay } from "../../components/ui/Display";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/feedback/States";
import { useAppStore } from "../../store/useAppStore";
import { financialReportService } from "../../services/financialReportService";
import { downloadReport } from "../../utils/reportExport";
import type { ReportKind } from "../../types/financialReports";
import { ReportActions, ReportTabs } from "./ReportControls";
import { Statement, AgingTable, ReportChart, CashTable } from "./ReportVisuals";
import { demoDate } from "../../lib/demo";
import "../../styles/phase-three.css";
import { SalesTable } from "./SalesTable";
const titles = {
  sales: "Sales Report",
  purchases: "Purchase Report",
  "ap-aging": "A/P Aging",
  daily: "Reports",
  "ar-aging": "Reports",
  "profit-loss": "Profit & Loss Statement",
  "cash-flow": "Cash Flow Ledger",
};
export function ReportDetailPage({ kind }: { kind: ReportKind }) {
  const businessId = useAppStore((s) => s.workspaceId);
  const [params, setParams] = useSearchParams();
  const daily = kind === "daily";
  const raw = params.get("period");
  const period =
    raw &&
    (daily ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(raw) &&
    !Number.isNaN(Date.parse(daily ? raw : `${raw}-01`))
      ? raw
      : daily
        ? demoDate
        : demoDate.slice(0, 7);
  const setPeriod = (value: string) => {
    if (value) setParams({ period: value }, { flushSync: true });
  };
  const result = useQuery({
    queryKey: ["financial-reports", businessId, kind, period],
    queryFn: () => financialReportService.get(businessId, kind, period),
    enabled: !!businessId,
  });
  const report = result.data;
  const moveDay = (offset: number) => {
    const date = new Date(`${period}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    setPeriod(date.toISOString().slice(0, 10));
  };
  return (
    <div className="page-stack report-detail">
      <PageHeader
        title={titles[kind]}
        subtitle={
          kind === "sales"
            ? `Posted sales • ${period} • Includes tax; excludes drafts and cash receipts`
            : kind === "purchases"
              ? `Posted purchases • ${period} • Includes tax; excludes drafts and supplier payments`
              : kind === "ap-aging"
                ? `Outstanding supplier bills at month-end • ${period}`
                : kind === "profit-loss"
                  ? `Accrual Basis • ${period}`
                  : kind === "cash-flow"
                    ? `Cash movements • ${period}`
                    : undefined
        }
        actions={
          kind === "ar-aging" ? (
            <Button
              size="small"
              disabled={!report}
              onClick={() => report && downloadReport(report)}
            >
              Export CSV
            </Button>
          ) : daily ? (
            <DatePicker
              label="Report date"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          ) : (
            <>
              <Input
                label="Reporting month"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <ReportActions report={report} />
            </>
          )
        }
      />
      <ReportTabs />
      {daily && (
        <div className="actions no-print">
          <Button size="small" onClick={() => moveDay(-1)}>
            ← Prev
          </Button>
          <strong>
            {new Date(`${period}T12:00:00Z`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}
          </strong>
          <Button size="small" onClick={() => moveDay(1)}>
            Next →
          </Button>
        </div>
      )}
      {result.isPending ? (
        <LoadingSkeleton />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : !report ? (
        <EmptyState
          title="No report data for this period"
          description="There is no qualifying ledger activity for the selected period."
          action={
            <Button
              onClick={() => setPeriod(daily ? demoDate : demoDate.slice(0, 7))}
            >
              Show current period
            </Button>
          }
        />
      ) : (
        <>
          {daily && (
            <Statement
              title="Daily Cash & Sales Summary"
              lines={report.lines}
              daily
            />
          )}
          {(kind === "ar-aging" || kind === "ap-aging") && (
            <AgingTable report={report} />
          )}
          {(kind === "sales" || kind === "purchases") && (
            <>
              <Statement
                title={
                  kind === "purchases" ? "Purchase Summary" : "Sales Summary"
                }
                lines={report.lines}
                daily
              />
              <SalesTable report={report} />
            </>
          )}
          {kind === "profit-loss" && (
            <div className="report-columns">
              <Statement title="Statement of Accounts" lines={report.lines} />
              <ReportChart report={report} />
            </div>
          )}
          {kind === "cash-flow" && (
            <>
              <div className="report-metrics">
                {report.lines.map((line) => (
                  <Card key={line.label}>
                    <p>{line.label}</p>
                    <strong
                      className={
                        line.emphasis === "success"
                          ? "report-positive"
                          : line.emphasis === "danger"
                            ? "report-negative"
                            : ""
                      }
                    >
                      <CurrencyDisplay amount={line.amount} />
                    </strong>
                  </Card>
                ))}
              </div>
              <ReportChart report={report} cash />
              <CashTable report={report} />
            </>
          )}
        </>
      )}
      {daily && <ReportActions report={report} daily />}
      <p className="report-demo">
        Workspace ledger report · {period} · PKR. Values update from persisted
        data and are not for tax filing.
      </p>
    </div>
  );
}
