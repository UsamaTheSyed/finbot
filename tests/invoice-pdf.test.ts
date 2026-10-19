import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { invoiceHtml } from "../server/pdf/invoiceHtml";
import { invoicePdfFilename, loadInvoicePdf } from "../server/pdf/invoiceData";
import { invoicePdfRoutes } from "../server/routes/invoicePdf";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
import { pdfFixture } from "./helpers/pdfFixture";

test("PDF preserves exact line taxes, authoritative summary, draft/bill labels and allocated history", () => {
  const data = pdfFixture();
  const html = invoiceHtml(data, "");
  assert.match(html, /PKR 2,100.00/);
  assert.match(html, /PKR 2,600.00/);
  assert.match(html, /PKR 2,000.00/);
  assert.match(html, /Amounts allocated to this invoice only/);
  assert.match(html, /HBL-100/);
  data.party.kind = "Supplier";
  data.invoice.status = "Draft";
  assert.match(invoiceHtml(data, ""), /DRAFT - Not issued/);
  assert.match(invoiceHtml(data, ""), /<h2>Supplier<\/h2>/);
  assert.equal(invoicePdfFilename(data), "finbot-bill-INV-000020.pdf");
});
test("PDF escapes every supplied text and excludes remote/SVG logos and unsafe filenames", () => {
  const data = pdfFixture();
  data.party.name = '<img src="https://evil.test" onerror="alert(1)">';
  data.invoice.notes = '<script>fetch("file:///etc/passwd")</script>';
  data.business.logo = "https://evil.test/logo.png";
  data.invoice.displayId = 'x"\r\nX-Evil: yes/../../';
  const html = invoiceHtml(data, "");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('<img src="https://evil'));
  assert.ok(!html.includes('src="https://evil.test/logo'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(invoicePdfFilename(data), /^[a-zA-Z0-9_.-]+$/);
});
test("PDF uses a read-only snapshot and releases the client on missing records", async () => {
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql);
      return { rows: [] };
    },
    release() {
      calls.push("release");
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as DatabasePool;
  await assert.rejects(
    loadInvoicePdf(pool, "business-1", "missing"),
    /Invoice not found/,
  );
  assert.equal(calls[0], "begin isolation level repeatable read read only");
  assert.deepEqual(calls.slice(-2), ["rollback", "release"]);
});
test("actual PDF route requires membership before reading data or launching Chromium", async () => {
  for (const status of [401, 404]) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    let touched = false;
    const pool = {
      connect() {
        touched = true;
        throw new Error("Must not read");
      },
    } as unknown as DatabasePool;
    const auth = {
      async requireMembership() {
        throw new ApiError(status, "DENIED", "Denied");
      },
    } as unknown as Auth;
    await invoicePdfRoutes(app, pool, auth);
    try {
      const response = await app.inject(
        "/api/businesses/private/invoices/INV-private/pdf",
      );
      assert.equal(response.statusCode, status);
      assert.equal(touched, false);
      assert.ok(!response.headers["content-disposition"]);
    } finally {
      await app.close();
    }
  }
});
