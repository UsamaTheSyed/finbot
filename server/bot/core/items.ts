import { applyItemEdit } from "./itemEdits.js";
import { invoiceItemInput } from "../../domain/validation.js";
import type {
  Conversation,
  Extraction,
  ExtractedItem,
  OutgoingMessage,
} from "../types.js";
import { rateAmount, requestCorrection } from "./recovery.js";

const fields = [
  "description",
  "quantity",
  "unit",
  "rateText",
  "taxText",
] as const;
type ItemField = (typeof fields)[number];
const labels: Record<ItemField, string> = {
  description: "item name",
  quantity: "quantity (positive, maximum 3 decimals)",
  unit: "unit",
  rateText: "PKR unit rate (maximum 2 decimals)",
  taxText: "tax percent (0–100, maximum 2 decimals)",
};
function line(item: ExtractedItem) {
  return {
    item: item.description,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    rate: rateAmount(item.rateText!, item.unit!) / 100,
    taxPercent: Number(item.taxText?.replace(/%$/, "")),
  };
}
export function invoiceLines(e: Extraction) {
  return (e.items ?? [e]).map((item) => invoiceItemInput.parse(line(item)));
}
function askItem(
  s: Conversation,
  index: number,
  field: ItemField,
): OutgoingMessage {
  s.itemIndex = index;
  return requestCorrection(
    s,
    field,
    `Item ${index + 1}: ${labels[field]} valid dein.`,
  );
}
export function validateItems(s: Conversation): OutgoingMessage | undefined {
  for (const [index, item] of (s.extraction.items ?? []).entries()) {
    for (const field of fields)
      if (item[field] === null) return askItem(s, index, field);
    try {
      rateAmount(item.rateText!, item.unit!);
    } catch {
      return askItem(s, index, "rateText");
    }
    const result = invoiceItemInput.safeParse(line(item));
    if (!result.success) {
      const map: Record<string, ItemField> = {
        item: "description",
        description: "description",
        quantity: "quantity",
        unit: "unit",
        rate: "rateText",
        taxPercent: "taxText",
      };
      return askItem(
        s,
        index,
        map[String(result.error.issues[0].path[0])] ?? "description",
      );
    }
  }
  delete s.itemIndex;
}
// A short reply updates ONLY the indexed field; other lines survive restart/correction.
export function acceptItemReply(
  s: Conversation,
  text: string,
): OutgoingMessage | undefined {
  const index = s.itemIndex;
  const field = s.awaiting as ItemField;
  const item = index === undefined ? undefined : s.extraction.items?.[index];
  if (!item || !fields.includes(field))
    return { text: "Item selection invalid. /cancel se restart karein." };
  if (field === "quantity") {
    const number = Number(text);
    if (!invoiceItemInput.shape.quantity.safeParse(number).success)
      return askItem(s, index!, field);
    item.quantity = number;
  } else {
    if (!text.trim() || text.length > 200) return askItem(s, index!, field);
    item[field] = text.trim();
  }
}
// Never replace a multi-line invoice with an ambiguous partial line edit.
export function mergeInvoiceEdit(
  s: Conversation,
  next: Extraction,
): OutgoingMessage | undefined {
  if (!["RECORD_SALE", "RECORD_PURCHASE"].includes(s.extraction.intent)) return;
  if (next.itemEdit) return applyItemEdit(s, next);
  if (
    s.extraction.items &&
    !next.items &&
    fields.some((field) => next[field] !== null)
  )
    return {
      text: "Items edit karne ke liye poori replacement list dein: har item ka naam, quantity, unit, rate aur tax. Purani confirmation cancelled hai; koi financial change nahi hua.",
    };
  if (next.items) {
    for (const field of fields) {
      s.extraction[field] = null;
      next[field] = null;
    }
    s.extraction.amountText = null;
    delete s.itemIndex;
    delete s.pendingItemEdit;
  }
}
