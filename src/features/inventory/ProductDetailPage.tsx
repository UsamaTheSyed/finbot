import { StockNavigation } from "./StockNavigation";
import { ProductUnits } from "./ProductUnits";
import { useStock } from "./queries";
import { ProductEditDialog } from "./ProductEditDialog";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { inventoryService } from "../../services/inventoryService";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Input, Select, Textarea } from "../../components/ui/Fields";
import { Modal } from "../../components/ui/Overlays";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { demoDate } from "../../lib/demo";
export function ProductDetailPage() {
  const stock = useStock();
  const { id = "" } = useParams(),
    b = useWorkspace(),
    client = useQueryClient();
  const q = useQuery({
    queryKey: ["inventory", b, id],
    queryFn: () => inventoryService.detail(b, id),
  });
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<{
    requestId: string;
    kind: string;
    quantity: number;
    date: string;
    reason: string;
    incomingCost?: number;
  } | null>(null);
  const m = useMutation({
    mutationFn: () => inventoryService.adjust(b, id, review),
    onSuccess: async () => {
      await Promise.all(
        ["stock", "inventory"].map((key) =>
          client.invalidateQueries({ queryKey: [key, b] }),
        ),
      );
      setReview(null);
    },
  });
  if (!q.data) return <QueryState queries={[q]} back="/inventory" />;
  const { product: p, movements } = q.data;
  return (
    <div className="page-stack finance-page">
      <Link to="/inventory">Back to Inventory</Link>
      <PageHeader
        title={p.name}
        actions={
          <Button
            disabled={!stock.data?.canManage}
            onClick={() => setEditing(true)}
          >
            Edit Product
          </Button>
        }
        subtitle={`${p.sku} · On hand: ${Number(p.stock_milli) / 1000} ${p.unit}`}
      />
      <StockNavigation />
      <ProductUnits id={id} />
      <ProductEditDialog
        key={`${b}:${id}`}
        product={p}
        open={editing}
        close={() => setEditing(false)}
      />
      <Card className="invoice-form-card">
        <div className="section-heading">
          <h2>Adjust physical stock</h2>
        </div>
        <form
          className="page-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.reset();
            setReview({
              requestId: crypto.randomUUID(),
              kind: String(f.get("kind")),
              quantity: Number(f.get("quantity")),
              date: String(f.get("date")),
              reason: String(f.get("reason")),
              ...(f.get("value")
                ? { incomingCost: Math.round(Number(f.get("value")) * 100) }
                : {}),
            });
          }}
        >
          <Select label="Movement type" name="kind">
            {["Adjustment in", "Adjustment out"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
          <Input
            label={`Quantity (${p.unit})`}
            name="quantity"
            type="number"
            min="0.001"
            max="1000000"
            step="0.001"
            required
          />
          <Input
            label="Movement date"
            name="date"
            type="date"
            defaultValue={demoDate}
            required
          />
          <Input
            label="Additional stock cost (PKR)"
            name="value"
            type="number"
            min="0"
            step="0.01"
          />
          <Textarea
            label="Reason and document reference"
            name="reason"
            required
            minLength={5}
            maxLength={500}
          />
          <p>
            This form adjusts Main warehouse only. Use Stock Operations for
            other warehouses and document-linked returns. Returns do not create
            refunds or credit notes. Dates must follow the latest stock
            movement.
          </p>
          <Button type="submit" disabled={!stock.data?.canManage}>
            Review Adjustment
          </Button>
        </form>
      </Card>
      <Card className="table-card">
        <div className="section-heading">
          <h2>Stock history</h2>
        </div>
        <Table aria-label="Stock history" className="finance-table">
          <TableHeader>
            <TableRow>
              {[
                "Date",
                "Type",
                "Quantity change",
                "Reason",
                "Recorded by",
                "Document",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {movements.map((v) => (
              <TableRow key={v.id}>
                <td>{v.date}</td>
                <td>{v.kind}</td>
                <td>
                  {Number(v.delta_milli) / 1000} {p.unit}
                </td>
                <td>{v.reason}</td>
                <td>{v.actor}</td>
                <td>
                  {v.invoice_id ? (
                    <Link to={`/invoices/${v.invoice_id}`}>View document</Link>
                  ) : (
                    "—"
                  )}
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      <Modal
        open={!!review}
        title="Confirm Stock Adjustment"
        onOpenChange={(v) => {
          if (!v && !m.isPending) setReview(null);
        }}
      >
        <p>
          {review?.kind}: {review?.quantity} {p.unit}, dated {review?.date}.
        </p>
        <p>{review?.reason}</p>
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button
          variant="primary"
          disabled={m.isPending}
          onClick={() => m.mutate()}
        >
          Confirm Adjustment
        </Button>
      </Modal>
    </div>
  );
}
