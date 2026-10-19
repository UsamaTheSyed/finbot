import { test, expect } from "./fixture";
import { readFile } from "node:fs/promises";
test("statement carries advance, filters dates and downloads the same period", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const base = "/api/businesses/business-1";
  const created = await page.request.post(`${base}/parties`, {
    data: {
      kind: "Customer",
      name: "Statement Browser Customer",
      phone: "",
      email: "",
      ntn: "",
      address: "Karachi",
      paymentTerms: "Net 30",
    },
  });
  expect(created.status()).toBe(201);
  const party = await created.json();
  const invoice = async (date: string, rate: number) => {
    const response = await page.request.post(`${base}/invoices`, {
      data: {
        partyId: party.id,
        date,
        dueDate: "2026-12-28",
        reference: "Statement check",
        items: [
          {
            item: "Goods",
            description: "",
            quantity: 1,
            unit: "Each",
            rate,
            taxPercent: 0,
          },
        ],
        discount: 0,
        amountPaid: 0,
        method: "Cash",
        notes: "",
        terms: "",
        draft: false,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
  };
  await invoice("2026-10-10", 40000);
  const payment = await page.request.post(`${base}/payments`, {
    data: {
      partyId: party.id,
      invoiceId: "",
      direction: "Received",
      amount: 50000,
      allocationMode: "fifo",
      method: "Cash",
      date: "2026-10-11",
      reference: "Advance",
      notes: "",
    },
  });
  expect(payment.status(), await payment.text()).toBe(201);
  await invoice("2026-10-20", 20000);
  const url = `${base}/parties/${party.id}/statement`;
  const snapshot = await page.request.get(
    `${url}?from=2026-10-12&to=2026-10-19`,
  );
  expect(snapshot.ok()).toBe(true);
  const statement = await snapshot.json();
  expect(statement.openingMinor).toBe(-1000000);
  expect(statement.closingMinor).toBe(-1000000);
  expect(statement.rows).toHaveLength(0);
  await page.goto("/reports?period=2026-10");
  await page
    .getByRole("link", { name: "View Customer Statement", exact: true })
    .click();
  await page.getByRole("link", { name: party.name, exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Statement", exact: true }),
  ).toHaveAttribute("data-state", "active");
  await page.getByLabel("Statement start date").fill("2026-10-12");
  await page.getByLabel("Statement end date").fill("2026-10-19");
  const table = page.getByRole("table", {
    name: "Account statement",
    exact: true,
  });
  await expect(
    table.getByText("No account activity in this period.", { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("row").filter({ hasText: "Closing Balance" }),
  ).toContainText("-10,000");
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Statement", exact: true })
    .click();
  const download = await waiting;
  expect(download.suggestedFilename()).toContain("2026-10-12-2026-10-19.pdf");
  expect(
    (await readFile((await download.path())!)).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  const after = await page.request.get(`${url}?from=2026-10-12&to=2026-10-19`);
  expect(await after.json()).toEqual(statement);
  await page.getByLabel("Statement start date").fill("2026-10-20");
  await expect(
    page.getByText("Start date must not be after end date", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Statement", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(
    table.getByRole("row").filter({ hasText: "Closing Balance" }),
  ).toContainText("10,000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
