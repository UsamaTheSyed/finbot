import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { partyService } from "../../services/partyService";
import { invoiceService } from "../../services/invoiceService";
import { paymentService } from "../../services/paymentService";
import type {
  PartyInput,
  InvoiceInput,
  RecordPaymentInput,
} from "../../domain/validation";
export function useFinanceParties() {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["parties", business],
    queryFn: () => partyService.getParties(business),
  });
}
export function useParty(id: string) {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["party", business, id],
    queryFn: () => partyService.getPartyById(business, id),
  });
}
export function useInvoices() {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["invoices", business, "list"],
    queryFn: () => invoiceService.getInvoices(business),
  });
}
export function useInvoice(id: string) {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["invoices", business, id],
    queryFn: () => invoiceService.getInvoiceById(business, id),
  });
}
export function usePayments() {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["payments", business],
    queryFn: () => paymentService.getPayments(business),
  });
}
export function useFinanceMutations() {
  const business = useWorkspace(),
    client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        "parties",
        "party",
        "invoices",
        "payments",
        "transactions",
        "reports",
        "financial-reports",
      ].map((key) => client.invalidateQueries({ queryKey: [key, business] })),
    );
  const saveParty = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: PartyInput }) =>
      id
        ? partyService.updateParty(business, id, data)
        : partyService.createParty(business, data),
    onSuccess: refresh,
  });
  const createInvoice = useMutation({
    mutationFn: ({ data, draft }: { data: InvoiceInput; draft: boolean }) =>
      invoiceService.createInvoice(business, data, draft),
    onSuccess: refresh,
  });
  const updateInvoice = useMutation({
    mutationFn: ({
      id,
      data,
      draft,
      revision,
    }: {
      id: string;
      data: InvoiceInput;
      draft: boolean;
      revision?: string;
    }) => invoiceService.updateInvoice(business, id, data, draft, revision),
    onSuccess: refresh,
  });
  const editDraft = useMutation({
    mutationFn: ({
      id,
      data,
      revision,
    }: {
      id: string;
      data: InvoiceInput;
      revision: string;
    }) => invoiceService.saveDraft(business, id, data, revision),
    onSuccess: refresh,
    onError: refresh,
  });
  const recordPayment = useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      paymentService.createPayment(business, data),
    onSuccess: refresh,
  });
  return { saveParty, createInvoice, updateInvoice, editDraft, recordPayment };
}
