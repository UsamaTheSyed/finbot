import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { botConfig } from "./bot/config.js";
import { processReminder } from "./services/reminders.js";
const config = loadConfig(),
  bot = botConfig();
if (bot.TELEGRAM_MODE === "off" || !bot.TELEGRAM_BOT_TOKEN)
  throw new Error("Configure Telegram before starting the reminder worker.");
const { pool } = createDatabase(config);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log(
  "Reminder worker ready. Queued customer reminders will be delivered.",
);
try {
  while (!stopping) {
    try {
      if (await processReminder(pool, bot.TELEGRAM_BOT_TOKEN)) continue;
    } catch {
      console.error(
        "Reminder worker database operation failed; delivery status will be reconciled.",
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally {
  await pool.end();
}
