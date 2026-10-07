import { EmptyState, ErrorState, LoadingSkeleton } from "../feedback/States";
import { Link } from "react-router-dom";
import { ApiError } from "../../services/api";
export function QueryState({
  queries,
  back,
}: {
  queries: {
    isPending: boolean;
    error: Error | null;
    refetch: () => unknown;
  }[];
  back?: string;
}) {
  if (queries.some((q) => q.isPending)) return <LoadingSkeleton />;
  const failed = queries.find((q) => q.error);
  if (failed?.error instanceof ApiError && failed.error.status === 404)
    return (
      <EmptyState
        title="Record not found"
        action={back ? <Link to={back}>Back to list</Link> : undefined}
      />
    );
  return failed?.error ? (
    <ErrorState
      error={failed.error}
      retry={() => queries.forEach((q) => q.refetch())}
    />
  ) : null;
}
