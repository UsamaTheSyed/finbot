import { test, expect } from "./fixture";
test("verified cutover, dispatched COGS, journal balances and CSV retain the desktop layout", async ({
  page,
}) => {
  test.setTimeout(60000);
  const base = "/api/businesses/business-1";
  const product = await page.request.post(base + "/inventory", {
    data: {
      sku: "COGS-QA",
      name: "COGS test rice",
      unit: "Each",
      opening: 10,
      openingValueMinor: 1000000,
      minimum: 0,
      date: "2026-11-28",
    },
  });
  expect(product.status()).toBe(201);
  const p = await product.json();
  const response = await page.request.get(
    base + "/accounting/preview?date=2026-11-28",
  );
  expect(response.ok()).toBe(true);
  const opening = await response.json();
  expect(opening.blockers).toEqual([]);
  await page.goto("/accounting");
  await page
    .getByRole("button", { name: "Load Opening Preview", exact: true })
    .click();
  for (const [key, label] of [
    ["cash", "Cash / bank"],
    ["customer", "Customer control"],
    ["supplier", "Supplier control"],
    ["inventory", "Inventory"],
    ["inputTax", "Input tax control"],
    ["outputTax", "Output tax control"],
  ])
    await page
      .getByLabel(`Verified ${label} (PKR)`, { exact: true })
      .fill(String((opening[key] || 0) / 100));
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Review Accounting Activation", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Activate Accounting", exact: true })
    .getByRole("button", { name: "Confirm Activation", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "General ledger balances", exact: true }),
  ).toBeVisible();
  const sale = await page.request.post(base + "/invoices", {
    data: {
      partyId: "party-1",
      date: "2026-11-28",
      dueDate: "2026-12-28",
      reference: "COGS browser verification",
      items: [
        {
          productId: p.id,
          item: "COGS test rice",
          description: "",
          quantity: 4,
          unit: "Each",
          rate: 1500,
          taxPercent: 0,
        },
      ],
      discount: 0,
      amountPaid: 0,
      method: "Cash",
      notes: "",
      terms: "",
      draft: false,
    },
  });
  expect(sale.status()).toBe(201);
  const report = await (
    await page.request.get(base + "/reports/profit-loss?period=2026-11")
  ).json();
  expect(
    report.lines.find(
      (l: { label: string }) => l.label === "Cost of Goods Sold",
    ).amount,
  ).toBe(4000);
  expect(report.lines.at(-1).amount).toBe(2000);
  await page.reload();
  const balances = page.getByRole("table", {
    name: "General ledger balances",
    exact: true,
  });
  await expect(
    balances
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", {
          name: "Cost of goods sold",
          exact: true,
        }),
      }),
  ).toContainText("4,000.00");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export General Ledger CSV", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe(
    "finbot-general-ledger-2026-11-01-2026-11-28.csv",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Open Profit & Loss", exact: true })
    .click();
  await expect(
    page.getByText("Cost of Goods Sold", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
