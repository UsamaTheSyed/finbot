import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createPdfRenderer, embeddedFonts } from "../server/pdf/renderer";
import { invoiceHtml } from "../server/pdf/invoiceHtml";
import { pdfFixture } from "./helpers/pdfFixture";
const executable =
  process.env.PDF_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
test(
  "Chromium renders invoice, draft bill and multi-page document to real PDF bytes",
  { skip: !existsSync(executable) },
  async () => {
    const renderer = createPdfRenderer();
    try {
      const data = pdfFixture(),
        fonts = await embeddedFonts();
      const invoice = await renderer.render(invoiceHtml(data, fonts));
      assert.equal(invoice.subarray(0, 5).toString(), "%PDF-");
      assert.ok(invoice.length > 5000);
      data.party.kind = "Supplier";
      data.invoice.status = "Draft";
      data.invoice.items = Array.from({ length: 100 }, (_, n) => ({
        ...data.invoice.items[0],
        id: `line-${n}`,
        item: `Long material line ${n + 1}`,
        description: "Description ".repeat(20),
      }));
      const bill = await renderer.render(invoiceHtml(data, fonts));
      assert.equal(bill.subarray(0, 5).toString(), "%PDF-");
      assert.ok(bill.length > invoice.length);
    } finally {
      await renderer.close();
    }
  },
);
