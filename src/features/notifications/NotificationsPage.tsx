import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/feedback/States";
import { useWorkspace } from "../../hooks/useWorkspace";
import { notificationService } from "../../services/notificationService";
import { demoDate } from "../../lib/demo";
import type { Notification } from "../../types";
import "../../styles/phase-four.css";

const previousDate = new Date(`${demoDate}T00:00:00Z`);
previousDate.setUTCDate(previousDate.getUTCDate() - 1);
const yesterday = previousDate.toISOString().slice(0, 10);

function groupNotifications(notifications: Notification[]) {
  return [
    ["Today", notifications.filter((item) => item.date === demoDate)],
    ["Yesterday", notifications.filter((item) => item.date === yesterday)],
    [
      "Earlier",
      notifications.filter(
        (item) => item.date !== demoDate && item.date !== yesterday,
      ),
    ],
  ] as const;
}
export function NotificationsPage() {
  const business = useWorkspace(),
    client = useQueryClient();
  const key = ["notifications", business];
  const query = useQuery({
    queryKey: key,
    queryFn: () => notificationService.list(business),
    refetchInterval: 15000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const read = useMutation({
    mutationFn: (id: string) => notificationService.markRead(business, id),
    onSuccess: refresh,
  });
  const all = useMutation({
    mutationFn: () => notificationService.markAllRead(business),
    onSuccess: refresh,
  });
  return (
    <div className="page-stack notifications-page">
      <PageHeader
        title="Notifications"
        subtitle="Stay updated with recent ledger events, transaction status changes, and critical tasks."
        actions={
          <Button
            size="small"
            disabled={!query.data?.some((n) => !n.read)}
            onClick={() => all.mutate()}
          >
            Mark All as Read
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !query.data?.length ? (
        <EmptyState title="You're all caught up" />
      ) : (
        <section aria-label="All notifications">
          {groupNotifications(query.data).map(
            ([label, items]) =>
              items.length > 0 && (
                <section className="notification-group" key={label}>
                  <h2>{label}</h2>
                  {items.map((n) => (
                    <article
                      className={`notification-row ${n.read ? "is-read" : ""}`}
                      key={n.id}
                    >
                      <span className="notification-orb" />
                      <div>
                        <Link to={n.href} onClick={() => read.mutate(n.id)}>
                          <strong>{n.title}</strong>
                        </Link>
                        <p>{n.description}</p>
                      </div>
                      <time dateTime={n.date}>{n.date}</time>
                      {n.read ? (
                        <span>Read</span>
                      ) : (
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={() => read.mutate(n.id)}
                        >
                          Mark as Read
                        </Button>
                      )}
                    </article>
                  ))}
                </section>
              ),
          )}
        </section>
      )}
    </div>
  );
}
