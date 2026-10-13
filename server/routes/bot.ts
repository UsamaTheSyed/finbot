import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { Auth } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import type { BotConfig } from "../bot/config.js";
import { issueLink, rateLimit } from "../bot/security/access.js";
import { BotEngine } from "../bot/core/engine.js";
import { OpenAIProvider } from "../bot/ai/openai.js";
import { TelegramAPI, dispatchTelegram } from "../bot/channels/telegram.js";

function sameOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (
    request.headers["x-finbot-link"] !== "1" ||
    request.headers["sec-fetch-site"] === "cross-site" ||
    (origin && new URL(origin).host !== request.headers.host)
  )
    throw new ApiError(
      403,
      "ORIGIN_REJECTED",
      "Use FinBot Settings to manage this connection.",
    );
}
export async function botRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: Auth,
  config: BotConfig,
) {
  const path = "/api/businesses/:businessId/bot/telegram";
  const business = (request: FastifyRequest) =>
    z.object({ businessId: z.string().min(1).max(160) }).parse(request.params)
      .businessId;
  app.get(path, async (request, reply) => {
    const businessId = business(request),
      { user } = await auth.requireMembership(request, businessId);
    reply.header("cache-control", "no-store");
    const rows = await pool.query(
      "select created_at from bot_identities where user_id=$1 and business_id=$2 and channel='telegram'",
      [user.id, businessId],
    );
    return {
      connected: !!rows.rowCount,
      configured: config.TELEGRAM_MODE !== "off",
      username: config.TELEGRAM_BOT_USERNAME ?? null,
    };
  });
  app.post(path + "/link", async (request, reply) => {
    sameOrigin(request);
    const businessId = business(request),
      { user } = await auth.requireMembership(request, businessId);
    if (config.TELEGRAM_MODE === "off")
      throw new ApiError(
        503,
        "BOT_DISABLED",
        "Telegram is not configured on this server.",
      );
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [`web-link:${user.id}:${businessId}`],
      );
      if (!(await rateLimit(client, `issue-link:${user.id}`, 5, 300))) {
        await client.query("commit");
        throw new ApiError(429, "LINK_LIMIT", "Try again in five minutes.");
      }
      const token = await issueLink(client, user.id, businessId);
      await client.query("commit");
      reply.header("cache-control", "no-store");
      return {
        token,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${token}`,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
  app.delete(path, async (request, reply) => {
    sameOrigin(request);
    const businessId = business(request),
      { user } = await auth.requireMembership(request, businessId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "delete from bot_link_tokens where user_id=$1 and business_id=$2",
        [user.id, businessId],
      );
      await client.query(
        "delete from bot_identities where user_id=$1 and business_id=$2 and channel='telegram'",
        [user.id, businessId],
      );
      await client.query(
        "insert into bot_audit (business_id,user_id,channel,message_id,intent,result) values ($1,$2,'telegram',$3,'UNLINK','WEB_DISCONNECTED')",
        [businessId, user.id, request.id],
      );
      await client.query("commit");
      return reply.status(204).send();
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
  if (config.TELEGRAM_MODE === "webhook") {
    const engine = new BotEngine(
      pool,
      new OpenAIProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL),
      config.BOT_ACTION_TTL_MINUTES,
    );
    const transport = new TelegramAPI(config.TELEGRAM_BOT_TOKEN!);
    app.post(
      "/api/bot/telegram/webhook",
      { bodyLimit: 32768, logLevel: "silent" },
      async (request, reply) => {
        const supplied = request.headers["x-telegram-bot-api-secret-token"];
        const expected = Buffer.from(config.TELEGRAM_WEBHOOK_SECRET!);
        if (
          typeof supplied !== "string" ||
          Buffer.byteLength(supplied) !== expected.length ||
          !timingSafeEqual(Buffer.from(supplied), expected)
        )
          return reply.status(403).send({ code: "WEBHOOK_UNAUTHORIZED" });
        try {
          await dispatchTelegram(request.body, engine, transport);
          return { ok: true };
        } catch {
          return reply.status(503).send({ code: "BOT_RETRY" });
        }
      },
    );
  }
}
