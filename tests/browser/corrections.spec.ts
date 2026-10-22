import { test, expect } from "./fixture";

for (const kind of ["Customer", "Supplier"] as const) {
  test(`${kind} financial correction requires confirmation and preserves paid amount and history`, async ({
    page,
  }) => {
    const base = "/api/businesses/business-1";
    const partyResponse = await page.request.post(`${base}/parties`, {
      data: {
        kind,
        name: `Correction Browser ${kind}`,
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
      reference: "CORRECTION",
      items: [
        {
          item: "Goods",
          description: "",
          quantity: 1,
          unit: "Each",
          rate: 1000,
          taxPercent: 0,
        },
      ],
      discount: 0,
      amountPaid: 200,
      method: "Cash",
      notes: "",
      terms: "",
      draft: false,
    };
    const created = await page.request.post(`${base}/invoices`, {
      data: input,
    });
    expect(created.status()).toBe(201);
    const original = await created.json(),
      path = `/invoices/${original.id}`;
    await page.goto(path);
    await page
      .getByRole("button", { name: "More Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Correct Document", exact: true })
      .click();
    await expect(page.getByLabel(kind, { exact: true })).toBeDisabled();
    await page.getByLabel("Correction reason").fill("Correct agreed unit rate");
    await page.getByLabel("Rate 1", { exact: true }).fill("100");
    await page
      .getByRole("button", { name: "Review Correction", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "cannot be below" }),
    ).toBeVisible();
    await page.getByLabel("Rate 1", { exact: true }).fill("1500");
    await page
      .getByRole("button", { name: "Review Correction", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Confirm Financial Correction",
      exact: true,
    });
    await expect(confirm).toContainText("PKR 1,300");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (await (await page.request.get(`${base}${path}`)).json()).totalMinor,
    ).toBe(100000);
    await page
      .getByRole("button", { name: "Review Correction", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Confirm Correction", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    const saved = await (await page.request.get(`${base}${path}`)).json();
    expect(saved).toMatchObject({
      id: original.id,
      displayId: original.displayId,
      totalMinor: 150000,
      paidMinor: 20000,
      balanceMinor: 130000,
    });
    await expect(
      page.getByRole("table", { name: "Correction history" }),
    ).toContainText("Correct agreed unit rate");
    await page
      .getByRole("button", { name: "View Revision", exact: true })
      .click();
    const revision = page.getByRole("dialog", { name: "Correction Revision" });
    await expect(
      revision.getByText("PKR 1,000", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      revision.getByText("PKR 1,500", { exact: true }).first(),
    ).toBeVisible();
    await revision.getByRole("button", { name: "Close", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("stale financial correction cannot overwrite a newer revision", async ({
  page,
}) => {
  const base = "/api/businesses/business-1/invoices";
  const data = {
    partyId: "party-1",
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "STALE",
    items: [
      {
        item: "Goods",
        description: "",
        quantity: 1,
        unit: "Each",
        rate: 1000,
        taxPercent: 0,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
    draft: false,
  };
  const created = await page.request.post(base, { data });
  expect(created.status()).toBe(201);
  const invoice = await created.json();
  await page.goto(`/invoices/${invoice.id}/correct`);
  await expect(page.getByLabel("Rate 1", { exact: true })).toHaveValue("1000");
  await page.getByLabel("Correction reason").fill("My unsaved correction");
  await page.getByLabel("Rate 1", { exact: true }).fill("1300");
  const other = await page.request.post(`${base}/${invoice.id}/corrections`, {
    data: {
      revision: invoice.revision,
      reason: "Other tab correction",
      effectiveDate: "2026-11-28",
      data: { ...data, notes: "Changed elsewhere" },
    },
  });
  expect(other.status()).toBe(201);
  await page
    .getByRole("button", { name: "Review Correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm Correction", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Reopen the correction" }),
  ).toBeVisible();
  await expect(page.getByLabel("Rate 1", { exact: true })).toHaveValue("1300");
  const saved = await (await page.request.get(`${base}/${invoice.id}`)).json();
  expect(saved.totalMinor).toBe(100000);
  expect(saved.notes).toBe("Changed elsewhere");
});
