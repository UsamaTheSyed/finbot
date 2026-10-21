import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { invoiceService } from "../src/services/invoiceService";
import { partyService } from "../src/services/partyService";
import { transactions, payments, invoices } from "../src/services/mock/data";
import type { InvoiceInput } from "../src/domain/validation";
import { invoiceRoutes } from "../server/routes/invoices";
import { ApiError, errorHandler } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";

for (const kind of ["Customer", "Supplier"] as const) {
  test(`${kind} draft editing preserves identity, rejects stale edits and stays unposted until issue`, async () => {
    const party = await partyService.createParty("business-1", {
      kind,
      name: `Edit ${kind}`,
      phone: "",
      email: "",
      ntn: "",
      address: "",
      paymentTerms: "Net 30",
    });
    const input: InvoiceInput = {
      partyId: party.id,
      date: "2026-11-28",
      dueDate: "2026-12-28",
      reference: "draft",
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
    };
    const draft = await invoiceService.createInvoice("business-1", input, true);
    const stored = invoices.find((i) => i.id === draft.id)!;
    stored.displayId = "INV-EDIT-TEST";
    const ledgerBefore = JSON.stringify({ transactions, payments });
    const replacement = {
      ...input,
      discount: 10,
      notes: "Updated note",
      items: [
        { ...input.items[0], rate: 150 },
        {
          ...input.items[0],
          item: "Oil",
          quantity: 1,
          rate: 50,
          taxPercent: 0,
        },
      ],
    };
    const edited = await invoiceService.saveDraft(
      "business-1",
      draft.id,
      replacement,
      "0",
    );
    assert.equal(edited.id, draft.id);
    assert.equal(edited.displayId, "INV-EDIT-TEST");
    assert.equal(edited.totalMinor, 35500);
    assert.equal(edited.status, "Draft");
    assert.equal(edited.paidMinor, 0);
    assert.equal(edited.transactionId, undefined);
    assert.equal(JSON.stringify({ transactions, payments }), ledgerBefore);
    await assert.rejects(
      invoiceService.saveDraft("business-1", draft.id, input, "0"),
      /changed/,
    );
    await assert.rejects(
      invoiceService.saveDraft(
        "business-1",
        draft.id,
        { ...replacement, amountPaid: 1 },
        edited.revision!,
      ),
      /draft cannot record/,
    );
    await assert.rejects(
      invoiceService.saveDraft(
        "business-2",
        draft.id,
        replacement,
        edited.revision!,
      ),
    );
    assert.equal(
      (await invoiceService.getInvoiceById("business-1", draft.id)).totalMinor,
      35500,
    );
    const issued = await invoiceService.updateInvoice(
      "business-1",
      draft.id,
      replacement,
      false,
      edited.revision,
    );
    assert.equal(issued.displayId, "INV-EDIT-TEST");
    assert.equal(
      transactions.find((t) => t.id === issued.transactionId)?.type,
      kind === "Supplier" ? "Purchase" : "Sale",
    );
    await assert.rejects(
      invoiceService.saveDraft(
        "business-1",
        draft.id,
        replacement,
        edited.revision!,
      ),
      /Only drafts/,
    );
  });
}

test("draft endpoint requires membership and a revision before database access", async () => {
  let touched = false;
  const pool = {
    connect() {
      touched = true;
      throw Error("Unexpected database access");
    },
  } as unknown as DatabasePool;
  for (const status of [401, 404, 200]) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await invoiceRoutes(app, pool, {
      async requireMembership() {
        if (status !== 200) throw new ApiError(status, "DENIED", "Denied");
        return { user: { id: "test" } };
      },
    } as unknown as Auth);
    try {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/businesses/business-1/invoices/INV-test/draft",
        payload: { data: {} },
      });
      assert.equal(response.statusCode, status === 200 ? 400 : status);
      assert.equal(touched, false);
    } finally {
      await app.close();
    }
  }
});
