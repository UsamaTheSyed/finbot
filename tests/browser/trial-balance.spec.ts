import { test, expect } from "./fixture";
test("trial balance uses cutover balances, blocks earlier dates and exports CSV", async ({
  page,
}) => {
  test.setTimeout(60000);
  const base = "/api/businesses/business-1/accounting";
  await page.goto("/reports");
  await page
    .getByRole("link", { name: "View Trial Balance", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open Accounting Settings", exact: true }),
  ).toBeVisible();
  const response = await page.request.get(base + "/preview?date=2026-11-28");
  expect(response.ok()).toBe(true);
  const opening = await response.json();
  expect(opening.blockers).toEqual([]);
  const activation = await page.request.post(base + "/activate", {
    data: {
      date: opening.date,
      token: opening.token,
      cash: opening.cash,
      inventory: opening.inventory,
      customer: opening.customer,
      supplier: opening.supplier,
      inputTax: 0,
      outputTax: 0,
      confirmed: true,
    },
  });
  expect(activation.ok()).toBe(true);
  await page.reload();
  const table = page.getByRole("table", { name: "Trial Balance", exact: true });
  await expect(table).toBeVisible();
  await expect(
    page.getByText("Balanced — debit and credit totals match.", {
      exact: false,
    }),
  ).toBeVisible();
  const ledger = await (
    await page.request.get(base + "?from=2026-11-28&to=2026-11-28")
  ).json();
  for (const account of ledger.accounts) {
    const row = table
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", {
          name: account.account,
          exact: true,
        }),
      });
    await expect(
      row.getByRole("cell").nth(account.closing >= 0 ? 0 : 1),
    ).toHaveText(
      (Math.abs(account.closing) / 100).toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "finbot-trial-balance-2026-11-28.csv",
  );
  await page.getByLabel("As of date").fill("2026-11-27");
  await expect(table).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Trial Balance is available from", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("As of date").fill("2026-11-28");
  await expect(table).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
