import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Plus } from "lucide-react";
import { useTransactions, useParties } from "../transactions/queries";
import { useWorkspace } from "../../hooks/useWorkspace";
import { reportService } from "../../services/reportService";
import { invoiceService } from "../../services/invoiceService";
import {
  Card,
  MetricCard,
  StatusBadge,
  CurrencyDisplay,
} from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import {
  ErrorState,
  LoadingSkeleton,
  EmptyState,
} from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { formatDate } from "../../utils/format";
export function DashboardPage() {
  const navigate = useNavigate();
  const business = useWorkspace();
  const notify = useToast();
  const report = useQuery({
    queryKey: ["reports", business],
    queryFn: () => reportService.list(business),
  });
  const invoices = useQuery({
    queryKey: ["invoices", business, "overdue"],
    queryFn: () => invoiceService.overdue(business),
  });
  const transactions = useTransactions({ page: 1, pageSize: 5 });
  const parties = useParties();
  const queries = [report, invoices, transactions, parties];
  if (queries.some((q) => q.isPending)) return <LoadingSkeleton />;
  const failed = queries.find((q) => q.error);
  if (failed?.error)
    return (
      <ErrorState
        error={failed.error}
        retry={() => {
          queries.forEach((q) => void q.refetch());
        }}
      />
    );
  const summary = report.data?.[0];
  if (!summary) return <EmptyState title="No dashboard data" />;
  const names = new Map(parties.data?.map((p) => [p.id, p.name]));
  return (
    <div className="page-stack dashboard-page">
      <h1 className="sr-only">Dashboard</h1>
      <div className="metric-grid">
        <MetricCard title="Total Cash" value={summary.totalCash} />
        <MetricCard
          title="Accounts Receivable (Due)"
          value={summary.receivable}
          tone="success"
          icon={<TrendingUp size={16} />}
        />
        <MetricCard
          title="Accounts Payable (Owing)"
          value={summary.payable}
          tone="danger"
          icon={<TrendingDown size={16} />}
        />
      </div>
      <div className="dashboard-tables">
        <Card className="table-card">
          <div className="section-heading">
            <h2>Recent Transactions</h2>
            <Link to="/transactions">View All</Link>
          </div>
          <Table
            className="compact-table recent-table"
            aria-label="Recent transactions"
          >
            <TableHeader>
              <TableRow>
                {["Date", "Party", "Amount", "Status"].map((label) => (
                  <th scope="col" key={label}>
                    + {label}
                  </th>
                ))}
              </TableRow>
            </TableHeader>
            <tbody>
              {transactions.data?.items.map((row) => (
                <TableRow key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>
                    <Link to={`/transactions/${row.id}`}>
                      {names.get(row.partyId)}
                    </Link>
                  </td>
                  <td>
                    <CurrencyDisplay amount={row.total} />
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="table-card">
          <div className="section-heading">
            <h2>Overdue Invoices</h2>
            <span className="danger-text">Critical</span>
          </div>
          <Table
            className="compact-table overdue-table"
            aria-label="Overdue invoices"
          >
            <TableHeader>
              <TableRow>
                {["Invoice#", "Party", "Days Overdue", "Action"].map(
                  (label) => (
                    <th key={label} scope="col">
                      + {label}
                    </th>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <tbody>
              {invoices.data?.map((row) => (
                <TableRow key={row.id}>
                  <td>{row.displayId ?? row.id}</td>
                  <td>{names.get(row.partyId)}</td>
                  <td className="danger-text">{row.daysOverdue} days</td>
                  <td>
                    <Link to={`/invoices/${row.id}`}>View</Link>
                  </td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <section className="quick-actions">
        <h2>QUICK ACTIONS</h2>
        <div>
          {["Sale", "Purchase", "Payment"].map((label) => (
            <Button
              key={label}
              variant="primary"
              onClick={() =>
                label === "Payment"
                  ? navigate("/payments?action=record")
                  : notify(
                      "New transaction creation is scheduled for a later phase.",
                    )
              }
            >
              <Plus size={16} />+ {label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
