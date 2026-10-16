import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import {
  blankExtraction,
  conversation,
  extraction,
  type Conversation,
} from "../server/bot/types";
import { advance } from "../server/bot/core/flow";
import { acceptItemReply, mergeInvoiceEdit } from "../server/bot/core/items";
import { prepareWrite } from "../server/bot/tools/write";
import { OpenAIProvider } from "../server/bot/ai/openai";
const identity = {
  id: "identity",
  business_id: "business-1",
  user_id: "user-1",
  timezone: "Asia/Karachi",
};
const now = new Date("2026-11-28T10:00:00Z");
function state(
  intent: "RECORD_SALE" | "RECORD_PURCHASE" = "RECORD_SALE",
): Conversation {
  return {
    partyId: "party",
    extraction: {
      ...blankExtraction(),
      intent,
      items: [
        {
          description: "Rice",
          quantity: 2,
          unit: "Bag",
          rateText: "1000/Bag",
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
      dateText: "2026-11-28",
      dueDateText: "2026-12-28",
    },
  };
}
function fake(kind: string) {
  return {
    query: async (sql: string) => {
      if (sql.startsWith("select * from parties"))
        return { rows: [{ id: "party", name: "Test", kind }] };
      if (
        sql.startsWith("update bot_actions") ||
        sql.startsWith("insert into bot_actions")
      )
        return { rows: [] };
      throw Error("Unexpected ledger write " + sql);
    },
  } as unknown as PoolClient;
}
for (const intent of ["RECORD_SALE", "RECORD_PURCHASE"] as const)
  test(`${intent} multi-item preview reconciles tax and discount without ledger writes`, async () => {
    const s = state(intent),
      c = fake(intent === "RECORD_SALE" ? "Customer" : "Supplier");
    const out = await advance(c, identity, s, now, 15);
    assert.ok(out.buttons?.some((b) => b.text === "Confirm"));
    assert.match(out.text, /1\. Rice/);
    assert.match(out.text, /2\. Oil/);
    assert.match(out.text, /Total: PKR 2,500.00/);
    assert.match(out.text, /no new cash payment/);
    const p = await prepareWrite(c, identity, s, now);
    assert.equal(p.value.kind, intent === "RECORD_SALE" ? "sale" : "purchase");
    assert.equal(p.value.input.items.length, 2);
  });
test("indexed corrections survive serialization and preserve every other line", async () => {
  let s = state();
  s.extraction.items![1].rateText = null;
  assert.match(
    (await advance(fake("Customer"), identity, s, now, 15)).text,
    /Item 2/,
  );
  s = conversation.parse(JSON.parse(JSON.stringify(s)));
  assert.equal(s.itemIndex, 1);
  acceptItemReply(s, "500/kg");
  assert.match(
    (await advance(fake("Customer"), identity, s, now, 15)).text,
    /Item 2/,
  );
  acceptItemReply(s, "500/Carton");
  assert.ok((await advance(fake("Customer"), identity, s, now, 15)).buttons);
  assert.equal(s.extraction.items![0].rateText, "1000/Bag");
  assert.equal(s.extraction.items![1].rateText, "500/Carton");
});
test("line quantity and tax validation preserves invalid item for correction", async () => {
  const s = state();
  s.extraction.items![1].quantity = 0;
  assert.match(
    (await advance(fake("Customer"), identity, s, now, 15)).text,
    /Item 2.*quantity/,
  );
  assert.ok(acceptItemReply(s, "-2"));
  acceptItemReply(s, "1");
  s.extraction.items![1].taxText = "101";
  assert.match(
    (await advance(fake("Customer"), identity, s, now, 15)).text,
    /Item 2.*tax/,
  );
  acceptItemReply(s, "0");
  assert.ok((await advance(fake("Customer"), identity, s, now, 15)).buttons);
});
test("partial item edits cannot discard existing lines", () => {
  const s = state();
  const before = structuredClone(s.extraction.items);
  assert.match(
    mergeInvoiceEdit(s, { ...blankExtraction(), rateText: "900" })!.text,
    /poori replacement list/,
  );
  assert.deepEqual(s.extraction.items, before);
  const next = {
    ...blankExtraction(),
    items: [{ ...before![0], rateText: "900" }, before![1]],
  };
  assert.equal(mergeInvoiceEdit(s, next), undefined);
});
test("legacy state is readable; extra fields and empty or oversized lists are rejected", () => {
  const old = { ...blankExtraction() } as Record<string, unknown>;
  delete old.items;
  assert.equal(extraction.parse(old).items, null);
  for (const items of [
    [],
    Array(11).fill(state().extraction.items![0]),
    [{ ...state().extraction.items![0], id: "invented" }],
  ])
    assert.equal(
      extraction.safeParse({ ...blankExtraction(), items }).success,
      false,
    );
});
test("OpenAI boundary declares strict nested items and parses missing item fields", async () => {
  const expected = state().extraction;
  expected.items![1].rateText = null;
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const schema = body.response_format.json_schema.schema;
    assert.ok(schema.required.includes("items"));
    assert.equal(schema.properties.items.items.additionalProperties, false);
    assert.equal(schema.properties.items.maxItems, 10);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(expected) },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const result = await new OpenAIProvider("test", "test", transport).interpret(
    "two items",
    { today: "2026-11-28" },
  );
  assert.equal(result.items?.length, 2);
  assert.equal(result.items?.[1].rateText, null);
});
