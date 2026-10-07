import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Download, MoreHorizontal } from "lucide-react";
import { useInvoices, useFinanceParties } from "../finance/queries";
import { QueryState } from "../../components/common/QueryState";
import { PageHeader } from "../../components/common/Page";
import { Card, StatusBadge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Dropdown } from "../../components/ui/Overlays";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Tabs } from "../../components/navigation/Controls";
import { EmptyState } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { Money } from "../finance/components";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { sumMinor } from "../../utils/money";
import type { Invoice } from "../../types";
export function InvoicesPage() {
  const query = useInvoices(),
    parties = useFinanceParties(),
    navigate = useNavigate(),
    notify = useToast();
  const [payment, setPayment] = useState<Invoice>();
  if (!query.data || !parties.data)
    return <QueryState queries={[query, parties]} />;
  const issued = query.data.filter(
    (i) =>
      i.status !== "Draft" &&
      parties.data?.find((p) => p.id === i.partyId)?.kind === "Customer",
  );
  const summaries: [string, number][] = [
    ["Total Receivables", sumMinor(issued.map((i) => i.totalMinor))],
    ["Total Paid", sumMinor(issued.map((i) => i.paidMinor))],
    ["Pending Due", sumMinor(issued.map((i) => i.balanceMinor))],
  ];
  function invoiceTable(rows: Invoice[]) {
    return (
      <Card className="table-card">
        {rows.length ? (
          <Table
            aria-label="Invoices"
            className="finance-table invoice-list-table"
          >
            <TableHeader>
              <TableRow>
                {[
                  "Invoice #",
                  "Party",
                  "Total",
                  "Paid",
                  "Due",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </TableRow>
            </TableHeader>
            <tbody>
              {rows.map((i) => (
                <TableRow
                  key={i.id}
                  onClick={() => navigate(`/invoices/${i.id}`)}
                >
                  <td>
                    <Link to={`/invoices/${i.id}`}>{i.id}</Link>
                  </td>
                  <td>{parties.data?.find((p) => p.id === i.partyId)?.name}</td>
                  <td>
                    <Money value={i.totalMinor} />
                  </td>
                  <td className="success-text">
                    <Money value={i.paidMinor} />
                  </td>
                  <td className={i.balanceMinor ? "danger-text" : ""}>
                    <Money value={i.balanceMinor} />
                  </td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      trigger={<MoreHorizontal size={18} />}
                      label={`Actions for ${i.id}`}
                      items={[
                        {
                          label: "View",
                          onSelect: () => navigate(`/invoices/${i.id}`),
                        },
                        {
                          label: "Send Reminder",
                          onSelect: () =>
                            notify("Messaging is planned for a later phase."),
                        },
                        {
                          label: "Mark Paid",
                          disabled:
                            i.status === "Draft" || i.balanceMinor === 0,
                          onSelect: () => setPayment(i),
                        },
                      ]}
                    />
                  </td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState kind="invoices" />
        )}
      </Card>
    );
  }
  return (
    <div className="page-stack finance-page invoices-page">
      <PageHeader
        title="Invoices"
        subtitle="Manage your billing and track invoice status."
        actions={
          <>
            <Button
              onClick={() =>
                notify("Invoice export is planned for a later phase.")
              }
            >
              <Download size={16} /> Export
            </Button>
            <Button variant="primary" onClick={() => navigate("/invoices/new")}>
              <Plus size={18} /> New Invoice
            </Button>
          </>
        }
      />
      <div className="finance-metrics">
        {summaries.map(([label, value]) => (
          <Card className="finance-metric" key={label}>
            <span>{label}</span>
            <strong>
              <Money value={value} />
            </strong>
            <small>{issued.length} issued invoices</small>
          </Card>
        ))}
      </div>
      <Tabs
        defaultValue="All"
        items={["All", "Draft", "Sent", "Paid"].map((status) => ({
          value: status,
          label: status,
          content: invoiceTable(
            query.data.filter((i) => status === "All" || i.status === status),
          ),
        }))}
      />
      {payment && (
        <RecordPaymentDialog
          partyId={payment.partyId}
          invoiceId={payment.id}
          direction={
            parties.data.find((p) => p.id === payment.partyId)?.kind ===
            "Supplier"
              ? "Sent"
              : "Received"
          }
          onClose={() => setPayment(undefined)}
        />
      )}
    </div>
  );
}
