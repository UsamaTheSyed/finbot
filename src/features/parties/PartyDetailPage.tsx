import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Download, Phone, Mail, FileText, MapPin, Plus } from "lucide-react";
import { useParty } from "../finance/queries";
import { QueryState } from "../../components/common/QueryState";
import { Card, Badge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/navigation/Controls";
import { useToast } from "../../components/feedback/Toast";
import {
  PartyTransactions,
  PaymentHistory,
  InvoiceRows,
  Money,
} from "../finance/components";
import { PartyFormDialog } from "./PartyFormDialog";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { PartyStatement } from "./PartyStatement";
export function PartyDetailPage() {
  const { id = "" } = useParams(),
    query = useParty(id),
    navigate = useNavigate(),
    notify = useToast();
  const [edit, setEdit] = useState(false),
    [payment, setPayment] = useState(false);
  if (!query.data) return <QueryState queries={[query]} back="/parties" />;
  const { party, transactions, invoices, payments } = query.data;
  const outstanding = invoices.filter(
    (i) => i.status !== "Draft" && i.balanceMinor > 0,
  );
  const overview = (
    <div className="page-stack">
      <div className="party-overview">
        <PartyTransactions transactions={transactions.slice(0, 5)} />
        <div className="page-stack">
          <Card className="outstanding-invoices">
            <h2>Outstanding Invoices</h2>
            {outstanding.length ? (
              outstanding.map((i) => (
                <Link key={i.id} to={`/invoices/${i.id}`}>
                  <span>
                    {i.displayId ?? i.id}
                    <small>Due {i.dueDate}</small>
                  </span>
                  <Money value={i.balanceMinor} />
                </Link>
              ))
            ) : (
              <p className="muted">No outstanding invoices.</p>
            )}
          </Card>
          <Card className="balance-card">
            <span>Current Balance</span>
            <strong
              className={
                party.balanceMinor < 0 ? "danger-text" : "success-text"
              }
            >
              <Money value={party.balanceMinor} />
            </strong>
          </Card>
        </div>
      </div>
      <PaymentHistory payments={payments.slice(0, 5)} />
    </div>
  );
  return (
    <div className="page-stack finance-page party-detail-page">
      <Card className="party-detail-header">
        <div className="page-header">
          <div>
            <h1>{party.name}</h1>
            <Badge tone={party.kind === "Customer" ? "success" : "info"}>
              {party.kind}
            </Badge>
          </div>
          <div className="actions">
            <Button
              onClick={() =>
                notify("Statement download is planned for a later phase.")
              }
            >
              <Download size={16} /> Download Statement
            </Button>
            <Button onClick={() => setEdit(true)}>Edit Party</Button>
            <Button variant="primary" onClick={() => setPayment(true)}>
              Record Payment
            </Button>
          </div>
        </div>
        <div className="party-contact">
          {[
            [Phone, party.phone],
            [Mail, party.email],
            [FileText, party.ntn],
            [MapPin, party.address],
          ].map(([Icon, value], i) => {
            const Glyph = Icon as typeof Phone;
            return (
              <span key={i}>
                <Glyph size={16} />
                {String(value || "—")}
              </span>
            );
          })}
        </div>
      </Card>
      <div className="finance-metrics">
        {[
          [
            party.kind === "Customer" ? "Total Sales" : "Total Purchases",
            party.totalMinor,
          ],
          [
            party.kind === "Customer" ? "Received" : "Paid",
            party.receivedMinor,
          ],
          ["Outstanding Balance", party.balanceMinor],
        ].map(([label, value], i) => (
          <Card key={label} className="finance-metric">
            <span>{label}</span>
            <strong
              className={
                i === 2
                  ? party.balanceMinor < 0
                    ? "danger-text"
                    : "success-text"
                  : i === 1
                    ? "success-text"
                    : ""
              }
            >
              <Money value={Number(value)} />
            </strong>
          </Card>
        ))}
      </div>
      <div className="actions">
        <Button
          disabled={party.kind === "Supplier"}
          onClick={() => navigate(`/invoices/new?party=${party.id}`)}
        >
          <Plus size={16} /> Create Invoice
        </Button>
        <Button
          onClick={() =>
            notify("New sales entry is planned for a later phase.")
          }
        >
          Record Sale
        </Button>
      </div>
      <Tabs
        defaultValue="Overview"
        items={[
          ["Overview", overview],
          ["Transactions", <PartyTransactions transactions={transactions} />],
          ["Invoices", <InvoiceRows invoices={invoices} />],
          ["Payments", <PaymentHistory payments={payments} />],
          [
            "Statement",
            <PartyStatement transactions={transactions} payments={payments} />,
          ],
        ].map(([label, content]) => ({
          value: String(label),
          label: String(label),
          content,
        }))}
      />
      {edit && <PartyFormDialog party={party} onClose={() => setEdit(false)} />}{" "}
      {payment && (
        <RecordPaymentDialog
          partyId={party.id}
          direction={party.kind === "Supplier" ? "Sent" : "Received"}
          onClose={() => setPayment(false)}
        />
      )}
    </div>
  );
}
