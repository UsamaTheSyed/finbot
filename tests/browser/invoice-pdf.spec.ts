import { readFile } from "node:fs/promises";
import { test, expect } from "./fixture";

test("invoice and supplier bill PDFs download; failed exports remain retryable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const rows = await (
    await page.request.get("/api/businesses/business-1/invoices")
  ).json();
  const parties = await (
    await page.request.get("/api/businesses/business-1/parties")
  ).json();
  for (const kind of ["Customer", "Supplier"]) {
    const party = parties.find((p: { kind: string }) => p.kind === kind);
    expect(party).toBeTruthy();
    const created = await page.request.post(
      "/api/businesses/business-1/invoices",
      {
        data: {
          partyId: party.id,
          date: "2026-11-28",
          dueDate: "2026-12-28",
          reference: "PDF-CHECK",
          items: [
            {
              item: "PDF line",
              description: "Test",
              quantity: 2,
              unit: "Each",
              rate: 1000,
              taxPercent: 5,
            },
          ],
          discount: 0,
          amountPaid: 0,
          method: "Cash",
          notes: "PDF test",
          terms: "",
          draft: true,
        },
      },
    );
    expect(created.status()).toBe(201);
    const invoice = await created.json();
    await page.goto(`/invoices/${invoice.id}`);
    const button = page.getByRole("button", {
      name: "Download PDF",
      exact: true,
    });
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      `finbot-${kind === "Supplier" ? "bill" : "invoice"}-${invoice.displayId}.pdf`,
    );
    const file = await download.path();
    expect(file).toBeTruthy();
    expect((await readFile(file!)).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(button).toBeEnabled();
  }
  expect(rows.length).toBeGreaterThan(0);
  await page.route("**/invoices/*/pdf", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "PDF test failure" }),
    }),
  );
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(
    page.getByText("PDF test failure", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
});
