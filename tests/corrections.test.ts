import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  correctionPlan,
  type CorrectionInput,
} from "../server/domain/correction";
import { correctionRoutes } from "../server/routes/corrections";
import { errorHandler, ApiError } from "../server/lib/errors";
import type { Auth } from "../server/lib/auth";
import type { DatabasePool } from "../server/db/client";
import type { Invoice } from "../src/types";
import { salesReport } from "../src/domain/ledgerReports";
import { invoiceHtml } from "../server/pdf/invoiceHtml";
import { pdfFixture } from "./helpers/pdfFixture";
const original: Invoice = {
  id: "INV-1",
  displayId: "INV-000020",
  businessId: "b",
  partyId: "p",
  transactionId: "t",
  revision: "123",
  date: "2026-10-10",
  dueDate: "2026-11-10",
  reference: "",
  items: [
    {
      id: "l",
      item: "Goods",
      description: "",
      quantity: 1,
      unit: "Bag",
      rateMinor: 100000,
      taxPercent: 0,
    },
  ],
  subtotalMinor: 100000,
  taxMinor: 0,
  discountMinor: 0,
  totalMinor: 100000,
  paidMinor: 20000,
  balanceMinor: 80000,
  status: "Partial",
  notes: "",
  terms: "",
  daysOverdue: 0,
};
function request(rate = 1500): CorrectionInput {
  return {
    revision: "123",
    reason: "Wrong item rate",
    effectiveDate: "2026-11-28",
    data: {
      partyId: "p",
      date: original.date,
      dueDate: original.dueDate,
      reference: "",
      items: [
        {
          item: "Goods",
          description: "",
          quantity: 1,
          unit: "Bag",
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
  };
}
test("corrections preserve allocated cash, use exact paisa, and allow increase or decrease above paid amount", () => {
  const before = structuredClone(original);
  assert.deepEqual(
    [
      correctionPlan(original, request(), "2026-11-28").deltaMinor,
      correctionPlan(original, request(), "2026-11-28").balanceMinor,
    ],
    [50000, 130000],
  );
  assert.equal(
    correctionPlan(original, request(500), "2026-11-28").balanceMinor,
    30000,
  );
  assert.equal(
    correctionPlan(original, request(200), "2026-11-28").balanceMinor,
    0,
  );
  assert.equal(
    correctionPlan(
      { ...original, status: "Paid", paidMinor: 100000, balanceMinor: 0 },
      request(),
      "2026-11-28",
    ).balanceMinor,
    50000,
  );
  assert.deepEqual(original, before);
});
test("corrections reject below-paid totals, stale reviews, drafts and no-op saves", () => {
  assert.throws(
    () => correctionPlan(original, request(199.99), "2026-11-28"),
    /refund or credit/,
  );
  assert.throws(
    () =>
      correctionPlan(original, { ...request(), revision: "122" }, "2026-11-28"),
    /changed/,
  );
  assert.throws(
    () =>
      correctionPlan({ ...original, status: "Draft" }, request(), "2026-11-28"),
    /Edit Draft/,
  );
  assert.throws(
    () => correctionPlan(original, request(1000), "2026-11-28"),
    /Change at least/,
  );
});
test("corrections cannot move parties, original dates, due dates, cash, or reporting periods", () => {
  for (const changes of [
    { partyId: "other" },
    { date: "2026-10-11" },
    { dueDate: "2026-12-10" },
    { amountPaid: 1 },
    { draft: true },
  ])
    assert.throws(() =>
      correctionPlan(
        original,
        { ...request(), data: { ...request().data, ...changes } },
        "2026-11-28",
      ),
    );
  for (const effectiveDate of ["2026-10-01", "2026-11-29", "2026-02-30"])
    assert.throws(() =>
      correctionPlan(original, { ...request(), effectiveDate }, "2026-11-28"),
    );
  assert.throws(() =>
    correctionPlan(original, { ...request(), reason: " " }, "2026-11-28"),
  );
});
test("sales report keeps signed correction movements in their own month", () => {
  const common = {
    invoiceId: "i",
    displayId: "INV-1",
    party: "Party",
    discountMinor: 0,
    taxMinor: 0,
  };
  const source = [
    {
      ...common,
      id: "original",
      date: "2026-10-10",
      subtotalMinor: 100000,
      totalMinor: 100000,
    },
    {
      ...common,
      id: "correction",
      date: "2026-11-28",
      subtotalMinor: -50000,
      totalMinor: -50000,
    },
  ];
  assert.equal(salesReport("2026-10", source)!.lines.at(-1)!.amount, 1000);
  assert.equal(salesReport("2026-11", source)!.lines.at(-1)!.amount, -500);
});
test("correction history and write APIs require workspace access before database work", async () => {
  for (const status of [401, 404, 200]) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    let touched = false;
    const pool = {
      query() {
        touched = true;
        throw Error("Unexpected access");
      },
      connect() {
        touched = true;
        throw Error("Unexpected access");
      },
    } as unknown as DatabasePool;
    await correctionRoutes(app, pool, {
      async requireMembership() {
        if (status !== 200) throw new ApiError(status, "DENIED", "Denied");
        return { user: { id: "u" } };
      },
    } as unknown as Auth);
    try {
      const r = await app.inject({
        method: "POST",
        url: "/api/businesses/b/invoices/i/corrections",
        payload: {},
      });
      assert.equal(r.statusCode, status === 200 ? 400 : status);
      assert.equal(touched, false);
      if (status !== 200)
        assert.equal(
          (await app.inject("/api/businesses/b/invoices/i/corrections"))
            .statusCode,
          status,
        );
    } finally {
      await app.close();
    }
  }
});
test("corrected invoice PDFs identify adjustments and escape correction reasons", () => {
  const data = pdfFixture();
  data.corrections = [
    { date: "2026-11-28", reason: "<script>bad</script>", deltaMinor: -50000 },
  ];
  const html = invoiceHtml(data, "");
  assert.match(html, /Corrected document/);
  assert.match(html, /&lt;script&gt;bad/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /-500.00/);
});
