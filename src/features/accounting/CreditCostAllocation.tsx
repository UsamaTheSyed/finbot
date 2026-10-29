import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  accountingService,
  type AccountingReport,
} from "../../services/accountingService";
import { useProducts, useStock } from "../inventory/queries";
import { Modal } from "../../components/ui/Overlays";
import { Button } from "../../components/ui/Button";
import { Input, Select, Textarea } from "../../components/ui/Fields";
import { toMinor } from "../../utils/money";
import { demoDate } from "../../lib/demo";
export function CreditCostAllocation({
  business,
  credit,
  close,
}: {
  business: string;
  credit: NonNullable<AccountingReport["pending"]>[number];
  close: () => void;
}) {
  const products = useProducts(),
    stock = useStock(),
    c = useQueryClient(),
    [review, setReview] = useState<Record<string, unknown> | null>(null),
    [rows, setRows] = useState([0]),
    [error, setError] = useState("");
  const m = useMutation({
    mutationFn: () => accountingService.resolve(business, review),
    onSuccess: async () => {
      await Promise.all(
        ["accounting", "stock", "inventory", "financial-reports"].map((key) =>
          c.invalidateQueries({ queryKey: [key, business] }),
        ),
      );
      close();
    },
  });
  return (
    <Modal
      open
      title="Allocate Supplier Credit Cost"
      onOpenChange={(v) => {
        if (!v && !m.isPending) close();
      }}
    >
      <p>
        {credit.display_id}: PKR {Number(credit.net_minor) / 100} net credit.
        Split the verified credit between goods still held, sold goods,
        physically returned goods and untracked expenses. The split must equal
        the net credit.
      </p>
      <form
        className="page-stack"
        onChange={() => setReview(null)}
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            const f = new FormData(e.currentTarget),
              allocations = rows
                .map((i) => ({
                  productId: String(f.get("product" + i)),
                  warehouseId: String(f.get("warehouse" + i)),
                  amountMinor: toMinor(String(f.get("inventory" + i))),
                }))
                .filter((a) => a.amountMinor > 0),
              cogsMinor = toMinor(String(f.get("cogs"))),
              clearingMinor = toMinor(String(f.get("clearing"))),
              expenseMinor = toMinor(String(f.get("expense")));
            if (
              allocations.reduce((sum, a) => sum + a.amountMinor, 0) +
                cogsMinor +
                clearingMinor +
                expenseMinor !==
              Number(credit.net_minor)
            )
              throw new Error("Allocation must equal the net credit.");
            setReview({
              creditId: credit.id,
              allocations,
              cogsMinor,
              clearingMinor,
              expenseMinor,
              date: f.get("date"),
              reason: f.get("reason"),
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Check amounts.");
          }
        }}
      >
        {rows.map((i) => (
          <fieldset key={i}>
            <legend>Remaining inventory {i + 1}</legend>
            <Input
              label={`Inventory reduction ${i + 1} (PKR)`}
              name={"inventory" + i}
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              required
            />
            <Select label={`Credited product ${i + 1}`} name={"product" + i}>
              <option value="">Choose product for inventory reduction</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select label={`Warehouse ${i + 1}`} name={"warehouse" + i}>
              <option value="">Choose warehouse</option>
              {stock.data?.warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </Select>
          </fieldset>
        ))}
        <Button
          type="button"
          onClick={() => {
            setRows([...rows, rows.length]);
            setReview(null);
          }}
          disabled={rows.length >= 100}
        >
          Add Inventory Allocation
        </Button>
        <Input
          label="Sold goods COGS reduction (PKR)"
          name="cogs"
          type="number"
          step="0.01"
          defaultValue="0"
          required
        />
        <p>
          A negative COGS reduction records a cost increase when returned goods
          cost more than the supplier credit.
        </p>
        <Input
          label="Returned goods clearing (PKR)"
          name="clearing"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          required
        />
        <Input
          label="Untracked expense reduction (PKR)"
          name="expense"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          required
        />
        <Input
          label="Allocation date"
          name="date"
          type="date"
          defaultValue={demoDate}
          required
        />
        <Textarea
          label="Allocation reason"
          name="reason"
          minLength={5}
          maxLength={500}
          required
        />
        <Button type="submit">Review Cost Allocation</Button>
      </form>
      {review && (
        <>
          <p>
            Reviewed total: PKR {Number(credit.net_minor) / 100}. Confirm the
            verified split above. This creates permanent cost adjustments.
          </p>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Confirm Cost Allocation
          </Button>
        </>
      )}
      {(error || m.error) && <p role="alert">{error || m.error?.message}</p>}
    </Modal>
  );
}
