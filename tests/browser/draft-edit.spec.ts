import { test, expect } from "./fixture";

for (const kind of ["Customer", "Supplier"] as const) {
  test(`${kind} draft edits preserve its number, preview totals and issue the edited lines`, async ({
    page,
  }) => {
    const base = "/api/businesses/business-1";
    const partyResponse = await page.request.post(`${base}/parties`, {
      data: {
        kind,
        name: `Draft Browser ${kind}`,
        phone: "",
        email: "",
        ntn: "",
        address: "",
        paymentTerms: "Net 30",
      },
    });
    expect(partyResponse.status()).toBe(201);
    const party = await partyResponse.json();
    const input = {
      partyId: party.id,
      date: "2026-11-28",
      dueDate: "2026-12-28",
      reference: "EDIT",
      items: [
        {
          item: "Rice",
          description: "",
          quantity: 2,
          unit: "Bag",
          rate: 100,
          taxPercent: 5,
        },
      ],
      discount: 0,
      amountPaid: 0,
      method: "Cash",
      notes: "",
      terms: "",
      draft: true,
    };
    const created = await page.request.post(`${base}/invoices`, {
      data: input,
    });
    expect(created.status()).toBe(201);
    const invoice = await created.json();
    const path = `/invoices/${invoice.id}`;
    await page.goto(path);
    await page
      .getByRole("button", { name: "More Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit Draft", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}/edit$`));
    await expect(
      page.getByRole("heading", {
        name: kind === "Supplier" ? "Edit Bill Draft" : "Edit Invoice Draft",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Rate 1", { exact: true })).toHaveValue("100");
    await expect(
      page.getByLabel("Amount Paid (PKR)", { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Rate 1", { exact: true }).fill("150");
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
    await page.getByLabel("Item 2", { exact: true }).fill("Oil");
    await page.getByLabel("Rate 2", { exact: true }).fill("50");
    await page.getByLabel("Discount (PKR)", { exact: true }).fill("10");
    await page.getByLabel("Notes", { exact: true }).fill("Edited draft notes");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.getByRole("dialog", {
      name: kind === "Supplier" ? "Bill Preview" : "Invoice Preview",
      exact: true,
    });
    await expect(preview).toContainText(invoice.displayId);
    await expect(
      preview.getByText("PKR 355", { exact: true }).first(),
    ).toBeVisible();
    await preview.getByRole("button", { name: "Close", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Save Changes", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      invoice.displayId,
    );
    const savedResponse = await page.request.get(`${base}${path}`);
    const saved = await savedResponse.json();
    expect(saved).toMatchObject({
      id: invoice.id,
      displayId: invoice.displayId,
      status: "Draft",
      totalMinor: 35500,
      paidMinor: 0,
    });
    expect(saved.items).toHaveLength(2);
    expect(saved.transactionId).toBeUndefined();
    const account = await (
      await page.request.get(`${base}/parties/${party.id}`)
    ).json();
    expect(account.transactions).toHaveLength(0);
    expect(account.payments).toHaveLength(0);
    await page
      .getByRole("button", { name: "More Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Issue Draft", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Record Payment", exact: true }),
    ).toBeEnabled();
    await page.goto(`${path}/edit`);
    await expect(
      page.getByRole("heading", {
        name: "Document already issued",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save Changes", exact: true }),
    ).toHaveCount(0);
  });
}

test("a stale draft edit cannot overwrite another save and Cancel leaves data unchanged", async ({
  page,
}) => {
  const base = "/api/businesses/business-1/invoices";
  const input = {
    partyId: "party-1",
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "CONFLICT",
    items: [
      {
        item: "Goods",
        description: "",
        quantity: 1,
        unit: "Bag",
        rate: 100,
        taxPercent: 0,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
    draft: true,
  };
  const created = await page.request.post(base, { data: input });
  expect(created.status()).toBe(201);
  const invoice = await created.json();
  const path = `/invoices/${invoice.id}`;
  await page.goto(`${path}/edit`);
  await expect(page.getByLabel("Rate 1", { exact: true })).toHaveValue("100");
  await page.getByLabel("Notes", { exact: true }).fill("My unsaved notes");
  const other = await page.request.patch(`${base}/${invoice.id}/draft`, {
    data: {
      data: { ...input, notes: "Other tab saved" },
      revision: invoice.revision,
    },
  });
  expect(other.status()).toBe(200);
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This draft changed" }),
  ).toBeVisible();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "My unsaved notes",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(
    page.getByText("Other tab saved", { exact: true }),
  ).toBeVisible();
});
