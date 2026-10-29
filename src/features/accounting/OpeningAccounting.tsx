import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingService } from "../../services/accountingService";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Fields";
import { Card } from "../../components/ui/Display";
import { Modal } from "../../components/ui/Overlays";
import { toMinor } from "../../utils/money";
import { demoDate } from "../../lib/demo";
const fields = [
  ["cash", "Cash / bank"],
  ["customer", "Customer control"],
  ["supplier", "Supplier control"],
  ["inventory", "Inventory"],
  ["inputTax", "Input tax control"],
  ["outputTax", "Output tax control"],
] as const;
export function OpeningAccounting({ business }: { business: string }) {
  const [date, setDate] = useState(demoDate),
    [review, setReview] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    c = useQueryClient();
  const preview = useMutation({
    mutationFn: () => accountingService.preview(business, date),
  });
  const activate = useMutation({
    mutationFn: () => accountingService.activate(business, review),
    onSuccess: async () => {
      setReview(null);
      await Promise.all(
        ["accounting", "financial-reports"].map((key) =>
          c.invalidateQueries({ queryKey: [key, business] }),
        ),
      );
    },
  });
  const p = preview.data;
  return (
    <Card className="invoice-form-card">
      <h2>Verify opening balances</h2>
      <p>
        Activate from a verified snapshot today. Existing events, including
        today's events already recorded, become opening balances. Earlier profit
        reports stay on the legacy basis.
      </p>
      <Input
        label="Cutover date"
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          preview.reset();
          setReview(null);
        }}
      />
      <Button onClick={() => preview.mutate()} disabled={preview.isPending}>
        Load Opening Preview
      </Button>
      {preview.error && <p role="alert">{preview.error.message}</p>}
      {p && (
        <>
          <dl>
            {fields.slice(0, 4).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>PKR {(p[key as "cash"] / 100).toLocaleString("en-PK")}</dd>
              </div>
            ))}
          </dl>
          <p>
            Customer credit/advance balances are negative. Supplier amounts
            owing are negative; supplier advances are positive. Enter signed
            balances exactly after verifying them against business records.
          </p>
          <details>
            <summary>Review parties and stock</summary>
            {p.parties.map((v) => (
              <p key={v.id}>
                {v.name} ({v.kind}): PKR {v.balance / 100}
              </p>
            ))}
            {p.stock.map((v) => (
              <p key={v.productId + v.warehouseId}>
                {v.name} · {v.warehouse}: {v.quantityMilli / 1000} units ·{" "}
                {v.valueMinor === null
                  ? "Unknown cost"
                  : `PKR ${v.valueMinor / 100}`}
              </p>
            ))}
          </details>
          {p.blockers.map((v) => (
            <p role="alert" key={v}>
              {v}
            </p>
          ))}
          <form
            className="page-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              try {
                const f = new FormData(e.currentTarget);
                activate.reset();
                setReview({
                  date: p.date,
                  token: p.token,
                  confirmed: true,
                  ...Object.fromEntries(
                    fields.map(([k]) => [k, toMinor(String(f.get(k)))]),
                  ),
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Check balances.");
              }
            }}
          >
            <div className="form-grid">
              {fields.map(([k, label]) => (
                <Input
                  key={k}
                  label={`Verified ${label} (PKR)`}
                  name={k}
                  type="number"
                  step="0.01"
                  required
                  min={
                    ["inventory", "inputTax", "outputTax"].includes(k)
                      ? 0
                      : undefined
                  }
                />
              ))}
            </div>
            <label>
              <input type="checkbox" required /> I verified cash, party
              balances, advances, stock cost and tax control balances. Opening
              equity is the balancing amount.
            </label>
            <p>
              Tracked goods use the existing moving weighted-average cost.
              Revenue and COGS are recognized at dispatch. Untracked purchases
              are expensed. Input tax control does not certify tax
              recoverability. After activation, post in date order; use dated
              adjustments instead of rewriting history.
            </p>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" disabled={p.blockers.length > 0}>
              Review Accounting Activation
            </Button>
          </form>
        </>
      )}
      <Modal
        title="Activate Accounting"
        open={!!review}
        onOpenChange={(v) => {
          if (!v && !activate.isPending) setReview(null);
        }}
      >
        <p>
          Freeze the verified opening snapshot dated {p?.date}? This enables
          permanent source-linked journals and protects posted history.
        </p>
        {activate.error && <p role="alert">{activate.error.message}</p>}
        <Button onClick={() => activate.mutate()} disabled={activate.isPending}>
          Confirm Activation
        </Button>
      </Modal>
    </Card>
  );
}
