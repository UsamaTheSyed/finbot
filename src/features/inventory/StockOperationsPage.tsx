import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useStock, useProducts } from "./queries";
import { stockService, type StockOperation } from "../../services/stockService";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Button } from "../../components/ui/Button";
import { Input, Select, Textarea } from "../../components/ui/Fields";
import { Modal } from "../../components/ui/Overlays";
import { Card } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { demoDate } from "../../lib/demo";
import { StockNavigation } from "./StockNavigation";
export function StockOperationsPage() {
  const b = useWorkspace(),
    q = useStock(),
    products = useProducts(),
    c = useQueryClient(),
    [params] = useSearchParams();
  const [kind, setKind] = useState("Receive"),
    [lineId, setLine] = useState(""),
    [productId, setProduct] = useState(""),
    [warehouseId, setWarehouse] = useState(""),
    [review, setReview] = useState<StockOperation | null>(null);
  const linked = [
    "Receive",
    "Dispatch",
    "Customer return",
    "Supplier return",
    "Reserve",
    "Release",
  ].includes(kind);
  const line = q.data?.lines.find((l) => l.id === lineId),
    p = linked ? line?.product_id : productId,
    w = linked ? line?.warehouse_id : warehouseId;
  const balance = q.data?.balances.find(
    (s) => s.product_id === p && s.warehouse_id === w,
  );
  const m = useMutation({
    mutationFn: () => stockService.operation(b, review!),
    onError: () => c.invalidateQueries({ queryKey: ["stock", b] }),
    onSuccess: async () => {
      await Promise.all(
        ["stock", "inventory"].map((key) =>
          c.invalidateQueries({ queryKey: [key, b] }),
        ),
      );
      setReview(null);
    },
  });
  const lines = q.data?.lines.filter(
    (l) =>
      (!params.get("invoice") || l.invoice_id === params.get("invoice")) &&
      ["Receive", "Supplier return"].includes(kind) === (l.kind === "Receive"),
  );
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Stock Operations"
        subtitle="Receive, dispatch, reserve, transfer and count physical goods"
      />
      <StockNavigation />
      <QueryState queries={[q, products]} />
      <Card className="invoice-form-card">
        <form
          className="page-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.reset();
            setReview({
              requestId: crypto.randomUUID(),
              kind,
              productId: p!,
              warehouseId: w!,
              ...(linked ? { lineId } : {}),
              ...(kind === "Transfer"
                ? { targetWarehouseId: String(f.get("target")) }
                : {}),
              quantity: Number(f.get("quantity")),
              date: String(f.get("date")),
              reason: String(f.get("reason")),
              ...(["Count", "Valuation"].includes(kind)
                ? { expectedRevision: String(balance?.revision ?? 0) }
                : {}),
              ...(f.get("value")
                ? { valueMinor: Math.round(Number(f.get("value")) * 100) }
                : {}),
            });
          }}
        >
          <Select
            label="Operation"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setLine("");
            }}
          >
            {[
              "Receive",
              "Dispatch",
              "Customer return",
              "Supplier return",
              "Reserve",
              "Release",
              "Transfer",
              ...(q.data?.canManage ? ["Count", "Valuation"] : []),
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
          {linked ? (
            <Select
              label="Document line"
              value={lineId}
              required
              onChange={(e) => setLine(e.target.value)}
            >
              <option value="">Select issued document</option>
              {lines?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.display_id} · {l.product_name} · Outstanding{" "}
                  {(Number(l.expected_milli) - Number(l.fulfilled_milli)) /
                    1000}{" "}
                  {l.unit}
                </option>
              ))}
            </Select>
          ) : (
            <>
              <Select
                label="Product"
                value={productId}
                required
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="">Select product</option>
                {products.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Warehouse"
                value={warehouseId}
                required
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">Select warehouse</option>
                {q.data?.warehouses
                  .filter((w) => w.active)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </Select>
            </>
          )}
          {kind === "Transfer" && (
            <Select label="Destination warehouse" name="target" required>
              <option value="">Select destination</option>
              {q.data?.warehouses
                .filter((v) => v.active && v.id !== w)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </Select>
          )}
          <p>
            Available:{" "}
            {(Number(balance?.quantity_milli || 0) -
              Number(balance?.reserved_milli || 0)) /
              1000}
            . Reserved: {Number(balance?.reserved_milli || 0) / 1000}.
            Quantities use the product's base stock unit.
          </p>
          {line && (
            <p>
              Fulfilled: {Number(line.fulfilled_milli) / 1000}; returned:{" "}
              {Number(line.returned_milli) / 1000} {line.unit}.
            </p>
          )}
          <Input
            label={kind === "Count" ? "Counted quantity" : "Quantity"}
            name="quantity"
            type="number"
            min={["Count", "Valuation"].includes(kind) ? 0 : 0.001}
            max={1000000}
            step="0.001"
            required
            defaultValue={0}
          />
          {["Count", "Valuation"].includes(kind) && (
            <Input
              label={
                kind === "Valuation"
                  ? "Total opening value (PKR)"
                  : "Additional stock value (PKR)"
              }
              name="value"
              type="number"
              min={0}
              step="0.01"
              required={kind === "Valuation"}
            />
          )}
          <Input
            label="Operation date"
            name="date"
            type="date"
            required
            defaultValue={demoDate}
          />
          <Textarea
            label="Reason"
            name="reason"
            minLength={5}
            maxLength={500}
            required
          />
          <p>
            Returns change physical stock only. Create a separate credit note or
            refund when required. Counts reduce stock for damage or loss;
            explain the reason. Valuation is available only for existing stock
            with unknown cost.
          </p>
          <Button type="submit" disabled={!p || !w || m.isPending}>
            Review Operation
          </Button>
          {m.isSuccess && <p role="status">Stock operation saved.</p>}
        </form>
      </Card>
      <Card className="table-card">
        <Table aria-label="Warehouse balances" className="finance-table">
          <TableHeader>
            <TableRow>
              {["Product", "Warehouse", "On hand", "Reserved", "Available"].map(
                (t) => (
                  <th key={t}>{t}</th>
                ),
              )}
            </TableRow>
          </TableHeader>
          <tbody>
            {q.data?.balances.map((s) => (
              <TableRow key={s.product_id + s.warehouse_id}>
                <td>{s.product_name}</td>
                <td>{s.warehouse_name}</td>
                <td>
                  {Number(s.quantity_milli) / 1000} {s.unit}
                </td>
                <td>{Number(s.reserved_milli) / 1000}</td>
                <td>
                  {(Number(s.quantity_milli) - Number(s.reserved_milli)) / 1000}
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      <Modal
        title="Confirm Stock Operation"
        open={!!review}
        onOpenChange={(v) => {
          if (!v && !m.isPending) setReview(null);
        }}
      >
        <p>
          {review?.kind}: {review?.quantity} base units, {review?.date}.
        </p>
        <p>{review?.reason}</p>
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button disabled={m.isPending} onClick={() => m.mutate()}>
          Confirm Operation
        </Button>
      </Modal>
    </div>
  );
}
