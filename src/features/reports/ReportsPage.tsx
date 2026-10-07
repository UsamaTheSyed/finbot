import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/common/Page";
import { Card } from "../../components/ui/Display";
import { Select } from "../../components/ui/Fields";
import { useToast } from "../../components/feedback/Toast";
import { reportCatalog } from "./reportCatalog";
import { ReportIcon } from "./ReportControls";
import { demoDate } from "../../lib/demo";
import "../../styles/phase-three.css";
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const currentPeriod = demoDate.slice(0, 7);
  const previousPeriod = new Date(`${currentPeriod}-01T00:00:00Z`);
  previousPeriod.setUTCMonth(previousPeriod.getUTCMonth() - 1);
  const previous = previousPeriod.toISOString().slice(0, 7);
  const requested = params.get("period");
  const period = requested === previous ? previous : currentPeriod;
  const notify = useToast();
  return (
    <div className="page-stack report-overview">
      <PageHeader
        title="Financial Reports"
        subtitle="Comprehensive tax compliance & transactional reporting for FBR"
        actions={
          <Select
            label="Reporting Period"
            value={period}
            onChange={(e) =>
              setParams({ period: e.target.value }, { flushSync: true })
            }
          >
            <option value={currentPeriod}>Current month</option>
            <option value={previous}>Previous month</option>
          </Select>
        }
      />
      <div className="report-grid">
        {reportCatalog.map((report) => (
          <Card className="report-link-card" key={report.title}>
            <div className="report-card-title">
              <span className={`report-icon report-icon--${report.tone}`}>
                <ReportIcon name={report.icon} />
              </span>
              <h2>{report.title}</h2>
            </div>
            <p>{report.description}</p>
            {"path" in report ? (
              <Link
                className="report-trigger"
                aria-label={`View ${report.title}`}
                to={`/reports/${report.path}?period=${report.path === "daily" ? `${period}-${demoDate.slice(8)}` : period}`}
              >
                View Report <ReportIcon name="arrow" />
              </Link>
            ) : (
              <button
                className="report-trigger"
                aria-label={`View ${report.title}`}
                onClick={() =>
                  notify(
                    `${report.title} is scheduled for a later phase; its detail design is not available.`,
                  )
                }
              >
                View Report <ReportIcon name="arrow" />
              </button>
            )}
          </Card>
        ))}
      </div>
      <p className="report-demo">
        Figures derive from the persistent workspace ledger and
        are not for tax filing.
      </p>
    </div>
  );
}
