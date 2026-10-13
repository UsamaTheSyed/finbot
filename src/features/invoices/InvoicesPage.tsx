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
import { Select } from "../../components/ui/Fields";
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
  const [kind, setKind] = useState("All");
  if (!query.data || !parties.data)
    return <QueryState queries={[query, parties]} />;
  const rows = query.data.filter(
    (i) =>
      kind === "All" ||
      parties.data?.find((p) => p.id === i.partyId)?.kind === kind,
  );
  const issued = rows.filter(
    (i) =>
      i.status !== "Draft" &&
      parties.data?.find((p) => p.id === i.partyId)?.kind ===
        (kind === "Supplier" ? "Supplier" : "Customer"),
  );
  const summaries: [string, number][] = [
    [
      kind === "Supplier" ? "Total Payables" : "Total Receivables",
      sumMinor(issued.map((i) => i.totalMinor)),
    ],
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
                  "Invoice / Bill #",
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
                    <Link to={`/invoices/${i.id}`}>{i.displayId ?? i.id}</Link>
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
                      label={`Actions for ${i.displayId ?? i.id}`}
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
        title={kind === "Supplier" ? "Bills" : "Invoices"}
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
            <Button onClick={() => navigate("/invoices/new?kind=Supplier")}>
              <Plus size={18} /> New Bill
            </Button>
            <Button variant="primary" onClick={() => navigate("/invoices/new")}>
              <Plus size={18} /> New Invoice
            </Button>
          </>
        }
      />
      <Select
        label="Document type"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="All">All invoices and bills</option>
        <option value="Customer">Customer invoices</option>
        <option value="Supplier">Supplier bills</option>
      </Select>
      <div className="finance-metrics">
        {summaries.map(([label, value]) => (
          <Card className="finance-metric" key={label}>
            <span>{label}</span>
            <strong>
              <Money value={value} />
            </strong>
            <small>
              {issued.length} issued{" "}
              {kind === "Supplier" ? "bills" : "customer invoices"}
            </small>
          </Card>
        ))}
      </div>
      <Tabs
        defaultValue="All"
        items={["All", "Draft", "Sent", "Paid"].map((status) => ({
          value: status,
          label: status,
          content: invoiceTable(
            rows.filter((i) => status === "All" || i.status === status),
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
