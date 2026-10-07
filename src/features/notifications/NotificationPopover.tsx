import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { notificationService } from "../../services/notificationService";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Button } from "../../components/ui/Button";
import {
  ErrorState,
  LoadingSkeleton,
  EmptyState,
} from "../../components/feedback/States";
export function NotificationPopover() {
  const business = useWorkspace();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", business],
    queryFn: () => notificationService.list(business),
  });
  const read = useMutation({
    mutationFn: (id: string) => notificationService.markRead(business, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", business] }),
  });
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="notification-trigger"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {query.data?.some((n) => !n.read) && (
            <span className="notification-dot" />
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="dropdown notification-panel"
          align="end"
          sideOffset={8}
        >
          <h2>Notifications</h2>
          {query.isPending ? (
            <LoadingSkeleton />
          ) : query.error ? (
            <ErrorState error={query.error} />
          ) : query.data?.length ? (
            query.data.map((n) => (
              <Popover.Close asChild key={n.id}>
                <button
                  className="notification-item"
                  onClick={() => {
                    read.mutate(n.id);
                    navigate(n.href);
                  }}
                >
                  <strong>
                    {n.title}
                    {!n.read && <span className="unread-label">Unread</span>}
                  </strong>
                  <span>{n.description}</span>
                </button>
              </Popover.Close>
            ))
          ) : (
            <EmptyState title="You're all caught up" />
          )}
          <Popover.Close asChild>
            <Button onClick={() => navigate("/notifications")}>
              View all notifications
            </Button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
