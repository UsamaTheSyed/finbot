import { test, expect } from "./fixture";
import type { APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
const base = "/api/businesses/business-1";
async function createParty(
  request: APIRequestContext,
  kind: "Customer" | "Supplier",
) {
  const r = await request.post(`${base}/parties`, {
    data: {
      kind,
      name: `Report ${kind}`,
      phone: "",
      email: "",
      ntn: "",
      address: "Karachi",
      paymentTerms: "Net 30",
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function createInvoice(
  request: APIRequestContext,
  partyId: string,
  draft = false,
) {
  const r = await request.post(`${base}/invoices`, {
    data: {
      partyId,
      date: "2026-10-01",
      dueDate: "2026-10-31",
      reference: "Reports test",
      items: [
        {
          item: "Goods",
          description: "",
          quantity: 2,
          unit: "Each",
          rate: 40000,
          taxPercent: 0,
        },
      ],
      discount: 0,
      amountPaid: 0,
      method: "Cash",
      notes: "",
      terms: "",
      draft,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function noOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("sales report opens from overview, excludes drafts, links invoices and exports CSV", async ({
  page,
}) => {
  test.setTimeout(90000);
  const party = await createParty(page.request, "Customer");
  const invoice = await createInvoice(page.request, party.id);
  const draft = await createInvoice(page.request, party.id, true);
  await page.goto("/reports");
  await page
    .getByRole("link", { name: "View Sales Report", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sales Report",
  );
  await page.getByLabel("Reporting month").fill("2026-10");
  const table = page.getByRole("table", { name: "Sales Report", exact: true });
  await expect(
    table.getByRole("link", { name: invoice.displayId, exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("link", { name: draft.displayId, exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("finbot-sales-2026-10.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain(invoice.displayId);
  expect(csv).not.toContain(draft.displayId);
  await table
    .getByRole("link", { name: invoice.displayId, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}$`));
  await page.goto("/reports/sales?period=2099-01");
  await expect(
    page.getByRole("heading", { name: "No report data for this period" }),
  ).toBeVisible();
});
test("AP aging uses historical settlements and excludes supplier drafts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const party = await createParty(page.request, "Supplier");
  const invoice = await createInvoice(page.request, party.id);
  await createInvoice(page.request, party.id, true);
  await page.goto("/reports");
  await page.getByRole("link", { name: "View A/P Aging", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A/P Aging", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Reporting month").fill("2026-10");
  const table = page.getByRole("table", { name: "A/P Aging", exact: true });
  const row = table.getByRole("row").filter({ hasText: party.name });
  await expect(row).toContainText("80,000");
  await noOverflow(page);
  const p = await page.request.post(`${base}/payments`, {
    data: {
      partyId: party.id,
      invoiceId: invoice.id,
      direction: "Sent",
      amount: 30000,
      method: "Cash",
      date: "2026-11-01",
      reference: "Report payment",
      notes: "",
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  await page.reload();
  await expect(row).toContainText("80,000");
  await page.getByLabel("Reporting month").fill("2026-11");
  await expect(row).toContainText("50,000");
  await expect(row).not.toContainText("80,000");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await waiting).suggestedFilename()).toBe(
    "finbot-ap-aging-2026-11.csv",
  );
  await page
    .getByRole("navigation", { name: "Report navigation" })
    .getByRole("link", { name: "Sales", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reports\/sales$/);
});
