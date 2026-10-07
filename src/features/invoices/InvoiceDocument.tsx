import type { Invoice, Party } from "../../types";
import { Card, StatusBadge } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Money, FinancialSummary } from "../finance/components";
import {
  calculateLineTotal,
  calculateLineTax,
} from "../../domain/invoiceCalculations";
import { formatMetadataDate } from "../../utils/format";
export function InvoiceDocument({
  invoice,
  party,
  summary = true,
}: {
  invoice: Invoice;
  party?: Party;
  summary?: boolean;
}) {
  return (
    <div className="page-stack invoice-document">
      <div className="invoice-info-grid">
        <Card>
          <h2>Invoice Details</h2>
          <dl>
            {[
              ["Invoice Number", invoice.id],
              ["Invoice Date", formatMetadataDate(invoice.date)],
              ["Due Date", formatMetadataDate(invoice.dueDate)],
              ["Reference", invoice.reference || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={invoice.status} />
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h2>Bill To</h2>
          <strong>{party?.name || "Customer"}</strong>
          <p>{party?.phone || "—"}</p>
          <p>NTN: {party?.ntn || "—"}</p>
          <p>{party?.address || "—"}</p>
        </Card>
      </div>
      <Card className="table-card">
        <Table
          className="finance-table invoice-items"
          aria-label="Invoice items"
        >
          <TableHeader>
            <TableRow>
              {["Description", "Quantity", "Rate", "Tax", "Amount"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {invoice.items.map((l) => (
              <TableRow key={l.id}>
                <td>
                  <strong>{l.item}</strong>
                  {l.description && <small>{l.description}</small>}
                </td>
                <td>
                  {l.quantity} {l.unit}
                </td>
                <td>
                  <Money value={l.rateMinor} />
                </td>
                <td>
                  <Money value={calculateLineTax(l)} />
                  <small>{l.taxPercent}%</small>
                </td>
                <td>
                  <Money value={calculateLineTotal(l)} />
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      {summary && (
        <FinancialSummary
          title="Invoice Summary"
          rows={invoiceSummaryRows(invoice)}
        />
      )}{" "}
      {(invoice.notes || invoice.terms) && (
        <Card className="invoice-notes">
          {invoice.notes && (
            <>
              <h2>Notes</h2>
              <p>{invoice.notes}</p>
            </>
          )}
          {invoice.terms && (
            <>
              <h2>Terms & Conditions</h2>
              <p>{invoice.terms}</p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
export function invoiceSummaryRows(i: Invoice): [string, number][] {
  return [
    ["Subtotal", i.subtotalMinor],
    ["Tax", i.taxMinor],
    ["Discount", -i.discountMinor],
    ["Grand Total", i.totalMinor],
    ["Paid", i.paidMinor],
    ["Balance Due", i.balanceMinor],
  ];
}
