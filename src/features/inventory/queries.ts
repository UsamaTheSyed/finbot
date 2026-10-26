import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/useWorkspace";
import { inventoryService } from "../../services/inventoryService";
export function useProducts() {
  const b = useWorkspace();
  return useQuery({
    queryKey: ["inventory", b],
    queryFn: () => inventoryService.list(b),
  });
}
