import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "../../components/ui/Overlays";
import {
  Input,
  Textarea,
  Select,
  DatePicker,
} from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/feedback/States";
import { paymentMethods, paymentSchema, editSchema } from "./domain";
import type { PaymentInput, Transaction, TransactionEdit } from "../../types";
interface Props<T> {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  onSubmit: (value: T) => Promise<void>;
  loading: boolean;
}
export function EditDialog({
  open,
  onClose,
  transaction,
  onSubmit,
  loading,
}: Props<TransactionEdit>) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<TransactionEdit>({
    resolver: zodResolver(editSchema),
    defaultValues: { date: transaction.date, notes: transaction.notes },
  });
  useEffect(() => {
    if (open) reset({ date: transaction.date, notes: transaction.notes });
  }, [open, transaction, reset]);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) onClose();
      }}
      title="Edit Transaction"
      description={transaction.id}
    >
      <form
        onSubmit={handleSubmit(async (value) => {
          try {
            await onSubmit(value);
          } catch (error) {
            setError("root", { message: (error as Error).message });
          }
        })}
        className="form-stack"
      >
        <DatePicker
          label="Date"
          {...register("date")}
          error={errors.date?.message}
        />
        <Textarea
          label="Notes"
          {...register("notes")}
          error={errors.notes?.message}
          rows={4}
        />
        {errors.root && <Alert>{errors.root.message}</Alert>}
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function PaymentDialog({
  open,
  onClose,
  transaction,
  onSubmit,
  loading,
}: Props<PaymentInput>) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: transaction.balance,
      method: "Cash",
      date: transaction.date,
    },
  });
  useEffect(() => {
    if (open)
      reset({
        amount: transaction.balance,
        method: "Cash",
        date: transaction.date,
      });
  }, [open, transaction, reset]);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) onClose();
      }}
      title="Record Payment"
      description={transaction.id}
    >
      <form
        className="form-stack"
        onSubmit={handleSubmit(async (value) => {
          if (value.amount > transaction.balance) {
            setError("amount", {
              message: "Payment cannot exceed the outstanding balance.",
            });
            return;
          }
          try {
            await onSubmit(value);
          } catch (error) {
            setError("root", { message: (error as Error).message });
          }
        })}
      >
        <Input
          label="Amount (PKR)"
          type="number"
          min="0.01"
          max={transaction.balance}
          step="0.01"
          {...register("amount", { valueAsNumber: true })}
          error={errors.amount?.message}
        />
        <Select
          label="Payment Method"
          {...register("method")}
          error={errors.method?.message}
        >
          {paymentMethods.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </Select>
        <DatePicker
          label="Payment Date"
          {...register("date")}
          error={errors.date?.message}
        />
        {errors.root && <Alert>{errors.root.message}</Alert>}
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
