import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../hooks/useWorkspace";
import {
  accountingService,
  type AccountingReport,
} from "../../services/accountingService";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Input } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { OpeningAccounting } from "./OpeningAccounting";
import { CreditCostAllocation } from "./CreditCostAllocation";
import { demoDate } from "../../lib/demo";
import { csvCell } from "../../utils/reportExport";
import "../../styles/phase-three.css";
const money = (n: number) =>
  (n / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function AccountingPage() {
  const b = useWorkspace(),
    [from, setFrom] = useState(demoDate.slice(0, 7) + "-01"),
    [to, setTo] = useState(demoDate),
    [credit, setCredit] = useState<
      NonNullable<AccountingReport["pending"]>[number] | null
    >(null),
    valid = !!from && !!to && from <= to;
  const q = useQuery({
      queryKey: ["accounting", b, from, to],
      queryFn: () => accountingService.report(b, from, to),
      enabled: !!b && valid,
    }),
    d = q.data;
  function download() {
    if (!d?.journals || !valid) return;
    const rows = [
      ["FinBot general ledger", "PKR", from, to],
      ["Cutover", d.config?.date || ""],
      ["Date", "Source", "Account", "Debit PKR", "Credit PKR"],
      ...d.journals.flatMap((j) =>
        j.lines.map((l) => [
          j.date,
          j.source,
          l.account,
          Math.max(0, l.amountMinor) / 100,
          Math.max(0, -l.amountMinor) / 100,
        ]),
      ),
    ];
    const u = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = `finbot-general-ledger-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Accounting & General Ledger"
        subtitle="PKR · Verified opening balances and source-linked journals"
      />
      <Link to="/reports/trial-balance">Open Trial Balance</Link>
      <Link to="/reports/profit-loss">Open Profit &amp; Loss</Link>
      <div className="form-grid">
        <Input
          label="From date"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To date"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {!valid ? (
        <p role="alert">Select a valid date range.</p>
      ) : (
        <QueryState queries={[q]} />
      )}
      {d &&
        !d.active &&
        (d.canManage ? (
          <OpeningAccounting key={b} business={b} />
        ) : (
          <p>
            The workspace owner must verify opening balances before activating
            accounting.
          </p>
        ))}
      {d?.active && (
        <>
          <p role="status">
            Accounting active from {d.config?.date}. Existing events at
            activation are opening balances; earlier P&amp;L remains legacy.
          </p>
          {d.warnings?.map((w) => (
            <p role="alert" key={w}>
              {w}
            </p>
          ))}
          <Button onClick={download} disabled={!valid}>
            Export General Ledger CSV
          </Button>
          <Card className="table-card">
            <div className="section-heading">
              <h2>Account balances</h2>
            </div>
            <Table
              aria-label="General ledger balances"
              className="finance-table"
            >
              <TableHeader>
                <TableRow>
                  {[
                    "Account",
                    "Opening (signed)",
                    "Debits",
                    "Credits",
                    "Closing (signed)",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                {d.accounts?.map((a) => (
                  <TableRow key={a.account}>
                    <th>{a.account}</th>
                    {[a.opening, a.debit, a.credit, a.closing].map((v, i) => (
                      <td key={i}>{money(v)}</td>
                    ))}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </Card>
          <p>
            Positive balances are debits; negative balances are credits.
            Customer and Supplier control include advances. Purchasing clearing
            covers billed goods not yet received and unmatched supplier returns.
            Tax control balances do not certify tax filing treatment.
          </p>
          <Card className="table-card">
            <div className="section-heading">
              <h2>Journal entries</h2>
            </div>
            <Table aria-label="Accounting journals" className="finance-table">
              <TableHeader>
                <TableRow>
                  {["Date", "Source", "Account", "Debit", "Credit"].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                {d.journals?.flatMap((j) =>
                  j.lines
                    .filter((l) => l.amountMinor !== 0)
                    .map((l, i) => (
                      <TableRow key={j.source + i}>
                        <td>{j.date}</td>
                        <td title={j.source}>{j.invoiceId?<Link to={`/invoices/${encodeURIComponent(j.invoiceId)}`}>{j.description||j.source}</Link>:j.description||j.source}</td>
                        <td>{l.account}</td>
                        <td>{money(Math.max(0, l.amountMinor))}</td>
                        <td>{money(Math.max(0, -l.amountMinor))}</td>
                      </TableRow>
                    )),
                )}
              </tbody>
            </Table>
          </Card>
          {d.pending?.map((p) => (
            <Card key={p.id} className="invoice-form-card">
              <h2>Unallocated supplier credit: {p.display_id}</h2>
              <p>
                PKR {money(Number(p.net_minor))}. Profit is provisional until
                cost allocation is verified.
              </p>
              <Button disabled={!d.canManage} onClick={() => setCredit(p)}>
                Allocate Credit Cost
              </Button>
            </Card>
          ))}
        </>
      )}
      {credit && (
        <CreditCostAllocation
          business={b}
          credit={credit}
          close={() => setCredit(null)}
        />
      )}
    </div>
  );
}
