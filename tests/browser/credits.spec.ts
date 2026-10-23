import { test, expect } from "./fixture";
for (const kind of ["Customer", "Supplier"] as const)
  test(`${kind} credit note, refund and credit application preserve original invoice and cash`, async ({
    page,
  }) => {
    test.setTimeout(60000); // Multiple confirmed mutations and navigation steps share this test budget.
    const base = "/api/businesses/business-1";
    const p = await page.request.post(`${base}/parties`, {
      data: {
        kind,
        name: `Credit Browser ${kind}`,
        phone: "",
        email: "",
        ntn: "",
        address: "",
        paymentTerms: "Net 30",
      },
    });
    expect(p.status()).toBe(201);
    const party = await p.json();
    const input = {
      partyId: party.id,
      date: "2026-11-28",
      dueDate: "2026-12-28",
      reference: "CREDIT",
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
      amountPaid: 800,
      method: "Cash",
      notes: "",
      terms: "",
      draft: false,
    };
    const result = await page.request.post(`${base}/invoices`, { data: input });
    expect(result.status()).toBe(201);
    const invoice = await result.json();
    await page.goto(`/invoices/${invoice.id}`);
    await expect(
      page.getByRole("button", { name: "Print (coming later)", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Send Reminder (coming later)",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "More Actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Record Credit Note", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Record Credit Note",
      exact: true,
    });
    await dialog.getByLabel("Credit subtotal (PKR)").fill("500");
    await dialog
      .getByLabel("Reason", { exact: true })
      .fill("Goods returned by agreement");
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: "Confirm Record Credit Note",
      exact: true,
    });
    await expect(confirmation).toContainText(
      "Available credit created PKR 300",
    );
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(
      (
        await (
          await page.request.get(`${base}/parties/${party.id}/credits`)
        ).json()
      ).notes,
    ).toHaveLength(0);
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("table", { name: "Credit notes", exact: true }),
    ).toContainText("Goods returned by agreement");
    const saved = await (
      await page.request.get(`${base}/invoices/${invoice.id}`)
    ).json();
    expect(saved).toMatchObject({
      totalMinor: 100000,
      creditedMinor: 50000,
      netTotalMinor: 50000,
      paidMinor: 50000,
      balanceMinor: 0,
    });
    await page.goto(`/invoices/${invoice.id}/correct`);
    await expect(
      page.getByText(
        "Corrections are unavailable because this document has credit history. Existing records are preserved.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Correction reason")).toHaveCount(0);
    await page.goto(`/parties/${party.id}`);
    if (kind === "Supplier")
      await expect(
        page.getByRole("button", { name: "Record Sale", exact: true }),
      ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Record Refund", exact: true })
      .click();
    const refund = page.getByRole("dialog", {
      name: "Record Refund",
      exact: true,
    });
    await expect(refund.getByLabel("Direction")).toHaveValue(
      kind === "Customer"
        ? "Sent — customer refund"
        : "Received — supplier refund",
    );
    await refund.getByLabel("Amount (PKR)").fill("301");
    await refund
      .getByLabel("Reason", { exact: true })
      .fill("Actual cash refund");
    await refund.getByRole("button", { name: "Review", exact: true }).click();
    await expect(refund.getByRole("alert")).toContainText(
      "within available credit",
    );
    await refund.getByLabel("Amount (PKR)").fill("100");
    await refund.getByRole("button", { name: "Review", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Confirm Record Refund", exact: true })
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(refund).toBeHidden();
    const next = await page.request.post(`${base}/invoices`, {
      data: {
        ...input,
        amountPaid: 0,
        items: [{ ...input.items[0], rate: 500 }],
      },
    });
    expect(next.status()).toBe(201);
    const target = await next.json();
    await page.reload();
    await page
      .getByRole("button", { name: "Apply Credit", exact: true })
      .click();
    const apply = page.getByRole("dialog", {
      name: "Apply Credit",
      exact: true,
    });
    await apply.getByLabel("Apply to document").selectOption(target.id);
    await apply.getByLabel("Amount (PKR)").fill("200");
    await apply
      .getByLabel("Reason", { exact: true })
      .fill("Apply remaining credit");
    await apply.getByRole("button", { name: "Review", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Confirm Apply Credit", exact: true })
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(apply).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Record Refund", exact: true }),
    ).toBeDisabled();
    expect(
      (await (await page.request.get(`${base}/invoices/${target.id}`)).json())
        .balanceMinor,
    ).toBe(30000);
    const payments = await (await page.request.get(`${base}/payments`)).json();
    const rows = payments.filter(
      (p: { partyId: string }) => p.partyId === party.id,
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.some(
        (p: { direction: string; amountMinor: number }) =>
          p.direction === (kind === "Customer" ? "Sent" : "Received") &&
          p.amountMinor === 10000,
      ),
    ).toBe(true);
    await page.goto(`/invoices/${target.id}`);
    await page
      .getByRole("button", { name: "More Actions", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Correct Document", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("unpaid credit reduces debt without enabling a cash refund", async ({
  page,
}) => {
  const base = "/api/businesses/business-1";
  const p = await page.request.post(`${base}/parties`, {
    data: {
      kind: "Customer",
      name: "Unpaid Credit Browser",
      phone: "",
      email: "",
      ntn: "",
      address: "",
      paymentTerms: "Net 30",
    },
  });
  expect(p.status()).toBe(201);
  const party = await p.json();
  const r = await page.request.post(`${base}/invoices`, {
    data: {
      partyId: party.id,
      date: "2026-11-28",
      dueDate: "2026-12-28",
      reference: "",
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
    },
  });
  expect(r.status()).toBe(201);
  const invoice = await r.json();
  await page.goto(`/invoices/${invoice.id}`);
  await page.getByRole("button", { name: "More Actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Record Credit Note", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record Credit Note",
    exact: true,
  });
  await dialog.getByLabel("Credit subtotal (PKR)").fill("200");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Credit unpaid goods");
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Confirm Record Credit Note",
    exact: true,
  });
  await expect(confirm).toContainText("Available credit created PKR 0");
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto(`/parties/${party.id}`);
  await expect(
    page.getByRole("button", { name: "Record Refund", exact: true }),
  ).toBeDisabled();
  expect(
    (await (await page.request.get(`${base}/invoices/${invoice.id}`)).json())
      .balanceMinor,
  ).toBe(80000);
});
