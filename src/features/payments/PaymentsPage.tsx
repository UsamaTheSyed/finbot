import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Payment } from "../../types";
import { usePayments, useFinanceParties } from "../finance/queries";
import { QueryState } from "../../components/common/QueryState";
import { PageHeader } from "../../components/common/Page";
import { Card, StatusBadge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Fields";
import { Modal } from "../../components/ui/Overlays";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Tabs, Pagination } from "../../components/navigation/Controls";
import { EmptyState } from "../../components/feedback/States";
import { Money } from "../finance/components";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { sumMinor } from "../../utils/money";
import { formatMetadataDate } from "../../utils/format";
export function PaymentsPage() {
  const query = usePayments(),
    parties = useFinanceParties(),
    [search, setSearch] = useSearchParams(),
    [record, setRecord] = useState(search.get("action") === "record"),
    [selected, setSelected] = useState<Payment>();
  const [party, setParty] = useState(""),
    [month, setMonth] = useState("");
  if (!query.data || !parties.data)
    return <QueryState queries={[query, parties]} />;
  const rows = query.data
    .filter(
      (p) =>
        (!party || p.partyId === party) && (!month || p.date.startsWith(month)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const summaries: [string, Payment[]][] = [
    [
      "Payments Received",
      query.data.filter(
        (p) => p.status === "Completed" && p.direction === "Received",
      ),
    ],
    [
      "Payments Sent",
      query.data.filter(
        (p) => p.status === "Completed" && p.direction === "Sent",
      ),
    ],
    ["Pending Payments", query.data.filter((p) => p.status === "Pending")],
  ];
  return (
    <div className="page-stack finance-page payments-page">
      <PageHeader
        title="Payments"
        subtitle="Track accounts receivable and payable"
        actions={
          <Button variant="primary" onClick={() => setRecord(true)}>
            <Plus size={18} /> Record Payment
          </Button>
        }
      />
      <div className="finance-metrics">
        {summaries.map(([label, records]) => (
          <Card className="finance-metric" key={label}>
            <span>{label}</span>
            <strong>
              <Money value={sumMinor(records.map((p) => p.amountMinor))} />
            </strong>
            <small>{records.length} payments</small>
          </Card>
        ))}
      </div>
      <div className="finance-filters">
        <Select
          label="Date Range"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="">All dates</option>
          {Array.from(new Set(query.data.map((p) => p.date.slice(0, 7))))
            .sort()
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
        </Select>
        <Select
          label="Party"
          value={party}
          onChange={(e) => setParty(e.target.value)}
        >
          <option value="">All parties</option>
          {parties.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {(party || month) && (
          <Button
            onClick={() => {
              setParty("");
              setMonth("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      <Tabs
        defaultValue="All"
        items={["All", "Received", "Sent", "Pending"].map((tab) => ({
          value: tab,
          label: tab === "All" ? "All Payments" : tab,
          content: (
            <PaymentTable
              key={`${tab}-${party}-${month}`}
              rows={rows.filter(
                (p) =>
                  tab === "All" ||
                  (tab === "Pending"
                    ? p.status === "Pending"
                    : p.direction === tab),
              )}
              partyNames={Object.fromEntries(
                parties.data.map((p) => [p.id, p.name]),
              )}
              onView={setSelected}
            />
          ),
        }))}
      />
      {record && (
        <RecordPaymentDialog
          onClose={() => {
            setRecord(false);
            if (search.has("action")) setSearch({}, { replace: true });
          }}
        />
      )}
      {selected && (
        <Modal
          open
          onOpenChange={(v) => {
            if (!v) setSelected(undefined);
          }}
          title={`Payment ${selected.id}`}
        >
          <div className="payment-detail">
            <strong>
              <Money value={selected.amountMinor} />
            </strong>
            <StatusBadge status={selected.status} />
            <dl>
              {[
                [
                  "Party",
                  parties.data.find((p) => p.id === selected.partyId)?.name,
                ],
                ["Type", selected.direction],
                ["Method", selected.method],
                ["Date", selected.date],
                ["Reference", selected.reference || "—"],
                ["Notes", selected.notes || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {selected.invoiceId ? (
              <Link to={`/invoices/${selected.invoiceId}`}>
                View {selected.invoiceId}
              </Link>
            ) : (
              <p className="muted">No linked invoice</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function PaymentTable({
  rows,
  partyNames,
  onView,
}: {
  rows: Payment[];
  partyNames: Record<string, string>;
  onView: (p: Payment) => void;
}) {
  const [page, setPage] = useState(1),
    pageSize = 10;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  return (
    <Card className="table-card">
      {rows.length ? (
        <>
          <Table aria-label="Payments" className="finance-table payments-table">
            <TableHeader>
              <TableRow>
                {[
                  "Date",
                  "Payment ID",
                  "Party",
                  "Type",
                  "Method",
                  "Amount",
                  "Reference",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </TableRow>
            </TableHeader>
            <tbody>
              {rows
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((p) => (
                  <TableRow key={p.id}>
                    <td>{formatMetadataDate(p.date)}</td>
                    <td>{p.id}</td>
                    <td>
                      <Link to={`/parties/${p.partyId}`}>
                        {partyNames[p.partyId]}
                      </Link>
                    </td>
                    <td>{p.direction}</td>
                    <td>{p.method}</td>
                    <td>
                      <Money value={p.amountMinor} />
                    </td>
                    <td>{p.reference || "—"}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => onView(p)}
                        aria-label={`View ${p.id}`}
                      >
                        View
                      </Button>
                    </td>
                  </TableRow>
                ))}
            </tbody>
          </Table>
          <Pagination
            page={currentPage}
            total={rows.length}
            pageSize={pageSize}
            onPage={setPage}
          />
        </>
      ) : (
        <EmptyState
          kind="payments"
          description="Record a payment or change your filters."
        />
      )}
    </Card>
  );
}
