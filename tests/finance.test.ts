import assert from "node:assert/strict";
import test from "node:test";
import {
  toMinor,
  fromMinor,
  sumMinor,
  multiplyMinor,
  formatPKR,
} from "../src/utils/money";
import {
  calculateInvoiceTotal,
  calculateLineTax,
} from "../src/domain/invoiceCalculations";
import {
  invoiceSchema,
  partySchema,
  type InvoiceInput,
} from "../src/domain/validation";
import { partyService } from "../src/services/partyService";
import { invoiceService } from "../src/services/invoiceService";
import { paymentService } from "../src/services/paymentService";
import { transactionService } from "../src/services/transactionService";
import { reportService } from "../src/services/reportService";
import { buildStatement } from "../src/domain/statement";
const business = "business-1";
const customer = {
  kind: "Customer" as const,
  name: "Ledger Test Customer",
  phone: "03001234567",
  email: "test@example.com",
  ntn: "",
  address: "Karachi",
  paymentTerms: "Net 30" as const,
};
const input = (partyId: string): InvoiceInput => ({
  partyId,
  date: "2026-11-28",
  dueDate: "2026-12-28",
  reference: "TEST",
  items: [
    {
      item: "Rice",
      description: "Test goods",
      quantity: 3,
      unit: "Bags",
      rate: 100.1,
      taxPercent: 5,
    },
  ],
  discount: 10,
  amountPaid: 0,
  method: "Cash",
  notes: "",
  terms: "",
});
const payment = (partyId: string, invoiceId: string, amount: number) => ({
  partyId,
  invoiceId,
  amount,
  direction: "Received" as const,
  method: "JazzCash" as const,
  date: "2026-11-28",
  reference: "TEST-PAY",
  notes: "",
});
test("money uses exact paisa and documented per-line half-up rounding", () => {
  assert.equal(sumMinor([toMinor("0.10"), toMinor("0.20")]), 30);
  assert.equal(multiplyMinor(101, 1.5), 152);
  assert.equal(
    calculateLineTax({ quantity: 1, rateMinor: 10, taxPercent: 5 }),
    1,
  );
  assert.deepEqual(
    calculateInvoiceTotal(
      [{ quantity: 3, rateMinor: 10010, taxPercent: 5 }],
      1000,
    ),
    {
      subtotalMinor: 30030,
      taxMinor: 1502,
      discountMinor: 1000,
      totalMinor: 30532,
    },
  );
  assert.equal(formatPKR(125000000), "PKR 1,250,000");
  assert.equal(formatPKR(30532), "PKR 305.32");
  assert.throws(() => toMinor(1.001));
  assert.throws(() => sumMinor([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() =>
    calculateInvoiceTotal(
      [{ quantity: 1, rateMinor: 100, taxPercent: 0 }],
      101,
    ),
  );
});
test("forms reject invalid dates, precision, email, absent items and excessive payments", () => {
  assert.equal(
    partySchema.safeParse({ ...customer, name: " " }).success,
    false,
  );
  assert.equal(
    partySchema.safeParse({ ...customer, email: "wrong" }).success,
    false,
  );
  for (const extra of [
    { dueDate: "2026-02-30" },
    { dueDate: "2026-11-27" },
    { items: [] },
    { amountPaid: 306 },
    { discount: 301 },
  ])
    assert.equal(
      invoiceSchema.safeParse({ ...input("party-1"), ...extra }).success,
      false,
    );
});
test("invoice and payments stay consistent across party, transaction, statement and dashboard", async () => {
  const p = await partyService.createParty(business, customer);
  const before = (await reportService.list(business))[0];
  const invoice = await invoiceService.createInvoice(business, input(p.id));
  assert.equal(invoice.totalMinor, 30532);
  assert.equal(invoice.status, "Sent");
  assert.ok(invoice.transactionId);
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.balanceMinor,
    30532,
  );
  const partial = await paymentService.createPayment(
    business,
    payment(p.id, invoice.id, 100.1),
  );
  assert.equal(partial.invoiceId, invoice.id);
  assert.equal(partial.transactionId, invoice.transactionId);
  let updated = await invoiceService.getInvoiceById(business, invoice.id);
  assert.equal(updated.status, "Partial");
  assert.equal(updated.paidMinor, 10010);
  assert.equal(updated.balanceMinor, 20522);
  await transactionService.recordPayment(business, invoice.transactionId!, {
    amount: 205.22,
    method: "Cash",
    date: "2026-11-28",
  });
  updated = await invoiceService.getInvoiceById(business, invoice.id);
  assert.equal(updated.status, "Paid");
  assert.equal(updated.balanceMinor, 0);
  const party = await partyService.getPartyById(business, p.id);
  assert.equal(party.party.balanceMinor, 0);
  assert.equal(party.payments.length, 2);
  assert.equal(
    buildStatement(party.transactions, party.payments).at(-1)?.balanceMinor,
    0,
  );
  const transaction = await transactionService.get(
    business,
    invoice.transactionId!,
  );
  assert.equal(transaction.paid, 305.32);
  assert.equal(transaction.status, "Completed");
  const after = (await reportService.list(business))[0];
  assert.equal(toMinor(after.totalCash) - toMinor(before.totalCash), 30532);
  assert.equal(after.receivable, before.receivable);
});
test("invalid payment operations do not mutate ledger state", async () => {
  const p = await partyService.createParty(business, {
    ...customer,
    name: "Validation Customer",
  });
  const invoice = await invoiceService.createInvoice(business, input(p.id));
  const before = await invoiceService.getInvoiceById(business, invoice.id),
    count = (await paymentService.getPayments(business)).length;
  for (const value of [
    { ...payment(p.id, invoice.id, 306) },
    { ...payment(p.id, invoice.id, 1), direction: "Sent" as const },
    { ...payment("party-1", invoice.id, 1) },
    { ...payment(p.id, invoice.id, 1), date: "2026-11-27" },
  ])
    await assert.rejects(() => paymentService.createPayment(business, value));
  await assert.rejects(() =>
    paymentService.createPayment(
      "other-business",
      payment(p.id, invoice.id, 1),
    ),
  );
  assert.deepEqual(
    await invoiceService.getInvoiceById(business, invoice.id),
    before,
  );
  assert.equal((await paymentService.getPayments(business)).length, count);
});
test("drafts never affect balances and issuing a draft is applied exactly once", async () => {
  const p = await partyService.createParty(business, {
      ...customer,
      name: "Draft Customer",
    }),
    value = input(p.id);
  const draft = await invoiceService.createInvoice(business, value, true);
  assert.equal(draft.status, "Draft");
  assert.equal(draft.transactionId, undefined);
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.balanceMinor,
    0,
  );
  await assert.rejects(() =>
    paymentService.createPayment(business, payment(p.id, draft.id, 1)),
  );
  const issued = await invoiceService.updateInvoice(
    business,
    draft.id,
    value,
    false,
  );
  assert.equal(issued.status, "Sent");
  assert.ok(issued.transactionId);
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.balanceMinor,
    30532,
  );
  await assert.rejects(() =>
    invoiceService.updateInvoice(business, draft.id, value, false),
  );
  await assert.rejects(() =>
    invoiceService.createInvoice(business, { ...value, amountPaid: 1 }, true),
  );
});
test("initial payments and on-account payments are not counted twice", async () => {
  const p = await partyService.createParty(business, {
    ...customer,
    name: "Initial Payment Customer",
  });
  const invoice = await invoiceService.createInvoice(business, {
    ...input(p.id),
    amountPaid: 100,
  });
  assert.equal(invoice.paidMinor, 10000);
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.balanceMinor,
    20532,
  );
  await paymentService.createPayment(business, payment(p.id, "", 5.32));
  const detail = await partyService.getPartyById(business, p.id);
  assert.equal(detail.party.balanceMinor, 20000);
  assert.equal(
    buildStatement(detail.transactions, detail.payments).at(-1)?.balanceMinor,
    20000,
  );
  assert.equal(
    (await invoiceService.getInvoiceById(business, invoice.id)).balanceMinor,
    20532,
  );
});
test("supplier payments reduce payables, and unrelated records remain unchanged", async () => {
  const before = await partyService.getPartyById(business, "party-4");
  const invoice = before.invoices.find((i) => i.balanceMinor > 0)!;
  const unrelated = await invoiceService.getInvoiceById(business, "INV-001");
  await paymentService.createPayment(business, {
    ...payment("party-4", invoice.id, 10),
    direction: "Sent",
  });
  const after = await partyService.getPartyById(business, "party-4");
  assert.equal(after.party.balanceMinor, before.party.balanceMinor + 1000);
  assert.deepEqual(
    await invoiceService.getInvoiceById(business, "INV-001"),
    unrelated,
  );
  assert.equal(
    buildStatement(after.transactions, after.payments).at(-1)?.balanceMinor,
    after.party.balanceMinor,
  );
});
test("party edits, scoped lookup and transaction deletion preserve references", async () => {
  const p = await partyService.createParty(business, {
    ...customer,
    name: "Editable Customer",
  });
  await partyService.updateParty(business, p.id, {
    ...customer,
    name: "Updated Customer",
  });
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.name,
    "Updated Customer",
  );
  await assert.rejects(() => partyService.getPartyById("other-business", p.id));
  const invoice = await invoiceService.createInvoice(business, {
    ...input(p.id),
    amountPaid: 20,
  });
  await assert.rejects(() =>
    partyService.updateParty(business, p.id, { ...customer, kind: "Supplier" }),
  );
  await transactionService.remove(business, invoice.transactionId!);
  await assert.rejects(() =>
    invoiceService.getInvoiceById(business, invoice.id),
  );
  assert.equal(
    (await paymentService.getPayments(business)).filter(
      (v) => v.invoiceId === invoice.id,
    ).length,
    0,
  );
  assert.equal(
    (await partyService.getPartyById(business, p.id)).party.balanceMinor,
    0,
  );
  assert.equal(fromMinor(invoice.totalMinor), 305.32);
});

test("mixed line taxes and customer refunds retain correct totals and net receipts", async () => {
  const p = await partyService.createParty(business, {
    ...customer,
    name: "Mixed tax customer",
  });
  const value = input(p.id);
  value.items.push({
    ...value.items[0],
    item: "Untaxed goods",
    quantity: 1,
    rate: 100,
    taxPercent: 0,
  });
  value.amountPaid = 100;
  const invoice = await invoiceService.createInvoice(business, value);
  const transaction = await transactionService.get(
    business,
    invoice.transactionId!,
  );
  assert.equal(transaction.taxRate, null);
  assert.equal(transaction.tax, 15.02);
  assert.equal(invoice.totalMinor, 40532);
  await paymentService.createPayment(business, {
    ...payment(p.id, "", 10),
    direction: "Sent",
  });
  const detail = await partyService.getPartyById(business, p.id);
  assert.equal(detail.party.receivedMinor, 9000);
  assert.equal(detail.party.balanceMinor, 31532);
  assert.equal(
    buildStatement(detail.transactions, detail.payments).at(-1)?.balanceMinor,
    31532,
  );
});
