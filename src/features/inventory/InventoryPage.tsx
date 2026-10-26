import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts } from "./queries";
import { inventoryService } from "../../services/inventoryService";
import { useWorkspace } from "../../hooks/useWorkspace";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Fields";
import { Modal } from "../../components/ui/Overlays";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { demoDate } from "../../lib/demo";
export function InventoryPage() {
  const q = useProducts(),
    b = useWorkspace(),
    client = useQueryClient();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const mutation = useMutation({
    mutationFn: (v: unknown) => inventoryService.create(b, v),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["inventory", b] });
      setOpen(false);
    },
  });
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Inventory"
        subtitle="Single warehouse · Physical stock quantities"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              mutation.reset();
              setOpen(true);
            }}
          >
            Add Product
          </Button>
        }
      />
      <Input
        label="Search products"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <QueryState queries={[q]} />
      {q.data && (
        <Card className="table-card">
          <Table aria-label="Inventory" className="finance-table">
            <TableHeader>
              <TableRow>
                {["SKU", "Product", "On hand", "Minimum", "Stock status"].map(
                  (t) => (
                    <th key={t}>{t}</th>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <tbody>
              {q.data
                .filter((p) =>
                  `${p.name} ${p.sku}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <TableRow key={p.id}>
                    <td>{p.sku}</td>
                    <td>
                      <Link to={`/inventory/${p.id}`}>{p.name}</Link>
                    </td>
                    <td>
                      {Number(p.stock_milli) / 1000} {p.unit}
                    </td>
                    <td>{Number(p.minimum_milli) / 1000}</td>
                    <td>
                      {!p.active
                        ? "Inactive"
                        : Number(p.stock_milli) <= Number(p.minimum_milli)
                          ? "Low stock"
                          : "In stock"}
                    </td>
                  </TableRow>
                ))}
            </tbody>
          </Table>
          {!q.data.length && (
            <p className="modal-description">
              No products yet. Add physical stock before selecting a product on
              a sale.
            </p>
          )}
        </Card>
      )}
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!mutation.isPending) setOpen(v);
        }}
        title="Add Product"
      >
        <form
          className="page-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            mutation.mutate({
              sku: f.get("sku"),
              name: f.get("name"),
              unit: f.get("unit"),
              opening: Number(f.get("opening")),
              minimum: Number(f.get("minimum")),
              date: f.get("date"),
            });
          }}
        >
          <Input label="SKU" name="sku" required maxLength={60} />
          <Input label="Product name" name="name" required maxLength={160} />
          <Input
            label="Stock unit"
            name="unit"
            required
            maxLength={40}
            defaultValue="pcs"
          />
          <Input
            label="Opening quantity"
            name="opening"
            type="number"
            step="0.001"
            min="0"
            max="1000000"
            required
            defaultValue="0"
          />
          <Input
            label="Low stock threshold"
            name="minimum"
            type="number"
            step="0.001"
            min="0"
            max="1000000"
            required
            defaultValue="0"
          />
          <Input
            label="Opening date"
            name="date"
            type="date"
            required
            defaultValue={demoDate}
          />
          <p>
            Opening quantity records physical stock only; it does not create a
            cash or accounting entry.
          </p>
          {mutation.error && <p role="alert">{mutation.error.message}</p>}
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            Save Product
          </Button>
        </form>
      </Modal>
    </div>
  );
}
