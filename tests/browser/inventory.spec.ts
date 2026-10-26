import { test, expect } from "./fixture";
test("inventory opening, physical adjustment, draft and posted sale stay consistent", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Add Product", exact: true });
  await modal.getByLabel("SKU", { exact: true }).fill("RICE-BROWSER");
  await modal.getByLabel("Product name", { exact: true }).fill("Browser Rice");
  await modal.getByLabel("Stock unit", { exact: true }).fill("kg");
  await modal.getByLabel("Opening quantity").fill("10");
  await modal.getByLabel("Low stock threshold").fill("2");
  await modal
    .getByRole("button", { name: "Save Product", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await page.getByRole("link", { name: "Browser Rice", exact: true }).click();
  await expect(
    page.getByText("RICE-BROWSER · On hand: 10 kg", { exact: true }),
  ).toBeVisible();
  const productId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByLabel("Movement type").selectOption("Adjustment out");
  await page.getByLabel("Quantity (kg)", { exact: true }).fill("11");
  await page
    .getByLabel("Reason and document reference")
    .fill("Physical stock count");
  await page
    .getByRole("button", { name: "Review Adjustment", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Confirm Stock Adjustment",
  });
  await confirm.getByRole("button", { name: "Confirm Adjustment" }).click();
  await expect(confirm.getByRole("alert")).toContainText("Insufficient stock");
  await confirm.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Quantity (kg)", { exact: true }).fill("1.25");
  await page
    .getByRole("button", { name: "Review Adjustment", exact: true })
    .click();
  await confirm.getByRole("button", { name: "Confirm Adjustment" }).click();
  await expect(confirm).toBeHidden();
  await expect(
    page.getByText("RICE-BROWSER · On hand: 8.75 kg", { exact: true }),
  ).toBeVisible();
  await page.goto("/invoices/new");
  await page.getByLabel("Customer", { exact: true }).selectOption("party-1");
  await page.getByLabel("Product 1", { exact: true }).selectOption(productId);
  await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
    "Browser Rice",
  );
  await expect(page.getByLabel("Unit 1", { exact: true })).toHaveValue("kg");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByLabel("Rate 1", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/INV-[\da-f-]+$/i);
  let result = await page.request.get(
    `/api/businesses/business-1/inventory/${productId}`,
  );
  expect(Number((await result.json()).product.stock_milli)).toBe(8750);
  await page.getByRole("button", { name: "More Actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Issue Draft", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
    "Draft",
  );
  result = await page.request.get(
    `/api/businesses/business-1/inventory/${productId}`,
  );
  expect(Number((await result.json()).product.stock_milli)).toBe(6750);
  await page.goto(`/inventory/${productId}`);
  await expect(
    page.getByRole("table", { name: "Stock history" }),
  ).toContainText("Sale");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
