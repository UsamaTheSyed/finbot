import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  recordPaymentSchema,
  paymentMethods,
  type RecordPaymentInput,
} from "../../domain/validation";
import { Modal } from "../../components/ui/Overlays";
import {
  Input,
  Select,
  Textarea,
  DatePicker,
} from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/feedback/States";
import { QueryState } from "../../components/common/QueryState";
import { useToast } from "../../components/feedback/Toast";
import {
  useFinanceParties,
  useInvoices,
  useFinanceMutations,
} from "../finance/queries";
import { Money } from "../finance/components";
import { demoDate } from "../../lib/demo";
import { fromMinor } from "../../utils/money";
interface PaymentDialogProps {
  partyId?: string;
  invoiceId?: string;
  direction?: RecordPaymentInput["direction"];
  onClose: () => void;
}
export function RecordPaymentDialog(props: PaymentDialogProps) {
  const parties = useFinanceParties(),
    invoices = useInvoices();
  if (!parties.data || !invoices.data)
    return (
      <Modal
        open
        title="Record Payment"
        onOpenChange={(v) => {
          if (!v) props.onClose();
        }}
      >
        <QueryState queries={[parties, invoices]} />
      </Modal>
    );
  return (
    <PaymentFormDialog
      {...props}
      parties={parties.data}
      invoices={invoices.data}
    />
  );
}
function PaymentFormDialog({
  partyId = "",
  invoiceId = "",
  direction = "Received",
  onClose,
  parties,
  invoices,
}: PaymentDialogProps & {
  parties: import("../../types").PartySummary[];
  invoices: import("../../types").Invoice[];
}) {
  const { recordPayment } = useFinanceMutations(),
    notify = useToast();
  const initial = invoices.find((i) => i.id === invoiceId);
  const {
    register,
    watch,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      direction,
      partyId,
      invoiceId,
      amount: initial ? fromMinor(initial.balanceMinor) : 0,
      method: "Cash",
      date: demoDate,
      reference: "",
      notes: "",
    },
  });
  const values = watch(),
    selected = invoices.find((i) => i.id === values.invoiceId);
  const available = invoices.filter(
    (i) =>
      i.partyId === values.partyId &&
      i.status !== "Draft" &&
      i.balanceMinor > 0 &&
      (parties.find((p) => p.id === i.partyId)?.kind === "Supplier"
        ? "Sent"
        : "Received") === values.direction,
  );
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !recordPayment.isPending) onClose();
      }}
      title="Record Payment"
      className="payment-form-modal"
    >
      <form
        className="form-stack"
        noValidate
        onSubmit={handleSubmit(async (data) => {
          try {
            await recordPayment.mutateAsync(data);
            notify("Payment recorded and balances updated.", "success");
            onClose();
          } catch (e) {
            setError("root", { message: (e as Error).message });
          }
        })}
      >
        <div className="form-grid">
          <Select
            label="Type"
            {...register("direction", {
              onChange: () => setValue("invoiceId", ""),
            })}
          >
            <option value="Received">Payment Received</option>
            <option value="Sent">Payment Sent</option>
          </Select>
          <Select
            label="Party"
            {...register("partyId", {
              onChange: () => setValue("invoiceId", ""),
            })}
            error={errors.partyId?.message}
          >
            <option value="">Choose a party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Select
          label="Link to invoice"
          {...register("invoiceId", {
            onChange: (e) => {
              const i = invoices.find((i) => i.id === e.target.value);
              if (i) setValue("amount", fromMinor(i.balanceMinor));
            },
          })}
        >
          <option value="">On account — no invoice</option>
          {available.map((i) => (
            <option key={i.id} value={i.id}>
              {i.displayId ?? i.id}
            </option>
          ))}
        </Select>
        {selected ? (
          <p className="payment-balance">
            Outstanding balance <Money value={selected.balanceMinor} />
          </p>
        ) : (
          <p className="muted">
            On-account payments change the party balance without settling a
            specific invoice.
          </p>
        )}
        <div className="form-grid">
          <Input
            label="Amount (PKR)"
            type="number"
            min="0.01"
            step="0.01"
            {...register("amount", { valueAsNumber: true })}
            error={errors.amount?.message}
          />
          <Select label="Payment Method" {...register("method")}>
            {paymentMethods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <DatePicker
            label="Date"
            {...register("date")}
            error={errors.date?.message}
          />
          <Input
            label="Reference"
            {...register("reference")}
            error={errors.reference?.message}
          />
        </div>
        <Textarea
          label="Notes"
          {...register("notes")}
          error={errors.notes?.message}
        />
        {errors.root && <Alert>{errors.root.message}</Alert>}
        <div className="dialog-actions">
          <Button disabled={recordPayment.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={recordPayment.isPending}
          >
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
