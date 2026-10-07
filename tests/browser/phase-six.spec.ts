import { test, expect } from "./fixture";

test("login validates credentials and opens the protected dashboard", async ({
  page,
}, testInfo) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", {
      name: "Automate your tax, invoices, and cash flow.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign In to FinBot" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await page.getByLabel("Email Address").fill("owner@alienterprise.pk");
  await page.getByLabel("Password", { exact: true }).fill("finbot-demo");
  await page.getByRole("button", { name: "Sign In to FinBot" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.screenshot({
    path: testInfo.outputPath("login-dashboard.png"),
    fullPage: true,
  });
});

test("global search groups linked results from every financial domain", async ({
  page,
}, testInfo) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search...", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Search across FinBot").fill("Ahmed");
  for (const label of ["PARTIES", "INVOICES", "TRANSACTIONS", "PAYMENTS"])
    await expect(page.getByRole("region", { name: label })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("width", "600px");
  await page.screenshot({
    path: testInfo.outputPath("global-search.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Search across FinBot")
    .fill("definitely-no-ledger-match");
  await expect(
    page.getByRole("heading", { name: "No results found" }),
  ).toBeVisible();
  await page.getByLabel("Search across FinBot").fill("Ahmed");
  await page
    .getByRole("option", { name: /Ahmed Khan Customer/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/parties\/party-1$/);
});

test("unknown routes use the verified system-state treatment", async ({
  page,
}) => {
  await page.goto("/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Page Not Found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to Dashboard" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
