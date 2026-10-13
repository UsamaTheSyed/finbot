import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Badge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { ConfirmationDialog } from "../../components/ui/Overlays";
import { botService, type BotLink } from "../../services/botService";
import telegram from "../../assets/phase-three/telegram.svg";

export function TelegramIntegration({ businessId }: { businessId: string }) {
  const status = useQuery({
    queryKey: ["telegram-status", businessId],
    queryFn: () => botService.status(businessId),
    enabled: !!businessId,
    refetchOnWindowFocus: "always",
  });
  const [link, setLink] = useState<BotLink | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(
      () => setLink(null),
      Math.max(0, Date.parse(link.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [link]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      setLink(await botService.link(businessId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await botService.unlink(businessId);
      setLink(null);
      setConfirm(false);
      await status.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="integration-card">
      <div className="row-between">
        <h3>
          <img src={telegram} alt="" />
          Telegram Bot
        </h3>
        <Badge>{status.data?.connected ? "Connected" : "Not Connected"}</Badge>
      </div>
      <div>
        <p>Automate reporting via Telegram channel</p>
        <p className="muted">
          {status.data?.connected
            ? "Your account is linked to this workspace."
            : "No account linked"}
        </p>
        {status.data && !status.data.configured && (
          <p className="muted">Telegram setup is required on the server.</p>
        )}
        {(error || status.error) && (
          <p role="alert">{error || "Could not load Telegram status."}</p>
        )}
        {link && !status.data?.connected && (
          <p>
            <a href={link.url} target="_blank" rel="noreferrer">
              Open Telegram to finish linking
            </a>
            <br />
            <span className="muted">
              One-time private link. Expires in five minutes. Do not share it.
            </span>
          </p>
        )}
      </div>
      <div className="profile-footer">
        {(link || status.error) && (
          <Button size="small" onClick={() => void status.refetch()}>
            Check status
          </Button>
        )}
        {status.data?.connected ? (
          <Button size="small" onClick={() => setConfirm(true)}>
            Disconnect
          </Button>
        ) : (
          <Button
            size="small"
            loading={busy}
            disabled={!status.data?.configured}
            onClick={() => void connect()}
          >
            {link ? "Generate new link" : "Connect"}
          </Button>
        )}
      </div>
      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Telegram"
        description="Remove your Telegram connection and pending bot actions for this workspace? Financial records are kept."
        onConfirm={() => void disconnect()}
        loading={busy}
        confirmLabel="Disconnect"
      />
    </Card>
  );
}
