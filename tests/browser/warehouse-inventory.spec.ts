import { test, expect } from "./fixture";
test("warehouses, unit conversions, transfers and counts preserve stock", async ({
  page,
}) => {
  test.setTimeout(90000);
  const base = "/api/businesses/business-1";
  const r = await page.request.post(base + "/inventory", {
    data: {
      sku: "WH-RICE",
      name: "Warehouse Rice",
      unit: "kg",
      opening: 10,
      openingValueMinor: 100000,
      minimum: 2,
      date: "2026-11-28",
    },
  });
  expect(r.status()).toBe(201);
  const p = await r.json();
  await page.goto(`/inventory/${p.id}`);
  await page.getByLabel("Alternate unit", { exact: true }).fill("Bag");
  await page.getByLabel("Base units per alternate unit").fill("10");
  await page
    .getByRole("button", { name: "Add Conversion", exact: true })
    .click();
  await expect(page.getByText("1 Bag = 10 kg", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Warehouses", exact: true }).click();
  await page.getByLabel("Warehouse name").fill("Shop");
  await page
    .getByRole("button", { name: "Add Warehouse", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Shop", exact: true }),
  ).toBeVisible();
  const overview = await (await page.request.get(base + "/stock")).json();
  const w = overview.warehouses.find(
    (x: { name: string }) => x.name === "Shop",
  );
  await page
    .getByRole("link", { name: "Stock Operations", exact: true })
    .click();
  await page.getByLabel("Operation", { exact: true }).selectOption("Transfer");
  await page.getByLabel("Product", { exact: true }).selectOption(p.id);
  await page
    .getByLabel("Warehouse", { exact: true })
    .selectOption("main:business-1");
  await page.getByLabel("Destination warehouse").selectOption(w.id);
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByLabel("Reason", { exact: true }).fill("Move goods to shop");
  await page
    .getByRole("button", { name: "Review Operation", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Confirm Stock Operation" });
  await modal.getByRole("button", { name: "Confirm Operation" }).click();
  await expect(modal).toBeHidden();
  await page.getByLabel("Operation", { exact: true }).selectOption("Count");
  await page.getByLabel("Warehouse", { exact: true }).selectOption(w.id);
  await page.getByLabel("Counted quantity").fill("2");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("One damaged unit removed");
  await page
    .getByRole("button", { name: "Review Operation", exact: true })
    .click();
  await modal.getByRole("button", { name: "Confirm Operation" }).click();
  await expect(modal).toBeHidden();
  const after = await (
    await page.request.get(base + "/inventory/" + p.id)
  ).json();
  expect(Number(after.product.stock_milli)).toBe(9000);
  await page.getByRole("link", { name: "Stock Reports", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Stock valuation", exact: true }),
  ).toContainText("Warehouse Rice");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Stock CSV" }).click();
  expect((await download).suggestedFilename()).toContain("finbot-stock-");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("deferred bill receipt and sale reservation dispatch use existing invoice forms", async ({
  page,
}) => {
  test.setTimeout(90000);
  const base = "/api/businesses/business-1";
  const r = await page.request.post(base + "/inventory", {
    data: {
      sku: "DEFERRED-RICE",
      name: "Deferred Rice",
      unit: "kg",
      opening: 0,
      minimum: 0,
      date: "2026-11-28",
    },
  });
  expect(r.status()).toBe(201);
  const p = await r.json();
  await page.goto("/invoices/new?kind=Supplier");
  // Use the existing New Bill entry point so the product's route convention stays authoritative.
  await page.goto("/invoices");
  await page.getByRole("button", { name: "New Bill", exact: true }).click();
  await page.getByLabel("Supplier", { exact: true }).selectOption("party-4");
  await page.getByLabel("Product 1", { exact: true }).selectOption(p.id);
  await page.getByLabel("Quantity 1", { exact: true }).fill("10");
  await page.getByLabel("Rate 1", { exact: true }).fill("100");
  await page.getByLabel("Stock fulfilment").selectOption("Deferred");
  await page.getByRole("button", { name: "Create Bill", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/INV-[\da-f-]+$/i);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await page.goto("/inventory/operations");
  await page.getByLabel("Document line").selectOption(`${id}:${p.id}`);
  await page.getByLabel("Quantity", { exact: true }).fill("6");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Partial delivery received");
  await page.getByRole("button", { name: "Review Operation" }).click();
  let modal = page.getByRole("dialog", { name: "Confirm Stock Operation" });
  await modal.getByRole("button", { name: "Confirm Operation" }).click();
  await expect(modal).toBeHidden();
  await page.goto("/invoices/new");
  await page.getByLabel("Customer", { exact: true }).selectOption("party-1");
  await page.getByLabel("Product 1", { exact: true }).selectOption(p.id);
  await page.getByLabel("Quantity 1", { exact: true }).fill("4");
  await page.getByLabel("Rate 1", { exact: true }).fill("150");
  await page.getByLabel("Stock fulfilment").selectOption("Deferred");
  await page
    .getByRole("button", { name: "Create Invoice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/invoices\/INV-[\da-f-]+$/i);
  const sale = new URL(page.url()).pathname.split("/").at(-1);
  await page.goto("/inventory/operations");
  for (const kind of ["Reserve", "Dispatch"]) {
    await page.getByLabel("Operation", { exact: true }).selectOption(kind);
    await page.getByLabel("Document line").selectOption(`${sale}:${p.id}`);
    await page.getByLabel("Quantity", { exact: true }).fill("4");
    await page
      .getByLabel("Reason", { exact: true })
      .fill("Customer collection order");
    await page.getByRole("button", { name: "Review Operation" }).click();
    modal = page.getByRole("dialog", { name: "Confirm Stock Operation" });
    await modal.getByRole("button", { name: "Confirm Operation" }).click();
    await expect(modal).toBeHidden();
  }
  const stock = await (await page.request.get(base + "/stock")).json();
  const balance = stock.balances.find(
    (x: { product_id: string }) => x.product_id === p.id,
  );
  expect(Number(balance.quantity_milli)).toBe(2000);
  expect(Number(balance.reserved_milli)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
