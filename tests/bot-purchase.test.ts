import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { advance } from "../server/bot/core/flow";
import { executeWrite, prepareWrite } from "../server/bot/tools/write";
import {
  blankExtraction,
  proposal,
  type Conversation,
} from "../server/bot/types";
const identity = {
  id: "identity",
  business_id: "business-1",
  user_id: "user-1",
  timezone: "Asia/Karachi",
};
const now = new Date("2026-11-28T10:00:00Z");
const state = (
  intent: "RECORD_SALE" | "RECORD_PURCHASE" = "RECORD_PURCHASE",
): Conversation => ({
  partyId: "party",
  extraction: {
    ...blankExtraction(),
    intent,
    description: "Rice",
    quantity: 2,
    unit: "Bag",
    rateText: "400/Bag",
    taxText: "0",
    discountText: "0",
    initialPaidText: "0",
    dateText: "2026-11-28",
    dueDateText: "2026-12-28",
  },
});
function fake(kind = "Supplier") {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("select * from parties"))
        return { rows: [{ id: "party", kind, name: "Test Party" }] };
      if (
        sql.startsWith("update bot_actions") ||
        sql.startsWith("insert into bot_actions")
      )
        return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as PoolClient;
  return { client, queries };
}
for (const intent of ["RECORD_SALE", "RECORD_PURCHASE"] as const) {
  test(`${intent} zero paid previews without method or ledger writes`, async () => {
    const s = state(intent),
      f = fake(intent === "RECORD_SALE" ? "Customer" : "Supplier");
    const out = await advance(f.client, identity, s, now, 15);
    assert.ok(out.buttons?.some((b) => b.text === "Confirm"));
    assert.match(out.text, /PKR 800.00/);
    assert.match(out.text, /no new cash payment/);
    assert.equal(s.extraction.method, null);
    assert.ok(
      f.queries.every(
        (q) =>
          !q.startsWith("insert into invoices") &&
          !q.startsWith("insert into payments"),
      ),
    );
  });
}
test("purchase positive paid requires method; malformed paid and invalid due date recover", async () => {
  const s = state(),
    f = fake();
  s.extraction.initialPaidText = "100";
  assert.match(
    (await advance(f.client, identity, s, now, 15)).text,
    /Payment method/,
  );
  s.extraction.initialPaidText = "no idea";
  assert.match(
    (await advance(f.client, identity, s, now, 15)).text,
    /Paid amount valid nahi/,
  );
  s.extraction.initialPaidText = "0";
  s.extraction.dueDateText = "2026-11-01";
  assert.match(
    (await advance(f.client, identity, s, now, 15)).text,
    /se pehle/,
  );
  s.extraction.dueDateText = "2026-12-01";
  assert.match(
    (await advance(f.client, identity, s, now, 15)).text,
    /Create supplier bill/,
  );
});
test("wrong party type asks for supplier without losing line items", async () => {
  const s = state();
  assert.match(
    (await advance(fake("Customer").client, identity, s, now, 15)).text,
    /Supplier ka naam/,
  );
  assert.equal(s.partyId, undefined);
  assert.equal(s.awaiting, "partyName");
  assert.equal(s.extraction.quantity, 2);
});
test("purchase paid proposal uses Sent label and revalidates party before numbering", async () => {
  const s = state();
  s.extraction.rateText = "400";
  s.extraction.initialPaidText = "100";
  s.extraction.method = "Bank Transfer";
  const out = await prepareWrite(fake().client, identity, s, now);
  assert.equal(out.value.kind, "purchase");
  assert.match(out.summary, /Sent, Bank Transfer/);
  assert.ok(proposal.safeParse(out.value).success);
  await assert.rejects(
    () => executeWrite(fake("Customer").client, identity, out.value),
    /Party type/,
  );
  await assert.rejects(
    () => prepareWrite(fake("Customer").client, identity, s, now),
    /Supplier choose/,
  );
});
