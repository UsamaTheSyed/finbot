import { test, expect } from "./fixture";

test("transaction filters render the verified Figma empty state", async ({
  page,
}, testInfo) => {
  await page.goto("/transactions");
  await page.getByLabel("Party", { exact: true }).selectOption("party-1");
  await page.getByLabel("Type", { exact: true }).selectOption("Purchase");

  await expect(
    page.getByRole("heading", { name: "No results found" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Try different keywords or check your spelling to locate the transaction.",
    ),
  ).toBeVisible();
  const icon = page.locator(".empty-state__icon");
  await expect(icon).toHaveCSS("width", "56px");
  await expect(icon).toHaveCSS("height", "56px");
  await expect(
    page.getByRole("button", { name: "Clear Filters" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("transactions-empty-state.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
