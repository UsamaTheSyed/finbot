import { useState } from "react";
import { Modal, ConfirmationDialog } from "../../components/ui/Overlays";
import { Input, Select, Textarea } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { QueryState } from "../../components/common/QueryState";
import { useInvoices } from "../finance/queries";
import { useCredits, usePostCredit } from "./queries";
import { toMinor, formatPKR, sumMinor } from "../../utils/money";
import { paymentMethods } from "../../domain/validation";
import type { Invoice } from "../../types";
import type { CreditAction, CreditRequest } from "../../types/credits";
export function CreditDialog({
  kind,
  partyId,
  invoice,
  onClose,
}: {
  kind: CreditAction;
  partyId: string;
  invoice?: Invoice;
  onClose: () => void;
}) {
  const context = useCredits(partyId),
    invoices = useInvoices();
  const save = usePostCredit(),
    notify = useToast();
  const [original] = useState(invoice),
    [target, setTarget] = useState(invoice?.id ?? ""),
    [amount, setAmount] = useState(""),
    [tax, setTax] = useState("0"),
    [discount, setDiscount] = useState("0"),
    [reason, setReason] = useState(""),
    [method, setMethod] = useState("Cash"),
    [reference, setReference] = useState(""),
    [error, setError] = useState("");
  const [pending, setPending] = useState<{
    data: CreditRequest;
    description: string;
  }>();
  // Retain one request identity for retrying the same confirmed payload after a network failure.
  const [attempt, setAttempt] = useState<{ fingerprint: string; id: string }>();
  const title =
    kind === "note"
      ? "Record Credit Note"
      : kind === "application"
        ? "Apply Credit"
        : "Record Refund";
  if (!context.data || !invoices.data)
    return (
      <Modal
        open
        title={title}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <QueryState queries={[context, invoices]} />
      </Modal>
    );
  const info = context.data,
    choices = invoices.data.filter(
      (i) =>
        i.partyId === partyId && i.status !== "Draft" && i.balanceMinor > 0,
    );
  function review() {
    setError("");
    try {
      if (reason.trim().length < 5 || reason.trim().length > 500)
        throw Error("Explain the reason in 5–500 characters.");
      const selected =
        kind === "note" ? original : choices.find((i) => i.id === target);
      let data: CreditRequest = {
        requestId: "",
        amountMinor: toMinor(amount),
        effectiveDate: info.today,
        reason: reason.trim(),
      };
      let description = "";
      if (kind === "note") {
        if (!selected || selected.status === "Draft")
          throw Error("Choose an issued document.");
        const subtotalMinor = toMinor(amount),
          taxMinor = toMinor(tax),
          discountMinor = toMinor(discount);
        if (
          subtotalMinor < 0 ||
          taxMinor < 0 ||
          discountMinor < 0 ||
          discountMinor > subtotalMinor
        )
          throw Error(
            "Enter nonnegative amounts; discount cannot exceed subtotal.",
          );
        const total = sumMinor([subtotalMinor, taxMinor, -discountMinor]);
        const net = selected.netTotalMinor ?? selected.totalMinor;
        if (total <= 0 || total > net)
          throw Error(
            "Credit must be greater than zero and cannot exceed the remaining document value.",
          );
        const debt = Math.min(selected.balanceMinor, total),
          funded = total - debt;
        data = {
          ...data,
          amountMinor: total,
          subtotalMinor,
          taxMinor,
          discountMinor,
          invoiceId: selected.id,
          revision: selected.revision ?? "",
        };
        description = `${selected.displayId ?? selected.id}. Credit ${formatPKR(total)}. Debt reduction ${formatPKR(debt)}. Available credit created ${formatPKR(funded)}. New net total ${formatPKR(net - total)}. No cash moves.`;
      } else {
        if (data.amountMinor <= 0 || data.amountMinor > info.availableMinor)
          throw Error(
            "Amount must be greater than zero and within available credit.",
          );
        if (kind === "application") {
          if (!selected || data.amountMinor > selected.balanceMinor)
            throw Error(
              "Choose an outstanding document with sufficient balance.",
            );
          data = {
            ...data,
            invoiceId: selected.id,
            revision: selected.revision ?? "",
          };
          description = `Apply ${formatPKR(data.amountMinor)} to ${selected.displayId ?? selected.id}. New balance ${formatPKR(selected.balanceMinor - data.amountMinor)}. No cash moves.`;
        } else {
          data = { ...data, partyId, method, reference };
          description = `Record ${info.kind === "Customer" ? "refund sent to customer" : "refund received from supplier"}: ${formatPKR(data.amountMinor)} by ${method}. Remaining credit ${formatPKR(info.availableMinor - data.amountMinor)}. This records an actual refund; it does not transfer money.`;
        }
      }
      const fingerprint = JSON.stringify(data),
        requestId =
          attempt?.fingerprint === fingerprint
            ? attempt.id
            : crypto.randomUUID();
      setAttempt({ fingerprint, id: requestId });
      setPending({
        data: { ...data, requestId },
        description: `${description} Date ${info.today}. Reason: ${reason.trim()}`,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (!pending || save.isPending) return;
    try {
      await save.mutateAsync({ kind, data: pending.data });
      notify(`${title} saved.`, "success");
      onClose();
    } catch (e) {
      setPending(undefined);
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Modal
        open
        title={title}
        className="payment-form-modal"
        onOpenChange={(v) => {
          if (!v && !save.isPending) onClose();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
          className="form-stack"
        >
          <p>
            Available credit: {formatPKR(info.availableMinor)}.{" "}
            {info.kind === "Supplier" ? "Supplier" : "Customer"} account.
          </p>
          {kind === "note" ? (
            <>
              <Input
                label="Document"
                value={original?.displayId ?? original?.id ?? ""}
                readOnly
              />
              <p>
                Enter the credited subtotal, tax and discount explicitly.
                Original invoice amounts remain in history.
              </p>
            </>
          ) : kind === "application" ? (
            <Select
              label="Apply to document"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            >
              <option value="">Choose invoice / bill</option>
              {choices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.displayId ?? i.id} — {formatPKR(i.balanceMinor)}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              label="Direction"
              value={
                info.kind === "Customer"
                  ? "Sent — customer refund"
                  : "Received — supplier refund"
              }
              readOnly
            />
          )}
          <Input
            label={kind === "note" ? "Credit subtotal (PKR)" : "Amount (PKR)"}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {kind === "note" && (
            <>
              <Input
                label="Credit tax (PKR)"
                type="number"
                min="0"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
              <Input
                label="Credit discount (PKR)"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </>
          )}
          {kind === "refund" && (
            <>
              <Select
                label="Payment Method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {paymentMethods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
              <Input
                label="Reference"
                maxLength={100}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </>
          )}
          <Input label="Date" value={info.today} readOnly />
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            required
          />
          {error && <Alert>{error}</Alert>}
          <div className="dialog-actions">
            <Button disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={save.isPending}>
              Review
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v && !save.isPending) setPending(undefined);
        }}
        title={`Confirm ${title}`}
        description={pending?.description ?? ""}
        confirmLabel="Confirm"
        loading={save.isPending}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
