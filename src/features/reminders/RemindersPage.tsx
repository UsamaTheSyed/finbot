import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  reminderService,
  type ReminderPreview,
} from "../../services/reminderService";
import { useInvoices } from "../finance/queries";
import { useWorkspace } from "../../hooks/useWorkspace";
import { PageHeader } from "../../components/common/Page";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Fields";
import { Modal, ConfirmationDialog } from "../../components/ui/Overlays";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
export function RemindersPage() {
  const b = useWorkspace();
  return <ReminderWorkspace key={b} business={b} />;
}
function ReminderWorkspace({ business: b }: { business: string }) {
  const client = useQueryClient(),
    [search] = useSearchParams(),
    invoices = useInvoices();
  const q = useQuery({
    queryKey: ["reminders", b],
    queryFn: () => reminderService.list(b),
    refetchInterval: 5000,
  });
  const [invoice, setInvoice] = useState(search.get("invoice") || ""),
    [template, setTemplate] = useState("polite"),
    [link, setLink] = useState(""),
    [review, setReview] = useState<
      | (ReminderPreview & {
          requestId: string;
          invoiceId: string;
          template: string;
        })
      | null
    >(null),
    [confirm, setConfirm] = useState<{
      title: string;
      description: string;
      run: () => Promise<unknown>;
    } | null>(null),
    [notice, setNotice] = useState("");
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reminders", b] });
      await client.invalidateQueries({ queryKey: ["notifications", b] });
      setConfirm(null);
    },
  });
  return (
    <div className="page-stack finance-page">
      <PageHeader
        title="Payment Reminders"
        subtitle="Customer Telegram messages, delivery history and workspace notifications"
      />
      <QueryState queries={[q, invoices]} />
      {notice && <p role="status">{notice}</p>}
      {m.error && <p role="alert">{m.error.message}</p>}
      {q.data && (
        <>
          <Card className="invoice-form-card">
            <div className="section-heading">
              <h2>Customer connections</h2>
            </div>
            <p>
              Share a private invitation link with the intended customer. After
              they press Start, verify their chat ID with them before approving.
              Customers can send /stop to unsubscribe.
            </p>
            {!q.data.configured && (
              <p role="alert">Telegram is not configured on this server.</p>
            )}
            <Table
              aria-label="Customer Telegram connections"
              className="finance-table"
            >
              <TableHeader>
                <TableRow>
                  {["Customer", "Connection", "Chat ID", "Actions"].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                {q.data.recipients.map((r) => (
                  <TableRow key={r.id}>
                    <td>
                      <Link to={`/parties/${r.id}`}>{r.name}</Link>
                    </td>
                    <td>{r.state || "Disconnected"}</td>
                    <td>{r.chat_id || "—"}</td>
                    <td>
                      <Button
                        disabled={!q.data!.configured || m.isPending}
                        onClick={() =>
                          setConfirm({
                            title: "Create Customer Invitation",
                            description: `Create a new private link for ${r.name}? This replaces any previous connection or invitation.`,
                            run: async () => {
                              const v = await reminderService.link(b, r.id);
                              setLink(v.url);
                            },
                          })
                        }
                      >
                        Create Link
                      </Button>
                      {r.state === "Pending approval" && (
                        <Button
                          disabled={m.isPending}
                          onClick={() =>
                            setConfirm({
                              title: "Verify Customer Connection",
                              description: `Confirm you verified chat ID ${r.chat_id} directly with ${r.name}. Approving allows financial reminders to this chat.`,
                              run: () =>
                                reminderService.approve(b, r.id, r.version!),
                            })
                          }
                        >
                          Approve
                        </Button>
                      )}
                      {r.state && r.state !== "Disconnected" && (
                        <Button
                          disabled={m.isPending}
                          onClick={() =>
                            setConfirm({
                              title: "Disconnect Customer",
                              description: `Stop reminders to ${r.name}?`,
                              run: () => reminderService.disconnect(b, r.id),
                            })
                          }
                        >
                          Disconnect
                        </Button>
                      )}
                    </td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card className="invoice-form-card">
            <div className="section-heading">
              <h2>Send payment reminder</h2>
            </div>
            <div className="page-stack">
              <Select
                label="Customer invoice"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
              >
                <option value="">Choose an outstanding invoice</option>
                {invoices.data
                  ?.filter(
                    (i) =>
                      i.status !== "Draft" &&
                      i.balanceMinor > 0 &&
                      q.data!.recipients.some((r) => r.id === i.partyId),
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.displayId || i.id} ·{" "}
                      {q.data!.recipients.find((r) => r.id === i.partyId)?.name}{" "}
                      · PKR {i.balanceMinor / 100}
                    </option>
                  ))}
              </Select>
              <Select
                label="Message template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="polite">Polite reminder</option>
                <option value="firm">Payment follow-up</option>
              </Select>
              <Button
                disabled={!invoice || !q.data.configured || m.isPending}
                onClick={() =>
                  m.mutate(async () => {
                    const p = await reminderService.preview(
                      b,
                      invoice,
                      template,
                    );
                    setReview({
                      ...p,
                      invoiceId: invoice,
                      template,
                      requestId: crypto.randomUUID(),
                    });
                  })
                }
              >
                Preview Reminder
              </Button>
              <p>
                One reminder per invoice per 24 hours. Queued messages are
                processed by the reminder worker. “Sent” means Telegram accepted
                the message, not that the customer read it.
              </p>
            </div>
          </Card>
          <Card className="table-card">
            <div className="section-heading">
              <h2>Delivery history</h2>
            </div>
            <Table
              aria-label="Reminder delivery history"
              className="finance-table"
            >
              <TableHeader>
                <TableRow>
                  {[
                    "Customer / Invoice",
                    "Status",
                    "Attempts",
                    "Message / Outcome",
                    "Action",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                {q.data.logs.map((l) => (
                  <TableRow key={l.id}>
                    <td>
                      {l.customer}
                      <br />
                      <Link to={`/invoices/${l.invoice_id}`}>
                        {l.display_id}
                      </Link>
                      <br />
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td>{l.status}</td>
                    <td>{l.attempts}</td>
                    <td>
                      <details>
                        <summary>Message details</summary>
                        <p className="reminder-message">{l.text}</p>
                        {l.error_code && <p>{l.error_code}</p>}
                      </details>
                      {l.status === "Unknown" && (
                        <p>
                          Delivery uncertain. Verify with the customer before
                          sending another reminder.
                        </p>
                      )}
                    </td>
                    <td>
                      {["Queued", "Retry"].includes(l.status) && (
                        <Button
                          disabled={m.isPending}
                          onClick={() =>
                            setConfirm({
                              title: "Cancel Reminder",
                              description: "Cancel this queued reminder?",
                              run: () => reminderService.cancel(b, l.id),
                            })
                          }
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
            {!q.data.logs.length && <p>No reminders sent yet.</p>}
          </Card>
        </>
      )}
      <Modal
        open={!!link}
        onOpenChange={(v) => {
          if (!v) setLink("");
        }}
        title="Customer Invitation"
      >
        <p>
          Share privately with the intended customer. Expires in 30 minutes. Do
          not post this link publicly.
        </p>
        <Input label="Invitation link" readOnly value={link} />
      </Modal>
      <Modal
        open={!!review}
        onOpenChange={(v) => {
          if (!v && !m.isPending) setReview(null);
        }}
        title="Confirm Payment Reminder"
      >
        <p className="reminder-message">{review?.text}</p>
        {m.error && <p role="alert">{m.error.message}</p>}
        <Button
          variant="primary"
          disabled={m.isPending}
          onClick={() =>
            m.mutate(async () => {
              if (!review) return;
              await reminderService.queue(b, {
                requestId: review.requestId,
                invoiceId: review.invoiceId,
                template: review.template,
                previewHash: review.previewHash,
              });
              setReview(null);
              setNotice("Reminder queued. Delivery status will appear below.");
            })
          }
        >
          Queue Reminder
        </Button>
      </Modal>
      <ConfirmationDialog
        open={!!confirm}
        title={confirm?.title || "Confirm"}
        description={confirm?.description || ""}
        onOpenChange={(v) => {
          if (!v && !m.isPending) setConfirm(null);
        }}
        confirmLabel="Confirm"
        loading={m.isPending}
        onConfirm={() => {
          if (confirm) m.mutate(confirm.run);
        }}
      />
    </div>
  );
}
