import assert from "node:assert/strict";
import test from "node:test";
import { partyService } from "../src/services/partyService";
import { invoiceService } from "../src/services/invoiceService";
import { paymentService } from "../src/services/paymentService";
import type { InvoiceInput } from "../src/domain/validation";

test("supplier bill drafts stay unposted and issued bills create purchases with sent payments", async () => {
  const business = "business-1";
  const party = await partyService.createParty(business, {
    kind: "Supplier",
    name: "Bill Test Supplier",
    phone: "",
    email: "",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const input: InvoiceInput = {
    partyId: party.id,
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "BILL-TEST",
    items: [
      {
        item: "Goods",
        description: "",
        quantity: 2,
        unit: "Bag",
        rate: 400,
        taxPercent: 0,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
  };
  const draft = await invoiceService.createInvoice(business, input, true);
  assert.equal(draft.status, "Draft");
  assert.equal(
    (await partyService.getPartyById(business, party.id)).transactions.length,
    0,
  );
  const issued = await invoiceService.updateInvoice(
    business,
    draft.id,
    input,
    false,
  );
  const first = await partyService.getPartyById(business, party.id);
  assert.equal(first.transactions[0].type, "Purchase");
  assert.equal(first.party.balanceMinor, -80000);
  await paymentService.createPayment(business, {
    partyId: party.id,
    invoiceId: issued.id,
    direction: "Sent",
    amount: 800,
    method: "Cash",
    date: input.date,
    reference: "",
    notes: "",
  });
  assert.equal(
    (await invoiceService.getInvoiceById(business, issued.id)).status,
    "Paid",
  );
  assert.equal(
    (await partyService.getPartyById(business, party.id)).party.balanceMinor,
    0,
  );
  const paid = await invoiceService.createInvoice(business, {
    ...input,
    amountPaid: 300,
  });
  assert.equal(paid.balanceMinor, 50000);
  const account = await partyService.getPartyById(business, party.id);
  assert.equal(
    account.payments.find((p) => p.invoiceId === paid.id)?.direction,
    "Sent",
  );
  assert.equal(account.party.balanceMinor, -50000);
});
