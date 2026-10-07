import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InvoiceRows } from "../src/features/finance/components";
import { InvoiceDocument } from "../src/features/invoices/InvoiceDocument";
import { invoiceService } from "../src/services/invoiceService";

test("invoice labels use the display number while links retain the internal ID", async () => {
  const fixture = await invoiceService.getInvoiceById("business-1", "INV-001");
  const invoice = { ...fixture, id: "INV-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayId: "INV-000020" };
  const html = renderToStaticMarkup(
    <MemoryRouter><InvoiceRows invoices={[invoice]} /></MemoryRouter>,
  );
  assert.match(html, /href="\/invoices\/INV-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"/);
  assert.match(html, />INV-000020<\/a>/);
  const document = renderToStaticMarkup(<InvoiceDocument invoice={invoice} />);
  assert.ok(document.includes("INV-000020"));
  assert.ok(!document.includes(invoice.id));
  const legacy = renderToStaticMarkup(<InvoiceDocument invoice={fixture} />);
  assert.ok(legacy.includes("INV-001"));
});
