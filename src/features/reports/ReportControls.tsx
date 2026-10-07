import { NavLink, Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/feedback/Toast";
import type { FinancialReport } from "../../types/financialReports";
import { downloadReport } from "../../utils/reportExport";
const icons = import.meta.glob<string>("../../assets/phase-three/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
export function ReportIcon({ name }: { name: string }) {
  return <img alt="" src={icons[`../../assets/phase-three/${name}.svg`]} />;
}
export function ReportTabs() {
  const notify = useToast();
  return (
    <nav className="report-tabs no-print" aria-label="Report navigation">
      <Link to="/reports">Overview</Link>
      <NavLink to="/reports/daily">Daily</NavLink>
      <NavLink to="/reports/ar-aging">A/R Aging</NavLink>
      <button
        onClick={() => notify("A/P Aging is scheduled for a later phase.")}
      >
        A/P Aging
      </button>
      <button
        onClick={() => notify("Trial Balance is scheduled for a later phase.")}
      >
        Trial Balance
      </button>
      <NavLink to="/reports/profit-loss">P&amp;L</NavLink>
      <NavLink to="/reports/cash-flow">Cash Flow</NavLink>
      <button
        onClick={() => notify("Tax reporting is scheduled for a later phase.")}
      >
        Tax Report
      </button>
      <Link to="/invoices">Invoice</Link>
    </nav>
  );
}
export function ReportActions({
  report,
  daily = false,
}: {
  report: FinancialReport | null | undefined;
  daily?: boolean;
}) {
  const notify = useToast();
  return (
    <div className="actions no-print">
      <Button
        size="small"
        onClick={() =>
          notify(
            "PDF generation is scheduled for a later phase. Use Print for a browser printout.",
          )
        }
      >
        <ReportIcon name="download" />
        {daily ? "Download PDF" : "Export PDF"}
      </Button>
      {!daily && (
        <Button
          size="small"
          disabled={!report}
          onClick={() => report && downloadReport(report)}
        >
          <ReportIcon name="download" />
          Export CSV
        </Button>
      )}
      <Button size="small" disabled={!report} onClick={() => window.print()}>
        <ReportIcon name="printer" />
        {daily ? "Print Report" : "Print"}
      </Button>
    </div>
  );
}
