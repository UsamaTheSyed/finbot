import test from "node:test";
import assert from "node:assert/strict";
import { invoiceHtml } from "../server/pdf/invoiceHtml";
import { pdfFixture } from "./helpers/pdfFixture";
test("invoice PDF retains original total and payment history alongside net credit summary", () => {
  const data = pdfFixture();
  Object.assign(data.invoice, {
    creditedMinor: 100000,
    netTotalMinor: 160000,
    paidMinor: 60000,
    balanceMinor: 100000,
  });
  data.creditHistory = [
    {
      date: "2026-11-28",
      kind: "Credit note",
      amountMinor: 100000,
      reason: "Return <script>unsafe</script>",
    },
  ];
  const html = invoiceHtml(data, "");
  assert.match(html, /PKR 2,600.00/);
  assert.match(html, /PKR 1,600.00/);
  assert.match(html, /HBL-100/);
  assert.match(html, /Return &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /Credits/);
});
