import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../hooks/useWorkspace";
import { accountingService } from "../../services/accountingService";
import { trialBalance } from "../../domain/trialBalance";
import { trialBalanceCsv } from "../../utils/trialBalanceExport";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Input } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { ReportTabs } from "../reports/ReportControls";
import { demoDate } from "../../lib/demo";
import "../../styles/phase-three.css";

const money = (n: number) =>
  (n / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function TrialBalancePage() {
  const business = useWorkspace();
  const [params, setParams] = useSearchParams();
  const period = params.get("period");
  const periodEnd =
    period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
      ? new Date(
          Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
        )
          .toISOString()
          .slice(0, 10)
      : demoDate;
  const date =
    params.get("date") ?? (periodEnd > demoDate ? demoDate : periodEnd);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  // Reuse the ledger query key so existing financial mutations invalidate this report.
  const q = useQuery({
    queryKey: ["accounting", business, date, date],
    queryFn: () => accountingService.report(business, date, date),
    enabled: !!business && valid,
  });
  const data = q.data;
  const available =
    valid &&
    !q.isError &&
    data?.active &&
    data.config &&
    date >= data.config.date;
  const report = available ? trialBalance(data.accounts || []) : null;
  function download() {
    if (!report || !data?.config) return;
    const url = URL.createObjectURL(
      new Blob(
        [trialBalanceCsv(report, date, data.config.date, data.warnings)],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `finbot-trial-balance-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Trial Balance"
        subtitle="PKR · Net account balances from the General Ledger"
        actions={
          <Button disabled={!report || q.isFetching} onClick={download}>
            Export CSV
          </Button>
        }
      />
      <ReportTabs />
      <Input
        label="As of date"
        type="date"
        value={date}
        onChange={(e) => setParams({ date: e.target.value })}
      />
      <Link to="/accounting">Open General Ledger</Link>
      {!valid ? (
        <p role="alert">Select a valid date.</p>
      ) : (
        <QueryState queries={[q]} />
      )}
      {valid && !q.isError && data && !data.active && (
        <p>
          Activate accounting with verified opening balances before viewing the
          Trial Balance. <Link to="/accounting">Open Accounting Settings</Link>
        </p>
      )}
      {valid && data?.active && data.config && date < data.config.date && (
        <p role="status">
          Trial Balance is available from {data.config.date}. Select the cutover
          date or a later date.
        </p>
      )}
      {report && (
        <>
          <p>
            As of {date}. Includes verified opening balances from{" "}
            {data?.config?.date} and subsequent journals. Revenue and expense
            accounts have not been year-end closed.
          </p>
          {data?.warnings?.map((warning) => (
            <p role="alert" key={warning}>
              {warning}
            </p>
          ))}
          <p role={report.balanced ? "status" : "alert"}>
            {report.balanced
              ? "Balanced — debit and credit totals match."
              : "Out of balance — review the General Ledger."}{" "}
            Difference: PKR {money(report.difference)}
          </p>
          <Card className="table-card">
            <Table aria-label="Trial Balance" className="finance-table">
              <TableHeader>
                <TableRow>
                  <th scope="col">Account</th>
                  <th scope="col">Debit (PKR)</th>
                  <th scope="col">Credit (PKR)</th>
                </TableRow>
              </TableHeader>
              <tbody>
                {report.rows.map((r) => (
                  <TableRow key={r.account}>
                    <th scope="row">{r.account}</th>
                    <td>{money(r.debit)}</td>
                    <td>{money(r.credit)}</td>
                  </TableRow>
                ))}
              </tbody>
              <tfoot>
                <TableRow>
                  <th scope="row">TOTAL</th>
                  <td>{money(report.debit)}</td>
                  <td>{money(report.credit)}</td>
                </TableRow>
              </tfoot>
            </Table>
          </Card>
          <p>
            Matching totals confirm arithmetic balance, not that every
            transaction or valuation is correct.
          </p>
        </>
      )}
    </div>
  );
}
