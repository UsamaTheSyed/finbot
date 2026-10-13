import { z } from "zod";
import { invoiceInput, paymentInput } from "../domain/validation.js";

export const intents = [
  "GREETING",
  "HELP",
  "SEARCH_PARTY",
  "GET_PARTY_BALANCE",
  "GET_PARTY_STATEMENT",
  "SEARCH_INVOICE",
  "GET_INVOICE",
  "GET_OUTSTANDING_INVOICES",
  "RECORD_PAYMENT",
  "RECORD_SALE",
  "RECORD_PURCHASE",
  "GET_DAILY_SUMMARY",
  "GET_RECEIVABLES",
  "GET_PAYABLES",
  "GET_CASH_FLOW",
  "CANCEL",
  "CONFIRM",
  "EDIT_PENDING_ACTION",
  "UNKNOWN",
] as const;
export const methods = paymentInput.shape.method.options;
const field = z.string().trim().min(1).max(200).nullable();
export const extraction = z
  .object({
    intent: z.enum(intents),
    confidence: z.number().min(0).max(1),
    partyName: field,
    amountText: field,
    dateText: field,
    invoiceReference: field,
    method: z.enum(methods).nullable(),
    direction: z.enum(["Received", "Sent"]).nullable(),
    description: field,
    quantity: z.number().positive().max(1_000_000).nullable(),
    unit: field,
    rateText: field,
    taxText: field,
    discountText: field,
    dueDateText: field,
    initialPaidText: field,
  })
  .strict();
export type Extraction = z.infer<typeof extraction>;
export const blankExtraction = (): Extraction => ({
  intent: "UNKNOWN",
  confidence: 1,
  partyName: null,
  amountText: null,
  dateText: null,
  invoiceReference: null,
  method: null,
  direction: null,
  description: null,
  quantity: null,
  unit: null,
  rateText: null,
  taxText: null,
  discountText: null,
  dueDateText: null,
  initialPaidText: null,
});
export const proposal = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("payment"),
      input: paymentInput,
      allocationFingerprint: z.string().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("sale"), input: invoiceInput }).strict(),
]);
export type Proposal = z.infer<typeof proposal>;
export type InboundMessage = {
  channel: string;
  externalUserId: string;
  externalChatId: string;
  messageId: string;
  text: string;
  timestamp: number;
  callback?: string;
};
export type OutgoingMessage = {
  text: string;
  buttons?: { text: string; data: string }[];
};
export type Identity = {
  id: string;
  user_id: string;
  business_id: string;
  timezone: string;
};
export const conversation = z.object({
  extraction,
  partyId: z.string().optional(),
  contextPartyId: z.string().optional(),
  usePartyContext: z.boolean().optional(),
  directionConfirmed: z.boolean().optional(),
  invoiceId: z.string().optional(),
  awaiting: z
    .enum([
      "partyName",
      "amountText",
      "dateText",
      "method",
      "direction",
      "description",
      "quantity",
      "unit",
      "rateText",
      "taxText",
      "discountText",
      "dueDateText",
      "initialPaidText",
      "choice",
    ])
    .optional(),
  choices: z
    .array(
      z.object({
        key: z.string().uuid(),
        field: z.enum(["partyId", "invoiceId", "method", "direction"]),
        value: z.string(),
        label: z.string(),
      }),
    )
    .max(12)
    .optional(),
  pendingId: z.string().uuid().optional(),
  editing: z.boolean().optional(),
});
export type Conversation = z.infer<typeof conversation>;
export interface AIProvider {
  interpret(
    text: string,
    context: { today: string; intent?: string; awaiting?: string },
  ): Promise<Extraction>;
}
