import { test, expect } from "./fixture";
test("Telegram settings uses one-time link, refreshes status and confirms disconnect", async ({
  page,
}) => {
  let connected = false,
    deleted = 0;
  await page.route("**/api/businesses/*/bot/telegram", async (route) => {
    if (route.request().method() === "DELETE") {
      connected = false;
      deleted++;
      await route.fulfill({ status: 204 });
    } else
      await route.fulfill({
        json: { connected, configured: true, username: "finbot_test_bot" },
      });
  });
  await page.route("**/api/businesses/*/bot/telegram/link", (route) =>
    route.fulfill({
      json: {
        token: "fake-test-token",
        url: "https://t.me/finbot_test_bot?start=fake-test-token",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      },
    }),
  );
  await page.goto("/settings");
  const card = page
    .locator(".integration-card")
    .filter({
      has: page.getByRole("heading", { name: "Telegram Bot", exact: true }),
    });
  await card.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    card.getByRole("link", { name: "Open Telegram to finish linking" }),
  ).toHaveAttribute("href", /start=fake-test-token$/);
  connected = true;
  await card.getByRole("button", { name: "Check status" }).click();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Disconnect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect Telegram" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deleted).toBe(0);
  await card.getByRole("button", { name: "Disconnect", exact: true }).click();
  await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(card.getByText("Not Connected", { exact: true })).toBeVisible();
  expect(deleted).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
