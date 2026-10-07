import { test, expect } from "./fixture";

test("team invitation validates, appears in the table and can be removed", async ({
  page,
}, testInfo) => {
  const email = `browser-${testInfo.project.name}@example.com`;
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { name: "Team Members" }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Team members" });
  await expect(table.getByRole("row")).toHaveCount(2);

  await page.getByRole("button", { name: "Invite Member" }).click();
  await expect(
    page.getByRole("heading", { name: "Invite Team Member" }),
  ).toBeVisible();
  await page.getByLabel("Full Name").fill("Browser Test Member");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Select Role").selectOption("Accountant");
  await page.getByRole("button", { name: "Send Invite" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);

  const row = table.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByRole("heading", { name: "Remove team member?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  await expect(table.getByRole("row")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("notifications render Figma groups and linked ledger events", async ({
  page,
}, testInfo) => {
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earlier" })).toBeVisible();
  const linkedNotice = page
    .getByRole("link", { name: "Invoice overdue" })
    .first();
  await expect(linkedNotice).toHaveAttribute("href", /invoices|transactions/);
  await expect(
    page.getByRole("button", { name: "Mark All as Read" }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("notifications.png"),
    fullPage: true,
  });
  await linkedNotice.click();
  await expect(page).toHaveURL(/\/invoices\/INV-012$/);
  await page.goBack();
  await page.getByRole("button", { name: "Mark All as Read" }).click();
  await expect(
    page.getByRole("button", { name: "Mark All as Read" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
