import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useProducts, useStock } from "./queries";
import { stockService } from "../../services/stockService";
import { Card } from "../../components/ui/Display";
import { Input } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
export function ProductUnits({ id }: { id: string }) {
  const b = useWorkspace(),
    c = useQueryClient(),
    q = useProducts(),
    stock = useStock(),
    p = q.data?.find((p) => p.id === id);
  const m = useMutation({
    mutationFn: (v: { name: string; factor: number }) =>
      stockService.unit(b, id, v.name, v.factor),
    onSuccess: () => c.invalidateQueries({ queryKey: ["inventory", b] }),
  });
  return (
    <Card className="invoice-form-card">
      <h2>Purchase / sale units</h2>
      <p>
        1 {p?.unit} = 1 base stock unit. Conversions are immutable to protect
        document history.
      </p>
      {p?.units?.map((u) => (
        <p key={u.name}>
          1 {u.name} = {u.factor} {p.unit}
        </p>
      ))}
      <form
        className="page-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          m.mutate({
            name: String(f.get("name")),
            factor: Number(f.get("factor")),
          });
        }}
      >
        <Input label="Alternate unit" name="name" required maxLength={40} />
        <Input
          label="Base units per alternate unit"
          name="factor"
          required
          type="number"
          min="0.001"
          max="1000000"
          step="0.001"
        />
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button type="submit" disabled={!stock.data?.canManage || m.isPending}>
          Add Conversion
        </Button>
      </form>
    </Card>
  );
}
