import { z } from "zod";
import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { botConfig } from "./config.js";
import { OpenAIProvider } from "./ai/openai.js";
import { BotEngine } from "./core/engine.js";
import { TelegramAPI, dispatchTelegram } from "./channels/telegram.js";
import { digest } from "./security/access.js";

const config = loadConfig(),
  bot = botConfig();
if (bot.TELEGRAM_MODE !== "polling")
  throw new Error("Set TELEGRAM_MODE=polling for the development runner.");
const { pool } = createDatabase(config),
  client = await pool.connect();
const lock = digest(bot.TELEGRAM_BOT_TOKEN!);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  const owned = await client.query(
    "select pg_try_advisory_lock(hashtextextended($1,0)) as owned",
    [lock],
  );
  if (!owned.rows[0].owned)
    throw new Error("A Telegram poller is already running.");
  const api = new TelegramAPI(bot.TELEGRAM_BOT_TOKEN!);
  const info = z
    .object({ url: z.string() })
    .parse(await api.call("getWebhookInfo", {}));
  if (info.url)
    throw new Error(
      "An active Telegram webhook exists. Disable it deliberately before polling.",
    );
  const engine = new BotEngine(
    pool,
    new OpenAIProvider(bot.OPENAI_API_KEY, bot.OPENAI_MODEL),
    bot.BOT_ACTION_TTL_MINUTES,
  );
  const key = `telegram-offset:${lock}`;
  const stored = await client.query(
    "select value from bot_runtime where key=$1",
    [key],
  );
  let offset = Number(stored.rows[0]?.value ?? 0);
  console.info("Telegram polling ready (private chats only).");
  while (!stopping) {
    try {
      const updates = z
        .array(
          z.object({ update_id: z.number().int().nonnegative() }).passthrough(),
        )
        .parse(
          await api.call("getUpdates", {
            offset,
            timeout: 25,
            allowed_updates: ["message", "callback_query"],
          }),
        );
      for (const update of updates) {
        await dispatchTelegram(update, engine, api);
        offset = update.update_id + 1;
        await client.query(
          "insert into bot_runtime (key,value) values ($1,$2) on conflict(key) do update set value=excluded.value",
          [key, String(offset)],
        );
      }
    } catch {
      console.error(
        "Telegram polling retry: transport/backend unavailable (details redacted).",
      );
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
} finally {
  await client
    .query("select pg_advisory_unlock(hashtextextended($1,0))", [lock])
    .catch(() => {});
  client.release();
  await pool.end();
}
