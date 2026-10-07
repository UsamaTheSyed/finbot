import { useEffect, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "../../lib/queryClient";
import { authService } from "../../services/authService";
import { ApiError } from "../../services/api";
import { useAppStore } from "../../store/useAppStore";
import { ToastProvider } from "../../components/feedback/Toast";
import { ErrorState, LoadingSkeleton } from "../../components/feedback/States";
function Session({ children }: { children: ReactNode }) {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authService.session,
    retry: false,
  });
  const workspaceId = useAppStore((s) => s.workspaceId);
  const authenticated = useAppStore((s) => s.authenticated);
  const setSession = useAppStore((s) => s.setSession);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const logout = useAppStore((s) => s.logout);
  useEffect(() => {
    if (session.data) {
      if (!workspaceId && session.data.businesses[0])
        setSession(session.data.user, session.data.businesses[0].id);
      setAuthenticated(true);
    } else if (session.error instanceof ApiError && session.error.status === 401)
      logout();
  }, [session.data, session.error, workspaceId, setSession, setAuthenticated, logout]);
  useEffect(() => {
    const unauthorized = () => logout();
    window.addEventListener("finbot:unauthorized", unauthorized);
    return () => window.removeEventListener("finbot:unauthorized", unauthorized);
  }, [logout]);
  if (session.isPending || (session.data && !authenticated)) {
    return <LoadingSkeleton />;
  }
  if (session.error && !(session.error instanceof ApiError && session.error.status === 401))
    return (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  return children;
}
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Session>{children}</Session>
      </ToastProvider>
    </QueryClientProvider>
  );
}
