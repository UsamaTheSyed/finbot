import assert from "node:assert/strict";
import test from "node:test";
import { createHttpClient } from "../src/services/api";
test("PDF client accepts binary only, preserves HTTP errors and sends no JSON body", async () => {
  const original = globalThis.fetch;
  try {
    let options: RequestInit | undefined;
    globalThis.fetch = async (_url, init) => {
      options = init;
      return new Response("%PDF-test", {
        headers: { "Content-Type": "application/pdf" },
      });
    };
    const api = createHttpClient("/api");
    assert.equal(await (await api.blob("/invoices/1/pdf")).text(), "%PDF-test");
    assert.equal(options?.method, "GET");
    assert.equal(options?.body, undefined);
    assert.equal(options?.credentials, "same-origin");
    globalThis.fetch = async () =>
      new Response("<html>login</html>", {
        headers: { "Content-Type": "text/html" },
      });
    await assert.rejects(api.blob("/invoices/1/pdf"), /did not return a PDF/);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ message: "PDF unavailable", code: "PDF_UNAVAILABLE" }),
        { status: 503 },
      );
    await assert.rejects(api.blob("/invoices/1/pdf"), /PDF unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
