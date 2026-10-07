import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../services/api";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status === 404) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});
