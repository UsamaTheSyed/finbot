import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
// Reusable in the dedicated database integration suite, after login.
export async function verifyPdfAccess(
  app: FastifyInstance,
  headers: { cookie: string },
  invoiceId: string,
) {
  const path = `/api/businesses/business-1/invoices/${invoiceId}/pdf`;
  assert.equal(
    (await app.inject({ method: "GET", url: path })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/businesses/business-2/invoices/${invoiceId}/pdf`,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/businesses/business-1/invoices/missing/pdf",
        headers,
      })
    ).statusCode,
    404,
  );
  const pdf = await app.inject({ method: "GET", url: path, headers });
  assert.equal(pdf.statusCode, 200, pdf.body.slice(0, 200));
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.equal(pdf.headers["cache-control"], "private, no-store");
  assert.match(
    String(pdf.headers["content-disposition"]),
    /finbot-invoice-INV-000020\.pdf/,
  );
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
}
