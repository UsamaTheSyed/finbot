import { Link } from "react-router-dom";
import type { Payment, Transaction } from "../../types";
import { buildStatement } from "../../domain/statement";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Card } from "../../components/ui/Display";
import { EmptyState } from "../../components/feedback/States";
import { Money } from "../finance/components";
export function PartyStatement({
  transactions,
  payments,
}: {
  transactions: Transaction[];
  payments: Payment[];
}) {
  const rows = buildStatement(transactions, payments);
  return (
    <Card className="table-card">
      <div className="section-heading">
        <h2>Account Statement</h2>
      </div>
      {rows.length ? (
        <Table aria-label="Account statement" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Date", "Reference", "Description", "Movement", "Balance"].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </TableRow>
          </TableHeader>
          <tbody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <td>{r.date}</td>
                <td>
                  <Link to={r.href}>{r.id}</Link>
                </td>
                <td>{r.label}</td>
                <td>
                  <Money value={r.amountMinor} />
                </td>
                <td>
                  <Money value={r.balanceMinor} />
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No account activity yet" />
      )}
    </Card>
  );
}
