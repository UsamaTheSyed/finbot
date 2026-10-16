import type {
  Conversation,
  Extraction,
  ExtractedItem,
  ItemEdit,
  OutgoingMessage,
} from "../types.js";

const fields = [
  "description",
  "quantity",
  "unit",
  "rateText",
  "taxText",
] as const;
function lines(s: Conversation): ExtractedItem[] {
  return (
    s.extraction.items ?? [
      {
        description: s.extraction.description,
        quantity: s.extraction.quantity,
        unit: s.extraction.unit,
        rateText: s.extraction.rateText,
        taxText: s.extraction.taxText,
      },
    ]
  );
}
const canonical = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();
function resolve(items: ExtractedItem[], edit: ItemEdit): number | undefined {
  const number = edit.itemNumber;
  if (number !== null) {
    if (!Number.isInteger(number) || number < 1 || number > items.length)
      return;
    if (
      edit.itemName !== null &&
      canonical(items[number - 1].description ?? "") !==
        canonical(edit.itemName)
    )
      return;
    return number - 1;
  }
  if (edit.itemName === null) return;
  const matches = items.flatMap((item, index) =>
    canonical(item.description ?? "") === canonical(edit.itemName!)
      ? [index]
      : [],
  );
  return matches.length === 1 ? matches[0] : undefined;
}
function ask(s: Conversation): OutgoingMessage {
  return {
    text:
      "Kaunsa item edit karna hai? Sirf item number dein; change abhi apply nahi hua. /cancel se cancel karein.\n" +
      lines(s)
        .map(
          (item, i) =>
            `${i + 1}. ${item.description ?? "Unnamed item"} (${item.quantity ?? "?"} ${item.unit ?? ""})`,
        )
        .join("\n"),
  };
}
function patch(s: Conversation, edit: ItemEdit, index: number) {
  const items = lines(s).map((item) => ({ ...item }));
  for (const field of fields)
    if (edit.changes[field] !== null)
      Object.assign(items[index], { [field]: edit.changes[field] });
  s.extraction.items = items;
  for (const field of fields) s.extraction[field] = null;
  // A previously quoted total describes the old lines; recalculate from the revised lines.
  s.extraction.amountText = null;
  s.extraction.itemEdit = null;
  delete s.itemIndex;
  delete s.pendingItemEdit;
  delete s.awaiting;
  delete s.choices;
}
export function applyItemEdit(
  s: Conversation,
  next: Extraction,
): OutgoingMessage | undefined {
  const edit = next.itemEdit;
  if (
    !s.editing ||
    !edit ||
    !["RECORD_SALE", "RECORD_PURCHASE"].includes(s.extraction.intent)
  )
    return {
      text: "Unsaved invoice/bill preview ka Edit button pehle use karein.",
    };
  if (!fields.some((field) => edit.changes[field] !== null))
    return { text: "Item ki nayi value dein, misal item 2 ka rate 600 karo." };
  if (
    Object.entries(next).some(
      ([key, value]) =>
        !["itemEdit", "intent", "confidence"].includes(key) && value !== null,
    )
  )
    return {
      text: "Specific item aur invoice-wide/full-list changes alag messages mein dein. Koi change apply nahi hua.",
    };
  const index = resolve(lines(s), edit);
  if (index === undefined) {
    s.pendingItemEdit = structuredClone(edit);
    return ask(s);
  }
  patch(s, edit, index);
  next.itemEdit = null; // Do not merge edit instructions into persistent extraction facts.
}
export function selectEditItem(
  s: Conversation,
  text: string,
): OutgoingMessage | undefined {
  const pending = s.pendingItemEdit;
  if (!s.editing || !pending)
    return {
      text: "Item edit expired. Naya preview bana kar Edit use karein.",
    };
  const match = /^(?:item\s*)?(\d+)$/i.exec(text.trim());
  const choice: ItemEdit = {
    ...pending,
    itemNumber: match ? Number(match[1]) : null,
    itemName: match ? null : text.trim(),
  };
  const index = resolve(lines(s), choice);
  if (index === undefined) return ask(s);
  patch(s, choice, index);
}

// An Edit classification can describe a correction, but can never authorize saving.
export function normalizeItemEditIntent(
  s: Conversation,
  next: Extraction,
): void {
  if (
    s.editing &&
    !s.pendingId &&
    next.intent === "EDIT_PENDING_ACTION" &&
    next.itemEdit &&
    Object.values(next.itemEdit.changes).some((value) => value !== null) &&
    (s.extraction.intent === "RECORD_SALE" ||
      s.extraction.intent === "RECORD_PURCHASE")
  ) {
    next.intent = s.extraction.intent;
  }
}
