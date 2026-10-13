import test from "node:test";
import assert from "node:assert/strict";
import { blankExtraction, type Conversation } from "../server/bot/types";
import {
  rateAmount,
  validateWriteFields,
  recoverPreparation,
  refersToPreviousParty,
} from "../server/bot/core/recovery";
import { invoiceInput } from "../server/domain/validation";
import { partySummaries } from "../server/services/parties";
import type { Queryable } from "../server/services/ledger";
const sale = (): Conversation => ({
  extraction: {
    ...blankExtraction(),
    intent: "RECORD_SALE",
    rateText: "350/kg",
    unit: "kg",
    discountText: "0",
    initialPaidText: "0",
    dateText: "2026-10-13",
    dueDateText: "2026-11-20",
  },
});
const now = new Date("2026-10-13T00:00:00Z");
test("qualified rates accept matching units without silently converting mismatched units", () => {
  for (const raw of [
    "350/kg",
    "350 per kilogram",
    "PKR 350 / kg",
    "350 PKR/kg",
  ])
    assert.equal(rateAmount(raw, "kg"), 35000);
  assert.equal(rateAmount("350", "Bag"), 35000);
  assert.throws(() => rateAmount("350/kg", "Bag"));
  assert.throws(() => rateAmount("350/kg or 400/kg", "kg"));
  assert.throws(() => rateAmount("-350/kg", "kg"));
});
test("invalid rate preserves remaining sale details and numeric retry recovers", () => {
  const s = sale();
  s.extraction.rateText = "350 per wrongunit";
  assert.match(
    validateWriteFields(s, "Asia/Karachi", now)!.text,
    /Rate valid nahi/,
  );
  assert.equal(s.awaiting, "rateText");
  assert.equal(s.extraction.discountText, "0");
  s.extraction.rateText = "350";
  assert.equal(validateWriteFields(s, "Asia/Karachi", now), undefined);
});
test("early or impossible due date asks only for a replacement date", () => {
  const s = sale();
  s.extraction.dueDateText = "2026-10-05";
  assert.match(
    validateWriteFields(s, "Asia/Karachi", now)!.text,
    /2026-10-13 se pehle/,
  );
  assert.equal(s.awaiting, "dueDateText");
  s.extraction.dueDateText = "2026-02-30";
  assert.match(
    validateWriteFields(s, "Asia/Karachi", now)!.text,
    /real YYYY-MM-DD/,
  );
  s.extraction.dueDateText = "2026-11-20";
  assert.equal(validateWriteFields(s, "Asia/Karachi", now), undefined);
  assert.equal(s.extraction.rateText, "350");
});
test("zero payment and malformed discount or paid amounts remain recoverable", () => {
  const s = sale();
  s.extraction.discountText = "lots";
  assert.ok(validateWriteFields(s, "Asia/Karachi", now));
  assert.equal(s.awaiting, "discountText");
  s.extraction.discountText = "0";
  s.extraction.initialPaidText = "-1";
  assert.ok(validateWriteFields(s, "Asia/Karachi", now));
  assert.equal(s.awaiting, "initialPaidText");
  const p: Conversation = {
    extraction: {
      ...blankExtraction(),
      intent: "RECORD_PAYMENT",
      amountText: "0",
    },
  };
  assert.ok(validateWriteFields(p, "Asia/Karachi", now));
  assert.equal(p.awaiting, "amountText");
});
test("schema errors map tax correction without leaking raw provider data", () => {
  const s = sale();
  const result = invoiceInput.safeParse({
    partyId: "p",
    date: "2026-10-13",
    dueDate: "2026-10-13",
    reference: "",
    items: [
      {
        item: "x",
        description: "",
        quantity: 1,
        unit: "kg",
        rate: 350,
        taxPercent: 101,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
    draft: false,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(recoverPreparation(result.error, s));
    assert.equal(s.awaiting, "taxText");
  }
  assert.equal(
    recoverPreparation(new Error("private database parameters"), s),
    undefined,
  );
});
test("party pronouns permit an explicit context suggestion, not an invented name", () => {
  assert.equal(refersToPreviousParty("Acha isne 20000 jama karwaye"), true);
  assert.equal(refersToPreviousParty("same supplier ko 100000 diye"), true);
  assert.equal(refersToPreviousParty("Ahmed ko payment"), false);
});
test("party summaries never run overlapping queries on a transaction client", async () => {
  let active = false,
    calls = 0;
  const client = {
    query: async () => {
      assert.equal(active, false);
      active = true;
      calls++;
      await new Promise((r) => setTimeout(r, 1));
      active = false;
      return { rows: [] };
    },
  };
  assert.deepEqual(
    await partySummaries(client as unknown as Queryable, "business-1"),
    [],
  );
  assert.equal(calls, 4);
});
