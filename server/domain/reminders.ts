import { z } from "zod";
export const reminderInput = z
  .object({
    requestId: z.string().uuid(),
    invoiceId: z.string().min(1).max(160),
    template: z.enum(["polite", "firm"]),
    previewHash: z.string().length(64),
  })
  .strict();
export function reminderText(
  v: {
    business: string;
    customer: string;
    invoice: string;
    dueDate: string;
    balanceMinor: number;
  },
  template: "polite" | "firm",
) {
  const amount = (v.balanceMinor / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${v.business}\n${template === "firm" ? "Payment follow-up" : "Payment reminder"}\nHello ${v.customer},\nInvoice ${v.invoice} has an outstanding balance of PKR ${amount}. Due date: ${v.dueDate}.\nPlease contact us to arrange payment or discuss any discrepancy. Thank you.\nSend /stop to stop payment reminders.`;
}
export type DeliveryResult =
  | { status: "Sent"; messageId: string }
  | {
      status: "Retry" | "Failed" | "Unknown";
      code: string;
      retrySeconds?: number;
    };
// Only a documented rejection can be safely retried. A lost response may have delivered.
export async function deliverReminder(
  token: string,
  chatId: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  try {
    const response = await fetcher(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, protect_content: true }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const body = (await response.json()) as {
      ok?: boolean;
      error_code?: number;
      parameters?: { retry_after?: number };
      result?: { message_id?: number };
    };
    if (
      response.ok &&
      body.ok === true &&
      Number.isSafeInteger(body.result?.message_id)
    )
      return { status: "Sent", messageId: String(body.result!.message_id) };
    if (body.ok === false && body.error_code === 429)
      return {
        status: "Retry",
        code: "RATE_LIMIT",
        retrySeconds: Math.min(
          86400,
          Math.max(1, Number(body.parameters?.retry_after) || 60),
        ),
      };
    if (
      body.ok === false &&
      [400, 401, 403, 404].includes(body.error_code || 0)
    )
      return { status: "Failed", code: `TELEGRAM_${body.error_code}` };
    return { status: "Unknown", code: "DELIVERY_UNCERTAIN" };
  } catch {
    return { status: "Unknown", code: "DELIVERY_UNCERTAIN" };
  }
}
