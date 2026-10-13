import { z } from "zod";
const schema = z.object({
  TELEGRAM_MODE: z.enum(["off", "polling", "webhook"]).default("off"),
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .optional(),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,256}$/)
    .optional(),
  OPENAI_API_KEY: z.string().min(10).optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini-2025-04-14"),
  BOT_ACTION_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
});
export type BotConfig = z.infer<typeof schema>;
export function botConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = schema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")),
  );
  if (!parsed.success)
    throw new Error(
      "Invalid bot configuration (check .env.example; values redacted).",
    );
  const c = parsed.data;
  if (
    c.TELEGRAM_MODE !== "off" &&
    (!c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_BOT_USERNAME)
  )
    throw new Error("Telegram token and username required when enabled.");
  if (c.TELEGRAM_MODE === "webhook" && !c.TELEGRAM_WEBHOOK_SECRET)
    throw new Error("Webhook secret required.");
  return c;
}
