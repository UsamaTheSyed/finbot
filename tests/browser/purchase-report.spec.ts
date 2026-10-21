import { test, expect } from "./fixture";
import { readFile } from "node:fs/promises";

test("purchase report excludes drafts, opens bills, exports CSV and ignores cash settlement", async ({
  page,
}) => {
  test.setTimeout(90000);
  const base = "/api/businesses/business-1";
  const created = await page.request.post(`${base}/parties`, {
    data: {
      kind: "Supplier",
      name: "Purchase Report Supplier",
      phone: "",
      email: "",
      ntn: "",
      address: "Karachi",
      paymentTerms: "Net 30",
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const party = await created.json();
  const createBill = async (draft: boolean) => {
    const r = await page.request.post(`${base}/invoices`, {
      data: {
        partyId: party.id,
        date: "2026-10-01",
        dueDate: "2026-10-31",
        reference: "Purchase report",
        items: [
          {
            item: "Material",
            description: "",
            quantity: 3,
            unit: "Each",
            rate: 100.1,
            taxPercent: 5,
          },
        ],
        discount: 10,
        amountPaid: 0,
        method: "Cash",
        notes: "",
        terms: "",
        draft,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    return r.json();
  };
  const bill = await createBill(false);
  const draft = await createBill(true);
  await page.goto("/reports");
  await page
    .getByRole("link", { name: "View Purchase Report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Purchase Report", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Reporting month").fill("2026-10");
  const table = page.getByRole("table", {
    name: "Purchase Report",
    exact: true,
  });
  const row = table.getByRole("row").filter({ hasText: party.name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("305.32");
  await expect(
    table.getByRole("link", { name: draft.displayId, exact: true }),
  ).toHaveCount(0);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("finbot-purchases-2026-10.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain(bill.displayId);
  expect(csv).not.toContain(draft.displayId);
  expect(csv).toContain('"Supplier"');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await row.getByRole("link", { name: bill.displayId, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${bill.id}$`));
  await page
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  const payment = page.getByRole("dialog", {
    name: "Record Payment",
    exact: true,
  });
  await payment.getByLabel("Amount (PKR)", { exact: true }).fill("305.32");
  await payment.getByLabel("Date", { exact: true }).fill("2026-11-01");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(payment).toBeHidden();
  await page.goto("/reports/purchases?period=2026-10");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("305.32");
  await page.getByLabel("Reporting month").fill("2099-01");
  await expect(
    page.getByRole("heading", { name: "No report data for this period" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeDisabled();
});
