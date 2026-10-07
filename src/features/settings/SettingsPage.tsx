import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, Badge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { ErrorState, LoadingSkeleton } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { useAppStore } from "../../store/useAppStore";
import { settingsService } from "../../services/settingsService";
import { BusinessProfileForm } from "./BusinessProfileForm";
import whatsapp from "../../assets/phase-three/whatsapp.svg";
import telegram from "../../assets/phase-three/telegram.svg";
import "../../styles/phase-three.css";
export function SettingsPage() {
  const id = useAppStore((s) => s.workspaceId);
  const notify = useToast();
  const query = useQuery({
    queryKey: ["business-profile", id],
    queryFn: () => settingsService.get(id),
    enabled: !!id,
  });
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        <a className="active" href="#business-profile">
          Business Profile
        </a>
        <Link to="/team">Team Members</Link>
        <a href="#bot-integrations">Bot Integration</a>
        <Link to="/notifications">Notifications</Link>
        {[
          "Invoice Settings",
          "Payment Methods",
          "Tax Settings",
          "Security",
          "Subscription",
        ].map((label) => (
          <button
            key={label}
            onClick={() => notify(`${label} is scheduled for a later phase.`)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="page-stack settings-panels">
        <section id="business-profile">
          {query.isPending ? (
            <LoadingSkeleton />
          ) : query.error ? (
            <ErrorState
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <BusinessProfileForm
              key={id}
              businessId={id}
              profile={query.data}
            />
          )}
        </section>
        <Card className="profile-card" id="bot-integrations">
          <div>
            <h2>FinBot Conversational Integrations</h2>
            <p className="muted">
              Automate accounting queries and trigger reports directly from
              messaging apps.
            </p>
          </div>
          <div className="integration-grid">
            {[
              { title: "WhatsApp Business", icon: whatsapp },
              { title: "Telegram Bot", icon: telegram },
            ].map((bot) => (
              <Card className="integration-card" key={bot.title}>
                <div className="row-between">
                  <h3>
                    <img src={bot.icon} alt="" />
                    {bot.title}
                  </h3>
                  <Badge>Not Connected</Badge>
                </div>
                <div>
                  <p className="muted">No account linked</p>
                  <p>Integration is planned.</p>
                </div>
                <div className="profile-footer">
                  <Button
                    size="small"
                    onClick={() =>
                      notify(
                        `${bot.title} connection requires backend integration and is deferred.`,
                      )
                    }
                  >
                    Connect
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
