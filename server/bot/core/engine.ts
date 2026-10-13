import {
  refersToPreviousParty,
  looksLikeRequest,
  requestCorrection,
} from "./recovery.js";
import type { Pool, PoolClient } from "pg";
import { ZodError } from "zod";
import { ApiError } from "../../lib/errors.js";
import {
  blankExtraction,
  conversation,
  extraction,
  type AIProvider,
  type Conversation,
  type Identity,
  type InboundMessage,
  type OutgoingMessage,
} from "../types.js";
import {
  consumeLink,
  digest,
  rateLimit,
  resolveIdentity,
} from "../security/access.js";
import { localDate } from "./normalize.js";
import { advance, help } from "./flow.js";
import { action } from "./actions.js";
import { logBotFailure } from "../security/diagnostics.js";

export class BotEngine {
  constructor(
    private pool: Pool,
    private ai: AIProvider,
    private expiryMinutes = 15,
    private clock = () => new Date(),
  ) {}
  async handle(m: InboundMessage): Promise<OutgoingMessage> {
    if (m.text.length > 2000)
      return { text: "Message 2000 characters tak rakhein." };
    const client = await this.pool.connect();
    const receipt = digest(
      `${m.channel}:${m.externalUserId}:${m.externalChatId}:${m.messageId}`,
    );
    let identity: Identity | undefined,
      state: Conversation = { extraction: blankExtraction() };
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${m.channel}:${m.externalUserId}:${m.externalChatId}`],
      );
      const seen = await client.query(
        "select 1 from bot_receipts where key=$1",
        [receipt],
      );
      if (seen.rowCount) {
        await client.query("commit");
        return {
          text: "Update already processed. No duplicate financial change.",
        };
      }
      const allowed = await rateLimit(
        client,
        `message:${m.channel}:${m.externalUserId}`,
        30,
      );
      let out: OutgoingMessage;
      if (!allowed)
        out = { text: "Message limit reached. Ek minute baad try karein." };
      else {
        // Rate counters survive safe failures. Domain work is isolated in savepoints.
        const link = /^\/(?:link|start)\s+(\S+)\s*$/.exec(m.text);
        const linkAllowed =
          !link ||
          (await rateLimit(client, `link:${m.externalUserId}`, 5, 300));
        await client.query("savepoint request_work");
        try {
          if (!linkAllowed)
            out = {
              text: "Link attempt limit reached. 5 minutes baad try karein.",
            };
          else if (link) {
            await consumeLink(client, m, link[1]);
            identity = await resolveIdentity(client, m);
            out = { text: "Telegram linked. " + help };
          } else if (m.text.trim() === "/unlink") {
            const linked = await client.query(
              "select id,user_id,business_id from bot_identities where channel=$1 and external_user_id=$2 and external_chat_id=$3 for update",
              [m.channel, m.externalUserId, m.externalChatId],
            );
            if (linked.rows[0])
              identity = { ...linked.rows[0], timezone: "UTC" };
            await client.query(
              "delete from bot_identities where channel=$1 and external_user_id=$2 and external_chat_id=$3",
              [m.channel, m.externalUserId, m.externalChatId],
            );
            out = {
              text: "Telegram unlinked. FinBot account aur financial records unchanged.",
            };
          } else {
            identity = await resolveIdentity(client, m);
            if (!identity)
              out = {
                text: "FinBot Settings → Telegram → Connect se one-time link lein. Phir yahan /link TOKEN bhejein. Financial access abhi available nahi.",
              };
            else {
              const saved = await client.query(
                "select state from bot_conversations where identity_id=$1 and expires_at>now()",
                [identity.id],
              );
              state = conversation.parse(saved.rows[0]?.state ?? state);
              out = await this.respond(client, identity, state, m);
              await client.query(
                "insert into bot_conversations (identity_id,state,expires_at) values ($1,$2,now()+interval '30 minutes') on conflict(identity_id) do update set state=excluded.state,expires_at=excluded.expires_at",
                [identity.id, state],
              );
            }
          }
        } catch (error) {
          if (!(error instanceof ApiError) && !(error instanceof ZodError))
            logBotFailure(error, "request");
          await client.query("rollback to savepoint request_work");
          out = {
            text:
              error instanceof ApiError && error.status < 500
                ? error.message +
                  (error.code === "OVERPAYMENT"
                    ? " /cancel karke outstanding amount se nayi request banayein. On-account payment sirf agar intended ho; woh invoice settle nahi karegi."
                    : "")
                : error instanceof ZodError
                  ? "Values invalid hain. Dates YYYY-MM-DD, positive amounts aur supported fields dein. /cancel se restart kar sakte hain."
                  : error instanceof Error && error.message === "AI_UNAVAILABLE"
                    ? "AI abhi unavailable hai. Koi financial change nahi hua. Baad mein try karein; existing Confirm/Cancel buttons available hain."
                    : "Request complete nahi hui. Koi financial change nahi hua. Values/date check karein, ya /cancel se dobara shuru karein.",
          };
          await this.audit(
            client,
            m,
            identity,
            state,
            error instanceof ApiError
              ? error.code
              : error instanceof ZodError
                ? "VALIDATION_ERROR"
                : "REQUEST_FAILED",
          );
        }
      }
      await this.audit(
        client,
        m,
        identity,
        state,
        allowed ? "REPLIED" : "RATE_LIMITED",
      );
      // Receipt stores no message/token/financial response. Pending actions hold the authoritative result.
      await client.query(
        "insert into bot_receipts (key,response) values ($1,'{}')",
        [receipt],
      );
      await client.query("commit");
      return out;
    } catch (error) {
      logBotFailure(error, "database");
      await client.query("rollback").catch(() => {});
      // Caller retries the update; never acknowledge a database-level failure.
      // eslint-disable-next-line preserve-caught-error -- Raw driver causes can contain private parameters; only the sanitized diagnostic above may escape.
      throw new Error("BOT_BACKEND_UNAVAILABLE");
    } finally {
      client.release();
    }
  }
  private async audit(
    client: PoolClient,
    m: InboundMessage,
    i: Identity | undefined,
    s: Conversation,
    result: string,
  ) {
    await client.query(
      "insert into bot_audit (business_id,user_id,channel,message_id,intent,action_id,result) values ($1,$2,$3,$4,$5,$6,$7)",
      [
        i?.business_id ?? null,
        i?.user_id ?? null,
        m.channel,
        m.messageId,
        s.extraction.intent,
        s.pendingId ?? null,
        result,
      ],
    );
  }
  private async respond(
    client: PoolClient,
    i: Identity,
    s: Conversation,
    m: InboundMessage,
  ): Promise<OutgoingMessage> {
    const text = m.text.trim();
    if (["/start", "/help", "/link"].includes(text)) return { text: help };
    const callback =
      m.callback ??
      (s.pendingId && /^(confirm|cancel|edit)$/i.test(text)
        ? `${text.toLowerCase()}:${s.pendingId}`
        : "");
    if (callback) {
      const [verb, id] = callback.split(":");
      if (verb === "choose") {
        const choice = s.choices?.find((c) => c.key === id);
        if (!choice)
          return { text: "Selection expired. Request dobara shuru karein." };
        if (choice.field === "partyId" && choice.value === "__other_party__") {
          delete s.contextPartyId;
          delete s.partyId;
          delete s.invoiceId;
          delete s.usePartyContext;
          s.extraction.partyName = null;
          return requestCorrection(s, "partyName", "Party ka naam dein.");
        }
        if (choice.field === "direction") s.directionConfirmed = true;
        if (choice.field === "partyId" || choice.field === "invoiceId")
          s[choice.field] = choice.value;
        else if (choice.field === "method")
          s.extraction.method = extraction.shape.method.parse(choice.value);
        else
          s.extraction.direction = extraction.shape.direction.parse(
            choice.value,
          );
        delete s.awaiting;
        delete s.choices;
        return advance(client, i, s, this.clock(), this.expiryMinutes);
      }
      const wasCurrent = s.pendingId === id;
      const result = await action(client, i, s, verb, id);
      const validId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
      const actionRecord = validId
        ? (
            await client.query(
              "select status,result from bot_actions where id=$1 and identity_id=$2",
              [id, i.id],
            )
          ).rows[0]
        : undefined;
      const status = actionRecord?.status;
      await this.audit(
        client,
        m,
        i,
        { ...s, pendingId: validId ? id : undefined },
        `ACTION_${verb.slice(0, 10).toUpperCase()}:${status ?? "REJECTED"}:${actionRecord?.result?.id ?? actionRecord?.result?.code ?? ""}`,
      );
      if (verb !== "edit" && wasCurrent && status !== "pending") {
        s.extraction = blankExtraction();
        delete s.partyId;
        delete s.invoiceId;
        delete s.pendingId;
        delete s.editing;
        delete s.awaiting;
        delete s.choices;
      }
      return result;
    }
    if (["/cancel", "cancel"].includes(text.toLowerCase())) {
      await client.query(
        "update bot_actions set status='cancelled' where identity_id=$1 and status='pending'",
        [i.id],
      );
      Object.assign(s, {
        extraction: blankExtraction(),
        partyId: undefined,
        invoiceId: undefined,
        pendingId: undefined,
        awaiting: undefined,
        choices: undefined,
        editing: undefined,
        contextPartyId: undefined,
        usePartyContext: undefined,
        directionConfirmed: undefined,
      });
      return { text: "Cancelled. No financial change." };
    }
    if (s.pendingId)
      return {
        text: "Pending proposal ke Confirm, Edit ya Cancel button use karein.",
      };
    const newRequest =
      (s.awaiting === "partyName" || s.awaiting === "choice") &&
      looksLikeRequest(text) &&
      !s.choices?.some((c) => c.label.toLowerCase() === text.toLowerCase());
    if (
      !newRequest &&
      s.awaiting &&
      s.awaiting !== "choice" &&
      s.awaiting !== "method" &&
      s.awaiting !== "direction"
    ) {
      if (s.awaiting === "quantity") {
        const parsed = extraction.shape.quantity.safeParse(Number(text));
        if (!parsed.success)
          return requestCorrection(
            s,
            "quantity",
            "Positive numeric quantity dein.",
          );
        s.extraction.quantity = parsed.data;
      } else s.extraction[s.awaiting] = text;
      if (s.awaiting === "partyName") {
        delete s.partyId;
        delete s.invoiceId;
      }
    } else {
      if (s.awaiting === "choice" && !newRequest) {
        const selected = s.choices?.filter(
          (c) => c.label.toLowerCase() === text.toLowerCase(),
        );
        if (selected?.length === 1)
          return this.respond(client, i, s, {
            ...m,
            callback: `choose:${selected[0].key}`,
          });
        return {
          text: "Upar diye gaye button se select karein, ya /cancel karein.",
        };
      }
      // Charge attempts before the savepoint, including malformed/provider failures.
      await client.query("release savepoint request_work");
      const aiAllowed =
        (await rateLimit(client, `ai:${i.id}`, 12)) &&
        (await rateLimit(client, "ai-global", 200, 3600));
      await client.query("savepoint request_work");
      if (!aiAllowed)
        return { text: "AI request limit reached. Baad mein try karein." };
      const next = extraction.parse(
        await this.ai.interpret(text, {
          today: localDate(i.timezone, this.clock()),
          intent: s.editing ? s.extraction.intent : undefined,
        }),
      );
      if (next.confidence < 0.85)
        return {
          text: "Request clear nahi hai. Party, amount, method aur date saaf likhein; koi change nahi hua.",
        };
      if (["CONFIRM", "CANCEL", "EDIT_PENDING_ACTION"].includes(next.intent))
        return {
          text: "Exact Confirm/Edit/Cancel button use karein. AI financial action authorize nahi kar sakta.",
        };
      if (s.editing && next.direction !== null) delete s.directionConfirmed;
      if (s.editing) {
        if (next.partyName && next.partyName !== s.extraction.partyName) {
          delete s.partyId;
          delete s.invoiceId;
        }
        if (
          next.invoiceReference !== null &&
          next.invoiceReference !== s.extraction.invoiceReference
        )
          delete s.invoiceId;
        for (const key of Object.keys(next) as (keyof typeof next)[])
          if (next[key] !== null && key !== "intent" && key !== "confidence")
            Object.assign(s.extraction, { [key]: next[key] });
      } else {
        s.usePartyContext =
          refersToPreviousParty(text) && Boolean(s.contextPartyId);
        if (
          next.partyName &&
          /^(isne|usne|isko|usko|iska|uska|he|she|they|him|her|them)$/i.test(
            next.partyName,
          )
        )
          next.partyName = null;
        s.extraction = next;
        delete s.partyId;
        delete s.invoiceId;
        delete s.directionConfirmed;
        delete s.awaiting;
        delete s.choices;
      }
    }
    const result = await advance(
      client,
      i,
      s,
      this.clock(),
      this.expiryMinutes,
    );
    if (s.pendingId) delete s.editing;
    return result;
  }
}
