import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useInvoice, useFinanceParties } from "../finance/queries";
import { useCorrections, useCorrectInvoice } from "./correctionQueries";
import { InvoiceForm } from "./CreateInvoicePage";
import { QueryState } from "../../components/common/QueryState";
import { Alert } from "../../components/feedback/States";
import { Card } from "../../components/ui/Display";
import { Textarea, Input } from "../../components/ui/Fields";
import { ConfirmationDialog } from "../../components/ui/Overlays";
import { useToast } from "../../components/feedback/Toast";
import { buildInvoicePreview } from "../../domain/invoicePreview";
import type { InvoiceInput } from "../../domain/validation";
import type { Invoice } from "../../types";
export function CorrectInvoicePage() {
  const { id = "" } = useParams(),
    invoice = useInvoice(id),
    parties = useFinanceParties(),
    context = useCorrections(id);
  if (!invoice.data || !parties.data || !context.data)
    return (
      <QueryState queries={[invoice, parties, context]} back="/invoices" />
    );
  if (invoice.data.hasCreditHistory)
    return (
      <div className="page-stack">
        <Alert tone="info">
          Corrections are unavailable because this document has credit history.
          Existing records are preserved.
        </Alert>
        <Link to={`/invoices/${id}`}>Back to document</Link>
      </div>
    );
  if (invoice.data.status === "Draft")
    return (
      <div className="page-stack">
        <Alert tone="info">Use Edit Draft before issuing this document.</Alert>
        <Link to={`/invoices/${id}/edit`}>Edit Draft</Link>
      </div>
    );
  return (
    <CorrectionForm
      key={`${invoice.data.businessId}:${id}`}
      invoice={invoice.data}
      today={context.data.today}
    />
  );
}
function CorrectionForm({
  invoice,
  today,
}: {
  invoice: Invoice;
  today: string;
}) {
  const [original] = useState(invoice),
    [reason, setReason] = useState(""),
    [pending, setPending] = useState<InvoiceInput>(),
    [error, setError] = useState("");
  const save = useCorrectInvoice(original.id),
    navigate = useNavigate(),
    notify = useToast();
  const money = (minor: number) =>
    `PKR ${(minor / 100).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  function review(data: InvoiceInput) {
    setError("");
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      setError("Explain the correction in 5–500 characters.");
      return;
    }
    const proposed = buildInvoicePreview(data);
    if (proposed.totalMinor < original.paidMinor) {
      setError(
        "Corrected total cannot be below the allocated payment. A refund or credit adjustment is required.",
      );
      return;
    }
    setPending(data);
  }
  async function confirm() {
    if (!pending || save.isPending) return;
    try {
      await save.mutateAsync({
        revision: original.revision ?? "",
        reason: reason.trim(),
        effectiveDate: today,
        data: { ...pending, draft: false, amountPaid: 0 },
      });
      notify("Financial correction recorded.", "success");
      navigate(`/invoices/${original.id}`);
    } catch (e) {
      setPending(undefined);
      setError((e as Error).message);
    }
  }
  const proposed = pending ? buildInvoicePreview(pending) : undefined;
  return (
    <>
      <InvoiceForm
        initialInvoice={original}
        correction={{ onReview: review, pending: save.isPending, today }}
        extraFields={
          <Card className="invoice-form-card">
            <Input label="Correction date" value={today} readOnly />
            <Textarea
              label="Correction reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              disabled={save.isPending}
            />
            <p>
              Already allocated: {money(original.paidMinor)}. Existing payments
              and advances are preserved. Any new balance is settled separately.
            </p>
            {error && <Alert>{error}</Alert>}
            <Link to={`/invoices/${original.id}`}>Back to document</Link>
          </Card>
        }
      />
      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setPending(undefined);
        }}
        title="Confirm Financial Correction"
        confirmLabel="Confirm Correction"
        loading={save.isPending}
        onConfirm={() => void confirm()}
        description={`Document ${original.displayId ?? original.id}. Date: ${today}. Before: ${money(original.totalMinor)}. After: ${money(proposed?.totalMinor ?? 0)}. Adjustment: ${money((proposed?.totalMinor ?? 0) - original.totalMinor)}. Allocated payment: ${money(original.paidMinor)}. New balance: ${money((proposed?.totalMinor ?? 0) - original.paidMinor)}. Reason: ${reason}. This records a new correction and retains the original history.`}
      />
    </>
  );
}
