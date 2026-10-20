import { Link } from "react-router-dom";
import { Card, CurrencyDisplay } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import type { FinancialReport } from "../../types/financialReports";
import { formatDate } from "../../utils/format";
export function SalesTable({ report }: { report: FinancialReport }) {
  return (
    <Card className="report-table">
      <Table aria-label="Sales Report">
        <TableHeader>
          <TableRow>
            {[
              "Date",
              "Document",
              "Customer",
              "Subtotal",
              "Discount",
              "Tax",
              "Total",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </TableRow>
        </TableHeader>
        <tbody>
          {report.sales?.map((r) => (
            <TableRow key={r.id}>
              <td>{formatDate(r.date)}</td>
              <td>
                <Link
                  to={
                    r.invoiceId
                      ? `/invoices/${encodeURIComponent(r.invoiceId)}`
                      : `/transactions/${encodeURIComponent(r.id)}`
                  }
                >
                  {r.displayId}
                </Link>
              </td>
              <td>{r.party}</td>
              {(["subtotal", "discount", "tax", "total"] as const).map((k) => (
                <td key={k}>
                  <CurrencyDisplay amount={r[k]} />
                </td>
              ))}
            </TableRow>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
