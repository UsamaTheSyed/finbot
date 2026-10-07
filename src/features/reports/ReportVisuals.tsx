import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Card, CurrencyDisplay } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import type { FinancialReport, ReportLine } from "../../types/financialReports";
import { tokens } from "../../styles/tokens";
import { formatCurrency, formatDate } from "../../utils/format";
export function Statement({
  lines,
  title,
  daily = false,
}: {
  lines: ReportLine[];
  title: string;
  daily?: boolean;
}) {
  return (
    <Card className={`report-statement ${daily ? "report-daily-card" : ""}`}>
      <h2>{title}</h2>
      <dl>
        {lines.map((line, i) => (
          <div className="report-line-group" key={line.label}>
            {!daily && (i === 0 || i === 3) && (
              <h3>{i === 0 ? "Revenue" : "Expenses"}</h3>
            )}
            <div
              className={`report-line ${line.emphasis ? `report-line--${line.emphasis}` : ""}`}
            >
              <dt>{line.label}</dt>
              <dd>
                <CurrencyDisplay amount={line.amount} />
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}
export function AgingTable({ report }: { report: FinancialReport }) {
  const total = report.aging.at(-1);
  const cells = (row: FinancialReport["aging"][number]) => (
    <>
      <th scope="row">{row.party}</th>
      {(["current", "thirty", "sixty", "ninety", "total"] as const).map(
        (key) => (
          <td key={key}>
            {row[key] ? <CurrencyDisplay amount={row[key]} /> : "—"}
          </td>
        ),
      )}
    </>
  );
  return (
    <Card className="report-table">
      <Table aria-label="A/R Aging">
        <TableHeader>
          <TableRow>
            {[
              "Party",
              "Current",
              "30+ Days",
              "60+ Days",
              "90+ Days",
              "Total Outstanding",
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </TableRow>
        </TableHeader>
        <tbody>
          {report.aging.slice(0, -1).map((row) => (
            <TableRow key={row.party}>{cells(row)}</TableRow>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <TableRow>{cells(total)}</TableRow>
          </tfoot>
        )}
      </Table>
    </Card>
  );
}
export function ReportChart({
  report,
  cash = false,
}: {
  report: FinancialReport;
  cash?: boolean;
}) {
  const revenue = cash ? tokens.colors.success : tokens.colors.brand;
  const expenses = cash ? tokens.colors.danger : tokens.colors.reportChartMuted;
  return (
    <Card className={`report-chart ${cash ? "report-chart--cash" : ""}`}>
      <div className="row-between">
        <h2>{cash ? "30 Days Cash Trend" : "Revenue vs Expenses"}</h2>
        <div className="report-legend">
          <span>
            <i style={{ background: revenue }} />
            {cash ? "Cash In" : "Revenue"}
          </span>
          <span>
            <i style={{ background: expenses }} />
            {cash ? "Cash Out" : "Expenses"}
          </span>
        </div>
      </div>
      <div
        className="report-chart-canvas"
        role="img"
        aria-label={
          cash
            ? "Sample cash in and cash out trend for November 2026"
            : "Sample revenue and expenses from June to November 2026"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {cash ? (
            <LineChart
              data={report.chart}
              margin={{ left: 40, right: 40, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke={tokens.colors.border} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Line
                dataKey="revenue"
                name="Cash In"
                stroke={revenue}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="expenses"
                name="Cash Out"
                stroke={expenses}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={report.chart} barGap={4}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: tokens.colors.secondary }}
              />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={revenue}
                radius={[3, 3, 0, 0]}
                barSize={16}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill={expenses}
                radius={[3, 3, 0, 0]}
                barSize={16}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
export function CashTable({ report }: { report: FinancialReport }) {
  return (
    <Card className="report-table">
      <Table aria-label="Cash Flow Ledger">
        <TableHeader>
          <TableRow>
            {[
              "Date",
              "Description",
              "Category",
              "Cash In",
              "Cash Out",
              "Balance",
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </TableRow>
        </TableHeader>
        <tbody>
          {report.cash.map((row) => (
            <TableRow key={row.date}>
              <td>{formatDate(row.date)}</td>
              <td>{row.description}</td>
              <td>{row.category}</td>
              <td className="report-positive">
                {row.incoming ? <CurrencyDisplay amount={row.incoming} /> : "—"}
              </td>
              <td className="report-negative">
                {row.outgoing ? <CurrencyDisplay amount={row.outgoing} /> : "—"}
              </td>
              <td>
                <CurrencyDisplay amount={row.balance} />
              </td>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
