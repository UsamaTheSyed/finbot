import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import {
  inventoryService,
  type Product,
} from "../../services/inventoryService";
import { Modal } from "../../components/ui/Overlays";
import { Input, Select } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
export function ProductEditDialog({
  product,
  open,
  close,
}: {
  product: Product;
  open: boolean;
  close: () => void;
}) {
  const b = useWorkspace(),
    client = useQueryClient();
  const m = useMutation({
    mutationFn: (data: unknown) => inventoryService.update(b, product.id, data),
    onSuccess: async () => {
      await Promise.all(
        ["stock", "inventory"].map((key) =>
          client.invalidateQueries({ queryKey: [key, b] }),
        ),
      );
      close();
    },
  });
  return (
    <Modal
      open={open}
      title="Edit Product"
      onOpenChange={(v) => {
        if (!v && !m.isPending) {
          m.reset();
          close();
        }
      }}
    >
      <form
        className="page-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          m.mutate({
            name: f.get("name"),
            category: f.get("category"),
            variant: f.get("variant"),
            minimum: Number(f.get("minimum")),
            active: f.get("active") === "true",
          });
        }}
      >
        <Input
          label="Category"
          name="category"
          defaultValue={product.category || ""}
        />
        <Input
          label="Variant"
          name="variant"
          defaultValue={product.variant || ""}
        />
        <Input
          label="Product name"
          name="name"
          defaultValue={product.name}
          required
          maxLength={160}
        />
        <Input
          label="Low stock threshold"
          name="minimum"
          type="number"
          min="0"
          max="1000000"
          step="0.001"
          defaultValue={Number(product.minimum_milli) / 1000}
          required
        />
        <Select
          label="Product availability"
          name="active"
          defaultValue={String(product.active)}
        >
          <option value="true">Active</option>
          <option value="false">
            Inactive — prevent new document postings
          </option>
        </Select>
        <p>
          SKU and stock unit remain fixed to preserve history. Change physical
          stock through a confirmed adjustment.
        </p>
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button type="submit" variant="primary" disabled={m.isPending}>
          Save Product
        </Button>
      </form>
    </Modal>
  );
}
