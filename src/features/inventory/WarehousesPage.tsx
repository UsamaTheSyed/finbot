import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useStock } from "./queries";
import { stockService, type Warehouse } from "../../services/stockService";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Fields";
import { Modal } from "../../components/ui/Overlays";
import { Card } from "../../components/ui/Display";
import { StockNavigation } from "./StockNavigation";
export function WarehousesPage() {
  const b = useWorkspace(),
    q = useStock(),
    c = useQueryClient();
  const [selected, setSelected] = useState<Warehouse | null>(null);
  const m = useMutation({
    mutationFn: (name: string) => stockService.warehouse(b, name),
    onSuccess: () => c.invalidateQueries({ queryKey: ["stock", b] }),
  });
  const a = useMutation({
    mutationFn: () => stockService.archive(b, selected!.id, !selected!.active),
    onSuccess: async () => {
      await c.invalidateQueries({ queryKey: ["stock", b] });
      setSelected(null);
    },
  });
  return (
    <div className="page-stack finance-page">
      <PageHeader title="Warehouses" subtitle="Physical stock locations" />
      <StockNavigation />
      <QueryState queries={[q]} />
      <Card className="invoice-form-card">
        <form
          className="page-stack"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(String(new FormData(e.currentTarget).get("name")));
          }}
        >
          <Input label="Warehouse name" name="name" required maxLength={100} />
          <Button type="submit" disabled={!q.data?.canManage || m.isPending}>
            Add Warehouse
          </Button>
          {m.error && <p role="alert">{m.error.message}</p>}
          {m.isSuccess && <p role="status">Warehouse saved.</p>}
        </form>
      </Card>
      {q.data?.warehouses.map((w) => (
        <Card key={w.id} className="invoice-form-card">
          <h2>{w.name}</h2>
          <p>{w.active ? "Active" : "Archived"}</p>
          <Button
            disabled={!q.data.canManage || w.id === `main:${b}`}
            onClick={() => {
              a.reset();
              setSelected(w);
            }}
          >
            {w.active ? "Archive" : "Reactivate"}
          </Button>
        </Card>
      ))}
      <Modal
        title="Confirm Warehouse Change"
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !a.isPending) setSelected(null);
        }}
      >
        <p>
          {selected?.active ? "Archive" : "Reactivate"} {selected?.name}?
        </p>
        <p>
          Warehouses containing stock or unfinished documents cannot be
          archived.
        </p>
        {a.error && <p role="alert">{a.error.message}</p>}
        <Button onClick={() => a.mutate()} disabled={a.isPending}>
          Confirm
        </Button>
      </Modal>
    </div>
  );
}
