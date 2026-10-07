import { test, expect, type Page } from "./fixture";

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("dashboard, filters, pagination and transaction navigation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await test.step("Dashboard renders without page overflow", async () => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("table", { name: "Recent transactions", exact: true }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("dashboard.png"),
      fullPage: true,
    });
  });
  await test.step("Transactions navigate to page two", async () => {
    await page.getByRole("link", { name: "View All", exact: true }).click();
    await expect(page.getByText("Page 1 of 5", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of 5", { exact: true })).toBeVisible();
  });
  await test.step("Combined filters return the Ahmed Khan transaction", async () => {
    await page.getByLabel("Party", { exact: true }).selectOption("party-1");
    await page.getByLabel("Type", { exact: true }).selectOption("Sale");
    await page.getByLabel("Date Range", { exact: true }).selectOption("recent");
    await page.getByLabel("Status", { exact: true }).selectOption("Partial");
    // Keep the rapid sequence above: delays between selections could mask a race.
    await expect(page.getByLabel("Party", { exact: true })).toHaveValue(
      "party-1",
    );
    await expect(page.getByLabel("Type", { exact: true })).toHaveValue("Sale");
    await expect(page.getByLabel("Date Range", { exact: true })).toHaveValue(
      "recent",
    );
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
      "Partial",
    );
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("date") === "recent" &&
        url.searchParams.get("partyId") === "party-1" &&
        url.searchParams.get("type") === "Sale" &&
        url.searchParams.get("status") === "Partial" &&
        !url.searchParams.has("page"),
    );
    const table = page.getByRole("table", {
      name: "Transactions",
      exact: true,
    });
    await expect(table.getByRole("row")).toHaveCount(2);
  });
  await test.step("Transaction detail opens without page overflow", async () => {
    await page
      .getByRole("link", { name: "View SALE-000128 for Ahmed Khan" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Invoice SALE-000128 Partial" }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("transaction-detail.png"),
      fullPage: true,
    });
  });
  expect(errors).toEqual([]);
});

test("edit, validate payment, settle balance, and confirm deletion", async ({
  page,
}) => {
  // page.on("response", async (response) => {
  //   if (response.request().method() === "DELETE") {
  //     console.log(
  //       `DELETE_DEBUG=${JSON.stringify({
  //         url: response.url(),
  //         status: response.status(),
  //         body: await response.text(),
  //       })}`,
  //     );
  //   }
  // });
  await page.goto("/transactions/SALE-000128");
  await page
    .getByRole("button", { name: "Edit Transaction", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit Transaction" });
  await edit.getByLabel("Notes").fill("Browser verification note");
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(edit).toBeHidden();
  await expect(
    page.getByText("Browser verification note", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  const payment = page.getByRole("dialog", { name: "Record Payment" });
  await payment.getByLabel("Amount (PKR)").fill("17001");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(payment).toBeVisible();
  await payment.getByLabel("Amount (PKR)").fill("17000");
  await payment.getByLabel("Payment Method").selectOption("JazzCash");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(payment).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Invoice SALE-000128 Completed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete Transaction" });
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("link", { name: "View SALE-000128 for Ahmed Khan" }),
  ).toHaveCount(0);
});

test("keyboard search, notifications, workspace and empty states", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Select workspace", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Ali Enterprise", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Global Search" });
  const input = search.getByRole("combobox");
  await input.fill("zzzz-no-record");
  await expect(
    search.getByText("No results found", { exact: true }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await input.fill("SALE-000128");
  await expect(search.getByRole("option")).toHaveCount(1);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/transactions\/SALE-000128$/);
  await expect(search).toBeHidden();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await page.getByRole("button", { name: /Payment recorded.*25,000/ }).click();
  await expect(
    page.getByRole("heading", { name: "Payment Breakdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Toggle sidebar" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  await page.goto("/transactions/not-a-record");
  await expect(
    page.getByRole("heading", { name: "Transaction not found" }),
  ).toBeVisible();
});
