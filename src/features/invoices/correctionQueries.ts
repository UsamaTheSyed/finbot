import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { correctionService } from "../../services/correctionService";
import type { CorrectionRequest } from "../../types/corrections";
export function useCorrections(id: string) {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["invoice-corrections", business, id],
    queryFn: () => correctionService.history(business, id),
  });
}
export function useCorrectInvoice(id: string) {
  const business = useWorkspace(),
    client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        "invoices",
        "invoice-corrections",
        "parties",
        "party",
        "payments",
        "transactions",
        "reports",
        "financial-reports",
        "statement",
      ].map((key) => client.invalidateQueries({ queryKey: [key, business] })),
    );
  return useMutation({
    mutationFn: (data: CorrectionRequest) =>
      correctionService.save(business, id, data),
    onSuccess: refresh,
    onError: refresh,
  });
}
