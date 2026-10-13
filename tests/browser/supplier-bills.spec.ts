import { test, expect } from "./fixture";

test("supplier bill uses existing form, posts a purchase and records a sent payment", async ({
  page,
}) => {

  test.setTimeout(60_000); 
  const created = await page.request.post(
    "/api/businesses/business-1/parties",
    {
      data: {
        kind: "Supplier",
        name: "Supplier Browser Test",
        phone: "",
        email: "",
        ntn: "",
        address: "Karachi",
        paymentTerms: "Net 30",
      },
    },
  );
  expect(created.status()).toBe(201);
  const party = await created.json();
  await page.goto("/invoices");
  await page.getByRole("button", { name: "New Bill", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New Bill", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Supplier", { exact: true }).selectOption(party.id);
  await page.getByLabel("Item 1", { exact: true }).fill("Raw materials");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByLabel("Rate 1", { exact: true }).fill("40000");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "Bill Preview",
    exact: true,
  });
  await expect(
    preview.getByRole("heading", { name: "Bill Details", exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByText("PKR 80,000", { exact: true }).first(),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Create Bill", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/INV-[\da-f-]+$/i);
  await expect(
    page.getByRole("heading", { name: "Bill Details", exact: true }),
  ).toBeVisible();
  const invoiceId = new URL(page.url()).pathname.split("/").at(-1);
  const account = await page.request.get(
    `/api/businesses/business-1/parties/${party.id}`,
  );
  const body = await account.json();
  expect(body.transactions).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "Purchase" })]),
  );
  await page
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  const payment = page.getByRole("dialog", {
    name: "Record Payment",
    exact: true,
  });
  await expect(payment.getByLabel("Type", { exact: true })).toHaveValue("Sent");
  await payment.getByLabel("Amount (PKR)", { exact: true }).fill("80000");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(payment).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeDisabled();
  const payments = await page.request.get(
    "/api/businesses/business-1/payments",
  );
  expect(await payments.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        invoiceId,
        direction: "Sent",
        amountMinor: 8000000,
      }),
    ]),
  );
  await page.goto("/invoices");
  await page.getByLabel("Document type", { exact: true }).selectOption("Supplier");
  await expect(page.getByRole("table", { name: "Invoices", exact: true }).getByText(party.name, { exact: true })).toBeVisible();
  await page.getByLabel("Document type", { exact: true }).selectOption("Customer");
  await expect(page.getByRole("table", { name: "Invoices", exact: true }).getByText(party.name, { exact: true })).toHaveCount(0);
  await page.goto(`/parties/${party.id}`);
  await page.getByRole("button", { name: "Create Bill", exact: true }).click();
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(
    party.id,
  );
  await page.getByLabel("Item 1", { exact: true }).fill("Draft goods");
  await page.getByLabel("Rate 1", { exact: true }).fill("20000");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Draft");
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "More Actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Issue Draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
