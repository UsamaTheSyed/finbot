import { z } from "zod";
import type { InboundMessage, OutgoingMessage } from "../types.js";
const user = z.object({
  id: z.number().int().positive(),
  is_bot: z.boolean().optional(),
});
const message = z.object({
  message_id: z.number().int(),
  date: z.number(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: user.optional(),
  text: z.string().optional(),
});
const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: message.optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: user,
      data: z.string().max(64).optional(),
      message: message.optional(),
    })
    .optional(),
});
export function normalizeTelegram(
  raw: unknown,
): { message: InboundMessage; callbackId?: string } | null {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const u = parsed.data,
    c = u.callback_query,
    m = c?.message ?? u.message,
    from = c?.from ?? m?.from;
  if (
    !m ||
    !from ||
    from.is_bot ||
    m.chat.type !== "private" ||
    m.chat.id !== from.id
  )
    return null;
  if (!c && !m.text) return null;
  if (c && !c.data) return null;
  return {
    message: {
      channel: "telegram",
      externalUserId: String(from.id),
      externalChatId: String(m.chat.id),
      messageId: String(u.update_id),
      text: c ? "" : m.text!,
      timestamp: m.date * 1000,
      callback: c?.data,
    },
    callbackId: c?.id,
  };
}
export interface TelegramTransport {
  send(chat: string, message: OutgoingMessage): Promise<void>;
  acknowledge(id: string): Promise<void>;
}
export class TelegramAPI implements TelegramTransport {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async call(
    method:
      "sendMessage" | "answerCallbackQuery" | "getUpdates" | "getWebhookInfo",
    body: unknown,
  ): Promise<unknown> {
    try {
      const r = await this.fetcher(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(35000),
        },
      );
      const envelope = z
        .object({ ok: z.boolean(), result: z.unknown() })
        .parse(await r.json());
      if (!r.ok || !envelope.ok) throw new Error();
      return envelope.result;
    } catch {
      throw new Error("TELEGRAM_TRANSPORT_UNAVAILABLE");
    }
  }
  async send(chat: string, m: OutgoingMessage) {
    const text =
      m.text.length <= 3900
        ? m.text
        : m.text.slice(0, 3800) + "\nFull details FinBot web app mein dekhein.";
    await this.call("sendMessage", {
      chat_id: chat,
      text,
      protect_content: true,
      reply_markup: m.buttons
        ? {
            inline_keyboard: m.buttons.map((b) => [
              { text: b.text.slice(0, 80), callback_data: b.data },
            ]),
          }
        : undefined,
    });
  }
  async acknowledge(id: string) {
    await this.call("answerCallbackQuery", { callback_query_id: id });
  }
}
export async function dispatchTelegram(
  raw: unknown,
  engine: { handle(m: InboundMessage): Promise<OutgoingMessage> },
  transport: TelegramTransport,
) {
  const normalized = normalizeTelegram(raw);
  if (!normalized) return;
  if (normalized.callbackId)
    await transport.acknowledge(normalized.callbackId).catch(() => {});
  const response = await engine.handle(normalized.message);
  await transport.send(normalized.message.externalChatId, response);
}
