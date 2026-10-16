import { ZodError } from "zod";
import type { Conversation, OutgoingMessage } from "../types.js";
import { amountPaisa, mutationDate } from "./normalize.js";

export function rateAmount(raw: string, unit: string) {
  const qualified = /^(.*?)\s*(?:\/|\bper\s+)\s*([a-z][a-z ]*)$/i.exec(
    raw.trim(),
  );
  if (!qualified) return amountPaisa(raw);
  const canonical = (s: string) => {
    const value = s.trim().toLowerCase();
    return (
      (
        {
          kilogram: "kg",
          kilograms: "kg",
          kgs: "kg",
          bags: "bag",
          pieces: "piece",
          pcs: "piece",
          cartons: "carton",
        } as Record<string, string>
      )[value] ?? value
    );
  };
  if (canonical(qualified[2]) !== canonical(unit))
    throw new Error("RATE_UNIT_MISMATCH");
  return amountPaisa(qualified[1]);
}
export const refersToPreviousParty = (text: string) =>
  /\b(isne|usne|isko|usko|iska|uska|isi|ussi|unhon|same customer|same supplier|same party|he|she|him|her|they|them)\b/i.test(
    text,
  );
export const looksLikeRequest = (text: string) =>
  /\b(balance|statement|invoice|payment|receive[ds]?|send|sent|jama|report|summary|cash flow)\b/i.test(
    text,
  );
export function requestCorrection(
  state: Conversation,
  field: NonNullable<Conversation["awaiting"]>,
  text: string,
): OutgoingMessage {
  state.awaiting = field;
  delete state.choices;
  return {
    text:
      text +
      " Baqi details saved hain; sirf ye value dobara dein. /cancel se cancel kar sakte hain.",
  };
}
export function validateWriteFields(
  state: Conversation,
  timezone: string,
  now: Date,
): OutgoingMessage | undefined {
  const e = state.extraction;
  const moneyFields =
    e.intent === "RECORD_PAYMENT"
      ? (["amountText"] as const)
      : (["rateText", "discountText", "initialPaidText"] as const);
  for (const field of moneyFields) {
    if (e[field] === null || (field === "rateText" && e.items)) continue;
    try {
      const amount =
        field === "rateText"
          ? rateAmount(e[field]!, e.unit ?? "")
          : amountPaisa(e[field]!);
      if (field === "amountText" && amount === 0)
        return requestCorrection(
          state,
          field,
          "Payment amount zero se zyada honi chahiye.",
        );
      if (field === "rateText") e.rateText = String(amount / 100);
    } catch {
      return requestCorrection(
        state,
        field,
        field === "rateText"
          ? `Rate valid nahi ya unit ${e.unit} se match nahi karti. Sirf PKR unit rate dein, misal 350.`
          : `${field === "discountText" ? "Discount" : field === "initialPaidText" ? "Paid amount" : "Payment amount"} valid nahi. Misal 15000.50; negative amount nahi.`,
      );
    }
  }
  let date: string | undefined;
  for (const field of ["dateText", "dueDateText"] as const) {
    if (
      !e[field] ||
      (field === "dueDateText" &&
        !["RECORD_SALE", "RECORD_PURCHASE"].includes(e.intent))
    )
      continue;
    try {
      const value = mutationDate(e[field]!, timezone, now);
      if (field === "dateText") {
        date = value;
        e.dateText = value;
      } else {
        if (date && value < date)
          return requestCorrection(
            state,
            field,
            `Due date invoice date ${date} se pehle nahi ho sakti. YYYY-MM-DD date dein.`,
          );
        e.dueDateText = value;
      }
    } catch {
      return requestCorrection(
        state,
        field,
        `${field === "dateText" ? "Transaction" : "Due"} date valid nahi. Ek real YYYY-MM-DD date dein.`,
      );
    }
  }
}
export function recoverPreparation(
  error: unknown,
  state: Conversation,
): OutgoingMessage | undefined {
  if (error instanceof ZodError) {
    const path = error.issues[0]?.path;
    const key = String(path?.[path.length - 1]);
    const fields: Record<string, NonNullable<Conversation["awaiting"]>> = {
      quantity: "quantity",
      taxPercent: "taxText",
      date: "dateText",
      dueDate: "dueDateText",
      rate: "rateText",
      discount: "discountText",
      amountPaid: "initialPaidText",
      amount: "amountText",
      unit: "unit",
      item: "description",
      description: "description",
    };
    const field = fields[key];
    if (
      field &&
      path?.[0] === "items" &&
      state.extraction.items &&
      typeof path[1] === "number"
    )
      state.itemIndex = path[1];
    if (field)
      return requestCorrection(
        state,
        field,
        `${key} valid nahi. ${field === "quantity" ? "Positive quantity, maximum 3 decimal places dein." : field === "taxText" ? "Tax 0 se 100 tak, maximum 2 decimal places dein." : "Valid value dein."}`,
      );
  }
  if (
    error instanceof Error &&
    error.message === "Discount cannot exceed invoice subtotal and tax."
  )
    return requestCorrection(
      state,
      "discountText",
      "Discount invoice subtotal aur tax se zyada nahi ho sakta.",
    );
  if (
    error instanceof Error &&
    error.message === "Payment cannot exceed invoice total."
  )
    return requestCorrection(
      state,
      "initialPaidText",
      "Initial paid amount invoice total se zyada nahi ho sakti.",
    );
}
