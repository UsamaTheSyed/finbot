import { test, expect } from "./fixture";
test("party create, edit, invoice creation and linked payment update the account", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/parties");
  await page.getByRole("button", { name: "Add Party", exact: true }).click();
  const party = page.getByRole("dialog", { name: "Add Party", exact: true });
  await party.getByRole("button", { name: "Add Party", exact: true }).click();
  await expect(
    party.getByText("Name is required", { exact: true }),
  ).toBeVisible();
  await party.getByLabel("Name *", { exact: true }).fill("Sana Test Trading");
  await party.getByLabel("Email", { exact: true }).fill("sana@example.com");
  await party.getByRole("button", { name: "Add Party", exact: true }).click();
  await expect(party).toBeHidden();
  await page
    .getByRole("link", { name: "Sana Test Trading", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit Party", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Party", exact: true });
  await edit.getByLabel("Phone", { exact: true }).fill("03001234567");
  await edit.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("03001234567", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Create Invoice", exact: true })
    .click();
  await page.getByLabel("Item 1", { exact: true }).fill("Rice");
  await page.getByLabel("Quantity 1", { exact: true }).fill("3");
  await page.getByLabel("Rate 1", { exact: true }).fill("100.10");
  await page.getByLabel("Tax 1", { exact: true }).fill("5");
  await page.getByLabel("Discount (PKR)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Invoice Preview" });
  await expect(preview.getByText("PKR 305.32").first()).toBeVisible();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Create Invoice", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/invoices\/INV-(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  await page
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  const payment = page.getByRole("dialog", {
    name: "Record Payment",
    exact: true,
  });
  await payment.getByLabel("Amount (PKR)", { exact: true }).fill("306");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(
    payment.getByText("Payment cannot exceed the outstanding balance."),
  ).toBeVisible();
  await payment.getByLabel("Amount (PKR)", { exact: true }).fill("305.32");
  await payment
    .getByLabel("Payment Method", { exact: true })
    .selectOption("JazzCash");
  await payment
    .getByRole("button", { name: "Record Payment", exact: true })
    .click();
  await expect(payment).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("table", { name: "Payment history" }).getByText("JazzCash"),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View Sana Test Trading's account" })
    .click();
  await expect(page.getByText("PKR 0").first()).toBeVisible();
  await page.getByRole("tab", { name: "Statement", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Account statement" }).getByRole("row"),
  ).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath("party-detail.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("drafts stay unposted until issued and payment filters work", async ({
  page,
}, testInfo) => {
  await page.goto("/invoices/new");
  await page.getByLabel("Customer", { exact: true }).selectOption("party-1");
  await page.getByLabel("Item 1", { exact: true }).fill("Draft goods");
  await page.getByLabel("Rate 1", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page).toHaveURL(
    /\/invoices\/INV-(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "More Actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Issue Draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Record Payment", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Payments", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Pending", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Payments", exact: true }).getByRole("row"),
  ).toHaveCount(2);
  await page.getByLabel("Party", { exact: true }).selectOption("party-1");
  await expect(
    page.getByRole("heading", { name: "No payments recorded" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("tab", { name: "All Payments", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 5", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("payments.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("new routes show missing records and retain navigation", async ({
  page,
}, testInfo) => {
  for (const path of ["/parties/missing", "/invoices/missing"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Record not found", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to list" }).click();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  }
  await page.goto("/invoices");
  await page.getByRole("tab", { name: "Draft", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Invoices", exact: true }).getByRole("row"),
  ).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath("invoices.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
