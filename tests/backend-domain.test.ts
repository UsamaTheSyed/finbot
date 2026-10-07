import assert from "node:assert/strict";
import test from "node:test";
import { calculateInvoice, toMinor } from "../server/domain/money";
import { hashPassword, verifyPassword } from "../server/lib/password";

test("server money calculations preserve integer paisa and line rounding", () => {
  const result = calculateInvoice({
    partyId: "party-1",
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "",
    items: [{ item: "Rice", description: "", quantity: 3, unit: "Bag", rate: 100.1, taxPercent: 5 }],
    discount: 10,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
    draft: false,
  });
  assert.equal(result.subtotalMinor, 30030);
  assert.equal(result.taxMinor, 1502);
  assert.equal(result.totalMinor, 30532);
  assert.equal(toMinor(25000), 2500000);
});

test("password hashes are salted and verify without storing plaintext", async () => {
  const first = await hashPassword("finbot-demo");
  const second = await hashPassword("finbot-demo");
  assert.notEqual(first, second);
  assert.equal(first.includes("finbot-demo"), false);
  assert.equal(await verifyPassword("finbot-demo", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});
