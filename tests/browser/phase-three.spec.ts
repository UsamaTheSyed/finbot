import { test, expect } from "./fixture";
test("report navigation, periods and CSV export", async ({
  page,
}, testInfo) => {
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Financial Reports" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reports-overview.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "View Daily Summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily Cash & Sales Summary" }),
  ).toBeVisible();
  await page.getByLabel("Report date").fill("2027-01-01");
  await expect(
    page.getByRole("heading", { name: "No report data for this period" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show current period" }).click();
  await expect(page.getByLabel("Report date")).toHaveValue("2026-11-28");
  await page.screenshot({
    path: testInfo.outputPath("reports-daily.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Report navigation" })
    .getByRole("link", { name: "A/R Aging", exact: true })
    .click();
  const table = page.getByRole("table", { name: "A/R Aging", exact: true });
  await expect(table.getByRole("row")).toHaveCount(5);
  await expect(table.getByText("PKR 79,500", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("finbot-ar-aging-2026-11.csv");
  await page.screenshot({
    path: testInfo.outputPath("reports-aging.png"),
    fullPage: true,
  });
});
test("profit and cash reports render charts, empty states and usable laptop layouts", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/reports/profit-loss");
  await expect(
    page.getByRole("heading", { name: "Statement of Accounts" }),
  ).toBeVisible();
  await expect(page.getByText("PKR 28,500", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reports-profit.png"),
    fullPage: true,
  });
  await page.getByLabel("Reporting month").fill("2027-01");
  await expect(
    page.getByRole("heading", { name: "No report data for this period" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show current period" }).click();
  await page
    .getByRole("navigation", { name: "Report navigation" })
    .getByRole("link", { name: "Cash Flow", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Cash Flow Ledger" }).getByRole("row"),
  ).toHaveCount(26);
  await expect(
    page.getByText("PKR 500,000", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reports-cash.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("business settings validate, save within the session and reject invalid logos", async ({
  page,
}, testInfo) => {
  await page.goto("/settings");
  await expect(page.getByLabel("Business Name")).toHaveValue("Ali Enterprise");
  await page.getByLabel("Business Name").fill("");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Business name is required")).toBeVisible();
  await page.getByLabel("Business Name").fill("Usama Trading");
  await page.getByLabel("Upload Business Logo", { exact: true }).setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByText("Choose a PNG or JPG up to 5MB.")).toBeVisible();
  await page.getByLabel("Upload Business Logo", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("button", { name: "Remove logo" })).toBeVisible();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(
    page.getByText("Business profile saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Dashboard", exact: true })
    .first()
    .click();
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Business Name")).toHaveValue("Usama Trading");
  await page.screenshot({
    path: testInfo.outputPath("settings-profile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
