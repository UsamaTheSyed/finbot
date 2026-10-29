import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { creditService } from "../../services/creditService";
import type { CreditAction, CreditRequest } from "../../types/credits";
export function useCredits(partyId: string) {
  const business = useWorkspace();
  return useQuery({
    queryKey: ["credits", business, partyId],
    queryFn: () => creditService.context(business, partyId),
  });
}
export function usePostCredit() {
  const business = useWorkspace(),
    client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        "credits",
        "invoices",
        "invoice-corrections",
        "parties",
        "party",
        "payments",
        "transactions",
        "reports",
        "financial-reports",
        "accounting",
      ].map((key) => client.invalidateQueries({ queryKey: [key, business] })),
    );
  return useMutation({
    mutationFn: ({ kind, data }: { kind: CreditAction; data: CreditRequest }) =>
      creditService.post(business, kind, data),
    onSuccess: refresh,
    onError: refresh,
  });
}
