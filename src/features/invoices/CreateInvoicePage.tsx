import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  invoiceSchema,
  paymentMethods,
  type InvoiceInput,
} from "../../domain/validation";
import {
  tryInvoicePreview,
  buildInvoicePreview,
} from "../../domain/invoicePreview";
import { demoDate } from "../../lib/demo";
import type { Invoice } from "../../types";
import { useFinanceParties, useFinanceMutations } from "../finance/queries";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import {
  Input,
  Select,
  Textarea,
  DatePicker,
} from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Display";
import { Modal } from "../../components/ui/Overlays";
import { Alert } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { FinancialSummary } from "../finance/components";
import { InvoiceItemFields, blankInvoiceItem } from "./InvoiceItemFields";
import { InvoiceDocument, invoiceSummaryRows } from "./InvoiceDocument";
export function CreateInvoicePage() {
  const parties = useFinanceParties(),
    { createInvoice } = useFinanceMutations(),
    navigate = useNavigate(),
    [search] = useSearchParams(),
    notify = useToast();
  const isBill =
    search.get("kind") === "Supplier" ||
    parties.data?.find((p) => p.id === search.get("party"))?.kind ===
      "Supplier";
  const partyKind = isBill ? "Supplier" : "Customer";
  const [preview, setPreview] = useState<Invoice>();
  const defaultDueDate = new Date(`${demoDate}T00:00:00Z`);
  defaultDueDate.setUTCDate(defaultDueDate.getUTCDate() + 30);
  const form = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      partyId: search.get("party") || "",
      date: demoDate,
      dueDate: defaultDueDate.toISOString().slice(0, 10),
      reference: "",
      items: [{ ...blankInvoiceItem }],
      discount: 0,
      amountPaid: 0,
      method: "Cash",
      notes: "",
      terms: "",
    },
  });
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = form;
  const values = watch(),
    calculated = tryInvoicePreview(values);
  async function save(data: InvoiceInput, draft: boolean) {
    if (
      !parties.data?.some((p) => p.id === data.partyId && p.kind === partyKind)
    ) {
      setError("partyId", { message: `Choose a ${partyKind.toLowerCase()}.` });
      return;
    }
    try {
      const invoice = await createInvoice.mutateAsync({ data, draft });
      notify(
        draft ? "Draft saved." : isBill ? "Bill created." : "Invoice created.",
        "success",
      );
      navigate(`/invoices/${invoice.id}`);
    } catch (e) {
      setError("root", { message: (e as Error).message });
    }
  }
  if (!parties.data) return <QueryState queries={[parties]} />;
  return (
    <div className="page-stack finance-page create-invoice-page">
      <PageHeader
        title={isBill ? "New Bill" : "New Invoice"}
        subtitle={
          isBill
            ? "Record a supplier bill and track amounts payable"
            : "Draft and dispatch customer ledger values"
        }
      />
      <FormProvider {...form}>
        <form
          className="page-stack"
          noValidate
          onSubmit={handleSubmit((data) => save(data, false))}
        >
          <div className="invoice-bottom-grid">
            <Card className="invoice-form-card">
              <h2>
                {isBill
                  ? "Supplier & Date Parameters"
                  : "Client & Date Parameters"}
              </h2>
              <div className="form-grid">
                <Select
                  label={partyKind}
                  {...register("partyId")}
                  error={errors.partyId?.message}
                >
                  <option value="">Choose a {partyKind.toLowerCase()}</option>
                  {parties.data
                    .filter((p) => p.kind === partyKind)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Reference Number"
                  {...register("reference")}
                  error={errors.reference?.message}
                />
                <DatePicker
                  label={isBill ? "Bill Date" : "Invoice Date"}
                  {...register("date")}
                  error={errors.date?.message}
                />
                <DatePicker
                  label="Due Date"
                  {...register("dueDate")}
                  error={errors.dueDate?.message}
                />
              </div>
            </Card>
            <FinancialSummary
              title="Running Totals"
              rows={
                calculated.invoice
                  ? [
                      ["Subtotal", calculated.invoice.subtotalMinor],
                      ["Tax", calculated.invoice.taxMinor],
                      ["Grand Total", calculated.invoice.totalMinor],
                    ]
                  : []
              }
            />
          </div>
          <InvoiceItemFields />
          <div className="invoice-bottom-grid">
            <div className="page-stack">
              <Card className="invoice-form-card">
                <h2>Payment</h2>
                <div className="form-grid">
                  <Input
                    label="Amount Paid (PKR)"
                    type="number"
                    min="0"
                    step="0.01"
                    {...register("amountPaid", { valueAsNumber: true })}
                    error={errors.amountPaid?.message}
                  />
                  <Select label="Payment Method" {...register("method")}>
                    {paymentMethods.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </div>
              </Card>
              <Card className="invoice-form-card">
                <Textarea
                  label="Notes"
                  rows={3}
                  {...register("notes")}
                  error={errors.notes?.message}
                />
                <Textarea
                  label="Terms & Conditions"
                  rows={3}
                  {...register("terms")}
                  error={errors.terms?.message}
                />
              </Card>
            </div>
            <div className="page-stack">
              <Card className="invoice-form-card">
                <Input
                  label="Discount (PKR)"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("discount", { valueAsNumber: true })}
                  error={errors.discount?.message}
                />
              </Card>
              <FinancialSummary
                title="Final Bill"
                rows={
                  calculated.invoice
                    ? invoiceSummaryRows(calculated.invoice)
                    : []
                }
              />
              {calculated.error && <Alert>{calculated.error}</Alert>}
            </div>
          </div>
          {errors.root && <Alert>{errors.root.message}</Alert>}
          <Card className="invoice-action-bar">
            <div className="actions">
              <Button
                disabled={createInvoice.isPending}
                onClick={() => void handleSubmit((data) => save(data, true))()}
              >
                Save Draft
              </Button>
              <Button
                disabled={createInvoice.isPending}
                onClick={() =>
                  void handleSubmit((data) =>
                    setPreview(buildInvoicePreview(data)),
                  )()
                }
              >
                Preview
              </Button>
            </div>
            <Button
              variant="primary"
              type="submit"
              loading={createInvoice.isPending}
            >
              {isBill ? "Create Bill" : "Create Invoice"}
            </Button>
          </Card>
        </form>
      </FormProvider>
      {preview && (
        <Modal
          open
          title={isBill ? "Bill Preview" : "Invoice Preview"}
          className="invoice-preview-modal"
          onOpenChange={(v) => {
            if (!v) setPreview(undefined);
          }}
        >
          <InvoiceDocument
            invoice={preview}
            party={parties.data.find((p) => p.id === preview.partyId)}
          />
        </Modal>
      )}
    </div>
  );
}
