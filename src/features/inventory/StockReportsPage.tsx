import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useStock } from "./queries";
import { stockService } from "../../services/stockService";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Fields";
import { Card } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { demoDate } from "../../lib/demo";
import { csvCell } from "../../utils/reportExport";
import { StockNavigation } from "./StockNavigation";
export function StockReportsPage() {
  const b = useWorkspace(),
    stock = useStock(),
    [from, setFrom] = useState(demoDate.slice(0, 7) + "-01"),
    [to, setTo] = useState(demoDate),
    [w, setW] = useState("");
  const q = useQuery({
    queryKey: ["stock", b, "reports", from, to, w],
    queryFn: () => stockService.report(b, from, to, w),
    enabled: !!from && !!to && from <= to,
  });
  const costs =
      q.data?.movements.filter((m) =>
        ["Sale", "Customer return"].includes(m.kind),
      ) || [],
    unknown = costs.some((m) => m.cost_minor === null),
    cost = costs.reduce(
      (n, m) => n + (m.kind === "Sale" ? 1 : -1) * Number(m.cost_minor || 0),
      0,
    );
  function csv() {
    if (!q.data) return;
    const rows = [
      [
        "Date",
        "Product",
        "Warehouse",
        "Type",
        "Quantity",
        "Cost PKR",
        "Reason",
      ],
      ...q.data.movements.map((m) => [
        m.date,
        m.product_name,
        m.warehouse_name,
        m.kind,
        String(Number(m.delta_milli) / 1000),
        m.cost_minor === null ? "Unknown" : String(Number(m.cost_minor) / 100),
        m.reason,
      ]),
    ];
    const u = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = `finbot-stock-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Stock Reports"
        subtitle="Warehouse moving weighted average · PKR"
      />
      <StockNavigation />
      <div className="form-grid">
        <Input
          label="From date"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To date"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select
          label="Warehouse filter"
          value={w}
          onChange={(e) => setW(e.target.value)}
        >
          <option value="">All warehouses</option>
          {stock.data?.warehouses.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
      {from > to && <p role="alert">Start date must precede end date.</p>}
      <QueryState queries={[q, stock]} />
      <Button disabled={!q.data || from > to} onClick={csv}>
        Export Stock CSV
      </Button>
      <Card className="invoice-form-card">
        <h2>Stock cost of goods sold</h2>
        <p>
          {unknown
            ? "Incomplete: some dispatched goods have unknown historical cost."
            : `PKR ${(cost / 100).toLocaleString("en-PK")}`}
        </p>
        <p>
          Dispatch cost less customer returns in this period. Separate from the
          existing financial P&amp;L. Unvalued historical stock is never
          assigned an invented cost.
        </p>
      </Card>
      <Card className="table-card">
        <div className="section-heading">
          <h2>Valuation as of {to}</h2>
        </div>
        <Table aria-label="Stock valuation" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Product", "Warehouse", "Quantity", "Value PKR"].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {q.data?.valuation.map((v) => (
              <TableRow key={v.id + v.warehouse_name}>
                <td>{v.name}</td>
                <td>{v.warehouse_name}</td>
                <td>{Number(v.quantity_milli) / 1000}</td>
                <td>
                  {v.value_minor === null
                    ? "Unknown"
                    : Number(v.value_minor) / 100}
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="table-card">
        <div className="section-heading">
          <h2>Movement history</h2>
        </div>
        <Table aria-label="Stock movements" className="finance-table">
          <TableHeader>
            <TableRow>
              {[
                "Date",
                "Product",
                "Warehouse",
                "Type",
                "Quantity",
                "Cost PKR",
                "Recorded by",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {q.data?.movements.map((v) => (
              <TableRow key={v.id}>
                <td>{v.date}</td>
                <td>{v.product_name}</td>
                <td>{v.warehouse_name}</td>
                <td>{v.kind}</td>
                <td>{Number(v.delta_milli) / 1000}</td>
                <td>
                  {v.cost_minor === null
                    ? "Unknown"
                    : Number(v.cost_minor) / 100}
                </td>
                <td>{v.actor}</td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="table-card">
        <div className="section-heading">
          <h2>Operation audit</h2>
        </div>
        <Table aria-label="Inventory audit" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Date", "Operation", "Reason", "Recorded by"].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {q.data?.operations.map((v) => (
              <TableRow key={v.id}>
                <td>{v.payload.date}</td>
                <td>{v.payload.kind}</td>
                <td>{v.payload.reason}</td>
                <td>{v.actor}</td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
