import { useState } from "react";
import { Link } from "react-router-dom";
import { useCredits } from "./queries";
import { CreditDialog } from "./CreditDialog";
import { Card } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { QueryState } from "../../components/common/QueryState";
import { Money } from "../finance/components";
import type { CreditAction } from "../../types/credits";
export function CreditPanel({
  partyId,
  invoiceId,
}: {
  partyId: string;
  invoiceId?: string;
}) {
  const query = useCredits(partyId),
    [action, setAction] = useState<CreditAction>();
  if (!query.data) return <QueryState queries={[query]} />;
  const context = query.data;
  const notes = (context.notes ?? []).filter(
    (n) => !invoiceId || n.invoiceId === invoiceId,
  );
  const history = (context.history ?? []).filter(
    (h) =>
      !invoiceId ||
      h.invoiceId === invoiceId ||
      h.sourceInvoiceId === invoiceId,
  );
  if (invoiceId && !notes.length && !history.length) return null;
  return (
    <Card className="table-card">
      <div className="section-heading">
        <h2>Credits and Refunds</h2>
        {!invoiceId && (
          <div className="actions">
            <span>
              Available: <Money value={context.availableMinor ?? 0} />
            </span>
            <Button
              disabled={!context.availableMinor}
              onClick={() => setAction("application")}
            >
              Apply Credit
            </Button>
            <Button
              disabled={!context.availableMinor}
              onClick={() => setAction("refund")}
            >
              Record Refund
            </Button>
          </div>
        )}
      </div>
      {notes.length ? (
        <Table aria-label="Credit notes" className="finance-table">
          <TableHeader>
            <TableRow>
              {[
                "Date",
                "Document",
                "Credit",
                "Available",
                "Reason",
                "Recorded by",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {notes.map((n) => (
              <TableRow key={n.id}>
                <td>{n.date}</td>
                <td>
                  <Link to={`/invoices/${n.invoiceId}`}>{n.displayId}</Link>
                  <small>{n.id}</small>
                </td>
                <td>
                  <Money value={n.totalMinor} />
                </td>
                <td>
                  <Money value={n.availableMinor} />
                </td>
                <td>{n.reason}</td>
                <td>{n.actor}</td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <p>No credit notes recorded.</p>
      )}
      {!!history.length && (
        <Table aria-label="Credit usage" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Date", "Event", "Amount", "Document / payment", "Reason"].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </TableRow>
          </TableHeader>
          <tbody>
            {history.map((h) => (
              <TableRow key={h.id}>
                <td>{h.date}</td>
                <td>{h.kind === "refund" ? "Refund" : "Credit applied"}</td>
                <td>
                  <Money value={h.amountMinor} />
                </td>
                <td>
                  {h.invoiceId ? (
                    <Link to={`/invoices/${h.invoiceId}`}>{h.displayId}</Link>
                  ) : (
                    <Link to="/payments">{h.paymentId}</Link>
                  )}
                </td>
                <td>{h.reason}</td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {invoiceId && (
        <p>
          Payment History retains original allocations. Credits and refunds
          above explain later changes; the summary shows the current balance.{" "}
          <Link to={`/parties/${partyId}`}>
            Open party account to apply credit or record a refund.
          </Link>
        </p>
      )}
      {action && (
        <CreditDialog
          kind={action}
          partyId={partyId}
          onClose={() => setAction(undefined)}
        />
      )}
    </Card>
  );
}
