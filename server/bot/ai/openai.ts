import { z } from "zod";
import { extraction, intents, methods, type AIProvider } from "../types.js";
import { systemPrompt } from "./prompt.js";

const fields = [
  "partyName",
  "amountText",
  "dateText",
  "invoiceReference",
  "description",
  "unit",
  "rateText",
  "taxText",
  "discountText",
  "dueDateText",
  "initialPaidText",
];
const properties = {
  intent: { type: "string", enum: intents },
  confidence: { type: "number" },
  ...Object.fromEntries(
    fields.map((name) => [name, { type: ["string", "null"] }]),
  ),
  method: { type: ["string", "null"], enum: [...methods, null] },
  direction: { type: ["string", "null"], enum: ["Received", "Sent", null] },
  quantity: { type: ["number", "null"] },
};
const envelope = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});
export class OpenAIProvider implements AIProvider {
  constructor(
    private key: string | undefined,
    private model = "gpt-4.1-mini-2025-04-14",
    private transport: typeof fetch = fetch,
  ) {}
  async interpret(
    text: string,
    context: { today: string; intent?: string; awaiting?: string },
  ) {
    if (!this.key) throw new Error("AI_UNAVAILABLE");
    try {
      const response = await this.transport(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${this.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            store: false,
            max_completion_tokens: 1000,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  context,
                  message: text.slice(0, 2000),
                }),
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "finbot_intent",
                strict: true,
                schema: {
                  type: "object",
                  properties,
                  required: Object.keys(properties),
                  additionalProperties: false,
                },
              },
            },
          }),
        },
      );
      if (!response.ok) throw new Error("AI_UNAVAILABLE");
      const body = envelope.parse(await response.json()).choices[0];
      if (
        body.finish_reason !== "stop" ||
        body.message.refusal ||
        !body.message.content
      )
        throw new Error("AI_UNAVAILABLE");
      return extraction.parse(JSON.parse(body.message.content));
    } catch {
      throw new Error("AI_UNAVAILABLE");
    }
  }
}
