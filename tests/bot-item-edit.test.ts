import test from "node:test";
import assert from "node:assert/strict";
import {
  blankExtraction,
  conversation,
  extraction,
  type Conversation,
  type ItemEdit,
} from "../server/bot/types";
import {
  applyItemEdit,
  selectEditItem,
  normalizeItemEditIntent,
} from "../server/bot/core/itemEdits";
import { validateItems, acceptItemReply } from "../server/bot/core/items";
import { invoiceLines } from "../server/bot/core/items";
import { calculateInvoice } from "../server/domain/money";
import { OpenAIProvider } from "../server/bot/ai/openai";
const changes = () => ({
  description: null,
  quantity: null,
  unit: null,
  rateText: null,
  taxText: null,
});
function state(): Conversation {
  return {
    editing: true,
    partyId: "party",
    extraction: {
      ...blankExtraction(),
      intent: "RECORD_PURCHASE",
      partyName: "Supplier",
      items: [
        {
          description: "Rice",
          quantity: 2,
          unit: "Bag",
          rateText: "1000",
          taxText: "5",
        },
        {
          description: "Oil",
          quantity: 1,
          unit: "Carton",
          rateText: "500",
          taxText: "0",
        },
      ],
      discountText: "100",
      initialPaidText: "0",
      amountText: "2500",
      dateText: "2026-11-28",
      dueDateText: "2026-12-28",
    },
  };
}
const edit = (patch: Partial<ItemEdit> = {}) => ({
  ...blankExtraction(),
  itemEdit: {
    itemNumber: 2,
    itemName: null,
    changes: { ...changes(), rateText: "600" },
    ...patch,
  },
});
test("numbered edit preserves unrelated lines and invoice fields; recalculates exact total", () => {
  const s = state(),
    old = structuredClone(s.extraction);
  assert.equal(applyItemEdit(s, edit()), undefined);
  assert.deepEqual(s.extraction.items![0], old.items![0]);
  assert.equal(s.extraction.items![1].rateText, "600");
  for (const key of [
    "discountText",
    "initialPaidText",
    "dateText",
    "dueDateText",
    "partyName",
  ] as const)
    assert.equal(s.extraction[key], old[key]);
  assert.equal(s.extraction.amountText, null);
  const totals = calculateInvoice({
    items: invoiceLines(s.extraction),
    discount: 100,
    amountPaid: 0,
    partyId: "party",
    date: "2026-11-28",
    dueDate: "2026-12-28",
    method: "Cash",
    reference: "",
    notes: "",
    terms: "",
    draft: false,
  });
  assert.equal(totals.totalMinor, 260000);
});
test("unique exact name supports quantity, unit, tax and description changes on one line", () => {
  const s = state();
  applyItemEdit(
    s,
    edit({
      itemNumber: null,
      itemName: " OIL ",
      changes: {
        description: "Cooking Oil",
        quantity: 3,
        unit: "Bottle",
        rateText: "600/Bottle",
        taxText: "10",
      },
    }),
  );
  assert.equal(validateItems(s), undefined);
  assert.deepEqual(s.extraction.items![1], {
    description: "Cooking Oil",
    quantity: 3,
    unit: "Bottle",
    rateText: "600/Bottle",
    taxText: "10",
  });
  assert.equal(s.extraction.items![0].description, "Rice");
});
for (const selector of [
  { itemNumber: 0 },
  { itemNumber: 9 },
  { itemNumber: null, itemName: "Unknown" },
  { itemNumber: 2, itemName: "Rice" },
  { itemNumber: null, itemName: null },
])
  test(`unclear selector ${JSON.stringify(selector)} asks without mutation`, () => {
    const s = state(),
      before = structuredClone(s.extraction);
    assert.match(applyItemEdit(s, edit(selector))!.text, /Kaunsa item/);
    assert.deepEqual(s.extraction, before);
    assert.match(selectEditItem(s, "99")!.text, /Kaunsa item/);
    assert.deepEqual(s.extraction, before);
  });
test("duplicate name clarification survives restart and changes only explicit selected line", () => {
  let s = state();
  s.extraction.items![1].description = "Rice";
  assert.match(
    applyItemEdit(s, edit({ itemNumber: null, itemName: "Rice" }))!.text,
    /Kaunsa item/,
  );
  s = conversation.parse(JSON.parse(JSON.stringify(s)));
  assert.equal(selectEditItem(s, "2"), undefined);
  assert.equal(s.extraction.items![0].rateText, "1000");
  assert.equal(s.extraction.items![1].rateText, "600");
  assert.equal(s.pendingItemEdit, undefined);
});
test("invalid tax or rate requests correction for selected item only", () => {
  const s = state();
  applyItemEdit(s, edit({ changes: { ...changes(), taxText: "101" } }));
  assert.match(validateItems(s)!.text, /Item 2.*tax/);
  acceptItemReply(s, "0");
  assert.equal(validateItems(s), undefined);
  applyItemEdit(s, edit({ changes: { ...changes(), rateText: "600/kg" } }));
  assert.match(validateItems(s)!.text, /Item 2.*rate/);
  acceptItemReply(s, "600/Carton");
  assert.equal(validateItems(s), undefined);
});
test("single-item legacy state edits through same validated line path", () => {
  const s = state(),
    first = s.extraction.items![0];
  s.extraction.items = null;
  Object.assign(s.extraction, first);
  applyItemEdit(s, edit({ itemNumber: 1 }));
  const updated = conversation.parse(s);
  assert.equal(updated.extraction.items?.length, 1);
  assert.equal(updated.extraction.items?.[0].rateText, "600");
});
test("mixed operations, empty changes and missing Edit state cannot mutate lines", () => {
  const s = state(),
    before = structuredClone(s.extraction);
  assert.ok(applyItemEdit(s, { ...edit(), discountText: "0" }));
  assert.ok(applyItemEdit(s, edit({ changes: changes() })));
  s.editing = false;
  assert.ok(applyItemEdit(s, edit()));
  assert.deepEqual(s.extraction, before);
});
test("strict edit schema rejects invented fields and defaults legacy extraction to no edit", () => {
  const old = { ...blankExtraction() } as Record<string, unknown>;
  delete old.itemEdit;
  assert.equal(extraction.parse(old).itemEdit, null);
  assert.equal(
    extraction.safeParse({
      ...edit(),
      itemEdit: { ...edit().itemEdit, id: "invented" },
    }).success,
    false,
  );
});
test("provider boundary requires nullable strict selector and changes without sending ledger history", async () => {
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const schema = body.response_format.json_schema.schema;
    assert.ok(schema.required.includes("itemEdit"));
    assert.equal(schema.properties.itemEdit.additionalProperties, false);
    assert.equal(
      schema.properties.itemEdit.properties.changes.additionalProperties,
      false,
    );
    assert.equal(body.messages.length, 2);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(edit()) },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const out = await new OpenAIProvider("test", "test", transport).interpret(
    "item 2 rate 600",
    { today: "2026-11-28", intent: "RECORD_PURCHASE" },
  );
  assert.equal(out.itemEdit?.itemNumber, 2);
});

test("Edit-classified correction stays a proposal; confirm/cancel never normalize", () => {
  const s = state();
  const correction = { ...edit(), intent: "EDIT_PENDING_ACTION" as const };
  normalizeItemEditIntent(s, correction);
  assert.equal(correction.intent, s.extraction.intent);
  for (const intent of ["CONFIRM", "CANCEL"] as const) {
    const next = { ...edit(), intent };
    normalizeItemEditIntent(s, next);
    assert.equal(next.intent, intent);
  }
  s.editing = false;
  const outside = { ...edit(), intent: "EDIT_PENDING_ACTION" as const };
  normalizeItemEditIntent(s, outside);
  assert.equal(outside.intent, "EDIT_PENDING_ACTION");
});
