import { test, expect } from "./fixture";
test("reminder preview queues explicitly and displays delivery history without a live message", async ({
  page,
}) => {
  let queued = 0;
  await page.route(
    "**/api/businesses/business-1/reminders**",
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path.endsWith("/preview"))
        return route.fulfill({
          json: {
            text: "Ali Enterprise\nPayment reminder\nInvoice INV-001: PKR 1,000.00\nSend /stop to unsubscribe.",
            previewHash: "a".repeat(64),
          },
        });
      if (request.method() === "POST") {
        queued++;
        expect(request.postDataJSON().previewHash).toBe("a".repeat(64));
        return route.fulfill({ status: 201, json: { status: "Queued" } });
      }
      return route.fulfill({
        json: {
          configured: true,
          recipients: [
            {
              id: "party-1",
              name: "Ahmed Khan",
              state: "Connected",
              chat_id: "123456789",
              version: "test-version",
            },
          ],
          logs: queued
            ? [
                {
                  id: "reminder-1",
                  invoice_id: "INV-001",
                  display_id: "INV-001",
                  customer: "Ahmed Khan",
                  status: "Queued",
                  attempts: 0,
                  error_code: null,
                  text: "Payment reminder",
                  created_at: "2026-11-28T10:00:00Z",
                },
              ]
            : [],
        },
      });
    },
  );
  await page.goto("/reminders?invoice=INV-001");
  await expect(
    page.getByRole("heading", { name: "Payment Reminders", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview Reminder", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Confirm Payment Reminder",
    exact: true,
  });
  await expect(dialog).toContainText("PKR 1,000.00");
  expect(queued).toBe(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(queued).toBe(0);
  await page
    .getByRole("button", { name: "Preview Reminder", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Queue Reminder", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(queued).toBe(1);
  await expect(
    page.getByRole("table", { name: "Reminder delivery history" }),
  ).toContainText("Queued");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
