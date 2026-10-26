import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { invoiceDto, type Queryable } from "./ledger.js";
import { ApiError } from "../lib/errors.js";
import { reminderText, deliverReminder } from "../domain/reminders.js";
export async function reminderPreview(
  db: Queryable,
  b: string,
  invoiceId: string,
  template: "polite" | "firm",
) {
  const invoice = await invoiceDto(db, b, invoiceId);
  const result = await db.query(
    "select p.name,p.kind,b.name business,r.state,r.version from parties p join businesses b on b.id=p.business_id left join reminder_recipients r on r.party_id=p.id and r.business_id=p.business_id where p.business_id=$1 and p.id=$2",
    [b, invoice.partyId],
  );
  const p = result.rows[0];
  if (
    !p ||
    p.kind !== "Customer" ||
    invoice.status === "Draft" ||
    invoice.balanceMinor <= 0
  )
    throw new ApiError(
      409,
      "REMINDER_NOT_DUE",
      "Only issued customer invoices with an outstanding balance can be reminded.",
    );
  if (p.state !== "Connected")
    throw new ApiError(
      409,
      "CUSTOMER_NOT_LINKED",
      "Connect and verify the customer's Telegram account in Reminders first.",
    );
  const text = reminderText(
    {
      business: p.business,
      customer: p.name,
      invoice: invoice.displayId,
      dueDate: invoice.dueDate,
      balanceMinor: invoice.balanceMinor,
    },
    template,
  );
  const previewHash = createHash("sha256")
    .update(JSON.stringify([text, p.version, invoice.revision]))
    .digest("hex");
  return {
    text,
    previewHash,
    partyId: invoice.partyId,
    recipientVersion: String(p.version),
    balanceMinor: invoice.balanceMinor,
  };
}
async function recordOutcome(
  pool: Pool,
  id: string,
  status: string,
  code: string | null,
  messageId: string | null = null,
  retrySeconds = 0,
) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const { rows } = await c.query(
      "update reminders set status=$2,error_code=$3,message_id=$4,updated_at=now(),next_attempt=now()+($5 * interval '1 second') where id=$1 and ($3<>'WORKER_INTERRUPTED' or status='Sending' or $3 is null) returning *",
      [id, status, code, messageId, retrySeconds],
    );
    const r = rows[0];
    if (r && status !== "Retry") {
      const names = await c.query(
        "select p.name customer,i.display_id from parties p join invoices i on i.party_id=p.id where i.id=$1 and i.business_id=$2",
        [r.invoice_id, r.business_id],
      );
      const label = names.rows[0];
      await c.query(
        `insert into notifications(id,business_id,title,description,href,event_date) values($1,$2,$3,$4,$5,current_date) on conflict(id) do nothing`,
        [
          `reminder:${id}`,
          r.business_id,
          `Payment reminder: ${status}`,
          `${label?.customer || "Customer"} · ${label?.display_id || "Invoice"}: reminder ${status.toLowerCase()}${code ? ` (${code})` : ""}.`,
          "/reminders",
        ],
      );
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
export async function processReminder(
  pool: Pool,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  // One worker claims durably before the external call. Crashes after claim are UNKNOWN, never resent blindly.
  const stale = await pool.query(
    "select id from reminders where status='Sending' and updated_at<now()-interval '2 minutes'",
  );
  for (const r of stale.rows)
    await recordOutcome(pool, r.id, "Unknown", "WORKER_INTERRUPTED");
  const c = await pool.connect();
  let job: Record<string, unknown> | undefined;
  let chat: string;
  try {
    await c.query("begin");
    const { rows } = await c.query(
      "select * from reminders where status in ('Queued','Retry') and next_attempt<=now() order by created_at limit 1 for update skip locked",
    );
    job = rows[0];
    if (!job) {
      await c.query("rollback");
      return false;
    }
    const r = job;
    const recipient = (
      await c.query(
        "select * from reminder_recipients where party_id=$1 and business_id=$2 for share",
        [r.party_id, r.business_id],
      )
    ).rows[0];
    const member = await c.query(
      "select 1 from workspace_memberships where business_id=$1 and user_id=$2 and status='Active'",
      [r.business_id, r.user_id],
    );
    const invoice = await invoiceDto(
      c,
      String(r.business_id),
      String(r.invoice_id),
    );
    if (
      !member.rowCount ||
      !recipient ||
      recipient.state !== "Connected" ||
      recipient.version !== r.recipient_version ||
      invoice.status === "Draft" ||
      invoice.balanceMinor !== Number(r.balance_minor)
    ) {
      await c.query(
        "update reminders set status='Cancelled',error_code='ACCOUNT_CHANGED',updated_at=now() where id=$1",
        [r.id],
      );
      await c.query("commit");
      await recordOutcome(pool, String(r.id), "Cancelled", "ACCOUNT_CHANGED");
      return true;
    }
    chat = recipient.chat_id;
    await c.query(
      "update reminders set status='Sending',attempts=attempts+1,updated_at=now() where id=$1",
      [r.id],
    );
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
  const result = await deliverReminder(token, chat, String(job.text), fetcher);
  const status =
    result.status === "Retry" && Number(job.attempts) >= 3
      ? "Failed"
      : result.status;
  await recordOutcome(
    pool,
    String(job.id),
    status,
    result.status === "Sent" ? null : result.code,
    result.status === "Sent" ? result.messageId : null,
    result.status === "Retry" ? result.retrySeconds : 0,
  );
  return true;
}
