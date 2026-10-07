import { sumMinor, toMinor, fromMinor } from "../../utils/money";
import { z } from "zod";
import type {
  PaymentInput,
  Transaction,
  TransactionFilters,
} from "../../types";
export const paymentMethods = [
  "Cash",
  "Bank Transfer",
  "Easypaisa",
  "JazzCash",
  "Cheque",
] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Choose a real calendar date",
  );
export const editSchema = z.object({ date, notes: z.string().max(500) });
export const paymentSchema = z.object({
  amount: z
    .number()
    .finite()
    .positive("Amount must be greater than zero")
    .multipleOf(0.01, "Use at most two decimal places"),
  method: z.enum(paymentMethods),
  date,
});
export function applyPayment(
  transaction: Transaction,
  input: PaymentInput,
): Transaction {
  const parsed = paymentSchema.parse(input);
  if (parsed.amount > transaction.balance)
    throw new Error("Payment cannot exceed the outstanding balance.");
  const paid = fromMinor(
    sumMinor([toMinor(transaction.paid), toMinor(parsed.amount)]),
  );
  const balance = fromMinor(
    sumMinor([toMinor(transaction.total), -toMinor(paid)]),
  );
  return {
    ...transaction,
    paid,
    balance,
    status: balance === 0 ? "Completed" : "Partial",
  };
}
export function filterTransactions(
  rows: Transaction[],
  filters: TransactionFilters,
  partyNames: Map<string, string>,
) {
  return rows.filter(
    (row) =>
      (!filters.type || row.type === filters.type) &&
      (!filters.partyId || row.partyId === filters.partyId) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.from || row.date >= filters.from) &&
      (!filters.to || row.date <= filters.to) &&
      (!filters.search ||
        `${row.id} ${partyNames.get(row.partyId)}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())),
  );
}
