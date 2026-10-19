import { test, expect } from "./fixture";

test("dashboard sale and customer Record Sale reuse invoice creation and refresh the ledger", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const base = "/api/businesses/business-1";
  const created = await page.request.post(`${base}/parties`, {
    data: {
      kind: "Customer",
      name: "Quick Sale Customer",
      phone: "",
      email: "",
      ntn: "",
      address: "Karachi",
      paymentTerms: "Net 30",
    },
  });
  expect(created.status()).toBe(201);
  const party = await created.json();
  const before = await page.request.get(`${base}/reports`);
  expect(before.ok()).toBe(true);
  const baseline = (await before.json())[0];
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "+ Sale", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/new\?kind=Customer$/);
  await expect(
    page.getByRole("heading", { name: "New Invoice", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Customer", { exact: true }).selectOption(party.id);
  await page.getByLabel("Item 1", { exact: true }).fill("Quick sale goods");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByLabel("Rate 1", { exact: true }).fill("500");
  await page
    .getByRole("button", { name: "Create Invoice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/invoices\/INV-[\da-f-]+$/i);
  const account = await page.request.get(`${base}/parties/${party.id}`);
  expect(account.ok()).toBe(true);
  const data = await account.json();
  expect(data.party.balanceMinor).toBe(100000);
  expect(data.transactions).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "Sale" })]),
  );
  expect(data.invoices).toHaveLength(1);
  expect(data.invoices[0].totalMinor).toBe(100000);
  const after = await page.request.get(`${base}/reports`);
  expect(after.ok()).toBe(true);
  expect((await after.json())[0].receivable).toBe(baseline.receivable + 1000);
  await page
    .getByRole("link", { name: "Dashboard", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("table", { name: "Recent transactions", exact: true })
      .getByText(party.name, { exact: true }),
  ).toBeVisible();
  await page.goto(`/parties/${party.id}`);
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/invoices/new" &&
      url.searchParams.get("party") === party.id &&
      url.searchParams.get("kind") === "Customer",
  );
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(
    party.id,
  );
});
