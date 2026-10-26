import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { Auth } from "../lib/auth.js";
import type { BotConfig } from "../bot/config.js";
import { digest } from "../bot/security/access.js";
import { ApiError } from "../lib/errors.js";
import { id } from "../domain/validation.js";
import { reminderInput } from "../domain/reminders.js";
import { reminderPreview } from "../services/reminders.js";
export async function reminderRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: Auth,
  config: BotConfig,
) {
  type Params = { businessId: string; id?: string };
  const path = "/api/businesses/:businessId/reminders";
  app.get<{ Params: Params }>(path, async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    const recipients = await pool.query(
      "select p.id,p.name,r.state,r.chat_id,r.version from parties p left join reminder_recipients r on r.party_id=p.id and r.business_id=p.business_id where p.business_id=$1 and p.kind='Customer' order by p.name",
      [b],
    );
    const logs = await pool.query(
      "select r.id,r.invoice_id,r.status,r.attempts,r.error_code,r.text,r.created_at,r.updated_at,p.name customer,i.display_id from reminders r join parties p on p.id=r.party_id join invoices i on i.id=r.invoice_id where r.business_id=$1 order by r.created_at desc limit 200",
      [b],
    );
    return {
      configured: config.TELEGRAM_MODE !== "off",
      recipients: recipients.rows,
      logs: logs.rows,
    };
  });
  app.post<{ Params: Params }>(
    path + "/recipients/:id/link",
    async (r, reply) => {
      const b = id.parse(r.params.businessId),
        partyId = id.parse(r.params.id);
      await auth.requireMembership(r, b);
      if (config.TELEGRAM_MODE === "off")
        throw new ApiError(
          503,
          "BOT_DISABLED",
          "Configure Telegram before connecting customers.",
        );
      const party = await pool.query(
        "select 1 from parties where business_id=$1 and id=$2 and kind='Customer'",
        [b, partyId],
      );
      if (!party.rowCount)
        throw new ApiError(404, "CUSTOMER_MISSING", "Customer not found.");
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        `insert into reminder_recipients(party_id,business_id,state,token_hash,expires_at,version) values($1,$2,'Invited',$3,now()+interval '30 minutes',$4)
   on conflict(party_id) do update set state='Invited',token_hash=excluded.token_hash,expires_at=excluded.expires_at,version=excluded.version,chat_id=null,consented_at=null`,
        [partyId, b, digest(token), randomUUID()],
      );
      reply.header("cache-control", "no-store");
      return {
        url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=r_${token}`,
      };
    },
  );
  app.post<{ Params: Params }>(path + "/recipients/:id/approve", async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    const v = z.object({ version: z.string().uuid() }).strict().parse(r.body);
    const result = await pool.query(
      "update reminder_recipients set state='Connected',version=$4 where business_id=$1 and party_id=$2 and version=$3 and state='Pending approval' returning party_id",
      [b, id.parse(r.params.id), v.version, randomUUID()],
    );
    if (!result.rowCount)
      throw new ApiError(
        409,
        "RECIPIENT_CHANGED",
        "Customer connection changed. Refresh and verify again.",
      );
    return { ok: true };
  });
  app.delete<{ Params: Params }>(path + "/recipients/:id", async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    await pool.query(
      "update reminder_recipients set state='Disconnected',version=$3,token_hash=null where business_id=$1 and party_id=$2",
      [b, id.parse(r.params.id), randomUUID()],
    );
    return { ok: true };
  });
  app.post<{ Params: Params }>(path + "/preview", async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    const v = z
      .object({ invoiceId: id, template: z.enum(["polite", "firm"]) })
      .strict()
      .parse(r.body);
    return reminderPreview(pool, b, v.invoiceId, v.template);
  });
  app.post<{ Params: Params }>(path, async (r, reply) => {
    const b = id.parse(r.params.businessId),
      { user } = await auth.requireMembership(r, b),
      v = reminderInput.parse(r.body),
      c = await pool.connect();
    if (config.TELEGRAM_MODE === "off")
      throw new ApiError(503, "BOT_DISABLED", "Telegram is disabled.");
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `reminder:${b}:${v.invoiceId}`,
      ]);
      const previous = await c.query("select * from reminders where id=$1", [
        v.requestId,
      ]);
      if (previous.rows[0]) {
        if (
          previous.rows[0].business_id !== b ||
          previous.rows[0].invoice_id !== v.invoiceId
        )
          throw new ApiError(409, "REQUEST_REUSED", "Request ID already used.");
        await c.query("commit");
        return { id: v.requestId, status: previous.rows[0].status };
      }
      const preview = await reminderPreview(c, b, v.invoiceId, v.template);
      if (preview.previewHash !== v.previewHash)
        throw new ApiError(
          409,
          "PREVIEW_CHANGED",
          "Balance or recipient changed. Preview the reminder again.",
        );
      const recent = await c.query(
        "select 1 from reminders where business_id=$1 and invoice_id=$2 and created_at>now()-interval '24 hours' and status not in ('Failed','Cancelled')",
        [b, v.invoiceId],
      );
      if (recent.rowCount)
        throw new ApiError(
          409,
          "REMINDER_LIMIT",
          "A reminder already exists for this invoice in the last 24 hours. Check delivery history.",
        );
      await c.query(
        "insert into reminders(id,business_id,invoice_id,party_id,user_id,recipient_version,text,balance_minor) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          v.requestId,
          b,
          v.invoiceId,
          preview.partyId,
          user.id,
          preview.recipientVersion,
          preview.text,
          preview.balanceMinor,
        ],
      );
      await c.query("commit");
      return reply.status(201).send({ id: v.requestId, status: "Queued" });
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post<{ Params: Params }>(path + "/:id/cancel", async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    const result = await pool.query(
      "update reminders set status='Cancelled',error_code='USER_CANCELLED',updated_at=now() where business_id=$1 and id=$2 and status in ('Queued','Retry') returning id",
      [b, id.parse(r.params.id)],
    );
    if (!result.rowCount)
      throw new ApiError(
        409,
        "REMINDER_STARTED",
        "This reminder is already being processed or completed.",
      );
    return { ok: true };
  });
}
