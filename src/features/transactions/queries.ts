import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionService } from "../../services/transactionService";
import { partyService } from "../../services/partyService";
import { useWorkspace } from "../../hooks/useWorkspace";
import type {
  PaymentInput,
  TransactionEdit,
  TransactionFilters,
} from "../../types";
export function useTransactions(filters: TransactionFilters) {
  const id = useWorkspace();
  return useQuery({
    queryKey: ["transactions", id, filters],
    queryFn: () => transactionService.list(id, filters),
  });
}
export function useParties() {
  const id = useWorkspace();
  return useQuery({
    queryKey: ["parties", id],
    queryFn: () => partyService.list(id),
  });
}
export function useTransaction(id: string) {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["transactions", business, id],
    queryFn: () => transactionService.get(business, id),
  });
}
export function useTransactionActions(id: string) {
  const business = useWorkspace();
  const client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        "transactions",
        "payments",
        "reports",
        "invoices",
        "parties",
        "party",
        "financial-reports",
      ].map((key) => client.invalidateQueries({ queryKey: [key, business] })),
    );
  const edit = useMutation({
    mutationFn: (data: TransactionEdit) =>
      transactionService.update(business, id, data),
    onSuccess: refresh,
  });
  const pay = useMutation({
    mutationFn: (data: PaymentInput) =>
      transactionService.recordPayment(business, id, data),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => transactionService.remove(business, id),
    onSuccess: refresh,
  });
  return { edit, pay, remove };
}
