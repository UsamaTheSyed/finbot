import { Link } from "react-router-dom";
import {
  Card,
  CurrencyDisplay,
  StatusBadge,
} from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { EmptyState } from "../../components/feedback/States";
import type { Invoice, Payment, Transaction } from "../../types";
import { formatPKR, fromMinor } from "../../utils/money";
import { formatMetadataDate } from "../../utils/format";
export function Money({ value }: { value: number }) {
  return <span className="currency">{formatPKR(value)}</span>;
}
export function FinancialSummary({
  title,
  rows,
}: {
  title?: string;
  rows: [string, number][];
}) {
  return (
    <Card className="financial-summary">
      {title && <h2>{title}</h2>}
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Money value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
export function PaymentHistory({ payments }: { payments: Payment[] }) {
  return (
    <Card className="table-card">
      <div className="section-heading">
        <h2>Payment History</h2>
      </div>
      {payments.length ? (
        <Table aria-label="Payment history" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Date", "Amount", "Method", "Reference", "Status"].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <td>{formatMetadataDate(p.date)}</td>
                <td>
                  <Money value={p.amountMinor} />
                </td>
                <td>{p.method}</td>
                <td>{p.reference || "—"}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState kind="payments" />
      )}
    </Card>
  );
}
export function PartyTransactions({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <Card className="table-card">
      <div className="section-heading">
        <h2>Recent Transactions</h2>
      </div>
      {transactions.length ? (
        <Table aria-label="Party transactions" className="finance-table">
          <tbody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <td>{formatMetadataDate(t.date)}</td>
                <td>
                  <Link to={`/transactions/${t.id}`}>{t.id}</Link>
                </td>
                <td>{t.type}</td>
                <td>
                  <CurrencyDisplay amount={t.total} />
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState kind="transactions" />
      )}
    </Card>
  );
}
export function InvoiceRows({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card className="table-card">
      {invoices.length ? (
        <Table aria-label="Party invoices" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Invoice", "Date", "Total", "Balance", "Status"].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {invoices.map((i) => (
              <TableRow key={i.id}>
                <td>
                  <Link to={`/invoices/${i.id}`}>{i.id}</Link>
                </td>
                <td>{formatMetadataDate(i.date)}</td>
                <td>
                  <CurrencyDisplay amount={fromMinor(i.totalMinor)} />
                </td>
                <td>
                  <Money value={i.balanceMinor} />
                </td>
                <td>
                  <StatusBadge status={i.status} />
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
