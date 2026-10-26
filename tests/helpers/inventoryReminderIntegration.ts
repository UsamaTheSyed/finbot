import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { customerReminderCommand } from "../../server/services/reminderRecipients";
import { processReminder } from "../../server/services/reminders";
export async function inventoryReminderIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: Pool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1";
  async function post(path: string, payload: unknown, status = 201) {
    const r = await app.inject({
      method: "POST",
      url: base + path,
      headers,
      payload: payload as Record<string, unknown>,
    });
    assert.equal(r.statusCode, status, r.body);
    return r.json();
  }
  const customer = await post("/parties", {
    kind: "Customer",
    name: "Inventory Reminder Customer",
    phone: "",
    email: "",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const supplier = await post("/parties", {
    kind: "Supplier",
    name: "Inventory Supplier",
    phone: "",
    email: "",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const product = await post("/inventory", {
    sku: `RICE-${randomUUID()}`,
    name: "Tracked Rice",
    unit: "kg",
    opening: 10,
    minimum: 2,
    date: "2026-11-28",
  });
  const make = (partyId: string, quantity: number, draft = false) => ({
    partyId,
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "Inventory test",
    items: [
      {
        productId: product.id,
        item: "Rice",
        description: "",
        quantity,
        unit: "kg",
        rate: 100,
        taxPercent: 0,
      },
    ],
    discount: 0,
    amountPaid: 0,
    method: "Cash",
    notes: "",
    terms: "",
    draft,
  });
  const stock = async () =>
    Number(
      (
        await pool.query("select stock_milli from products where id=$1", [
          product.id,
        ])
      ).rows[0].stock_milli,
    );
  let saleId = "";
  await t.test(
    "inventory drafts do not post; purchases add, sales subtract and failures roll back",
    async () => {
      const draft = await post("/invoices", make(customer.id, 1.25, true));
      assert.equal(await stock(), 10000);
      const issued = await app.inject({
        method: "PATCH",
        url: `${base}/invoices/${draft.id}`,
        headers,
        payload: { ...make(customer.id, 1.25), revision: draft.revision },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      saleId = draft.id;
      assert.equal(await stock(), 8750);
      assert.equal(issued.json().items[0].productId, product.id);
      await post("/invoices", make(supplier.id, 2.5));
      assert.equal(await stock(), 11250);
      const before = await pool.query(
        "select count(*) n from invoices where business_id='business-1'",
      );
      await post("/invoices", make(customer.id, 99), 409);
      assert.equal(await stock(), 11250);
      assert.equal(
        (
          await pool.query(
            "select count(*) n from invoices where business_id='business-1'",
          )
        ).rows[0].n,
        before.rows[0].n,
      );
      await post(
        "/invoices",
        {
          ...make(customer.id, 1),
          items: [{ ...make(customer.id, 1).items[0], unit: "Bag" }],
        },
        400,
      );
      const transaction = issued.json().transactionId;
      const removed = await app.inject({
        method: "DELETE",
        url: `${base}/transactions/${transaction}`,
        headers,
      });
      assert.equal(removed.statusCode, 409, removed.body);
    },
  );
  await t.test(
    "concurrent sales cannot oversell; adjustment replay and historical date are guarded",
    async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          app.inject({
            method: "POST",
            url: base + "/invoices",
            headers,
            payload: make(customer.id, 10),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
      assert.equal(await stock(), 1250);
      const movement = {
        requestId: randomUUID(),
        date: "2026-11-28",
        kind: "Customer return",
        quantity: 1,
        reason: "Goods physically received",
      };
      await post(`/inventory/${product.id}/adjustments`, movement);
      await post(`/inventory/${product.id}/adjustments`, movement);
      assert.equal(await stock(), 2250);
      await post(
        `/inventory/${product.id}/adjustments`,
        { ...movement, quantity: 2 },
        409,
      );
      await post(
        `/inventory/${product.id}/adjustments`,
        { ...movement, requestId: randomUUID(), date: "2026-11-27" },
        409,
      );
      assert.equal(await stock(), 2250);
    },
  );
  let version = "";
  await t.test(
    "customer invitation is isolated, single-use, opt-in and explicitly approved",
    async () => {
      const v = await post(
        `/reminders/recipients/${customer.id}/link`,
        {},
        200,
      );
      const token = new URL(v.url).searchParams.get("start")!;
      const m = {
        channel: "telegram" as const,
        externalUserId: "9911223344",
        externalChatId: "9911223344",
        messageId: "inventory-reminder-link",
        text: `/start ${token}`,
        timestamp: Date.now(),
      };
      const result = await customerReminderCommand(pool, m);
      assert.match(result!.text, /verify/);
      assert.match(
        (await customerReminderCommand(pool, m))!.text,
        /invalid or expired/,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from bot_identities where external_chat_id='9911223344'",
          )
        ).rows[0].n,
        0,
      );
      await post(
        "/reminders/preview",
        { invoiceId: saleId, template: "polite" },
        409,
      );
      version = (
        await pool.query(
          "select version from reminder_recipients where party_id=$1",
          [customer.id],
        )
      ).rows[0].version;
      await post(
        `/reminders/recipients/${customer.id}/approve`,
        { version },
        200,
      );
    },
  );
  await t.test(
    "reminder confirmation queues once, sends only on worker success and notifies workspace",
    async () => {
      const preview = await post(
        "/reminders/preview",
        { invoiceId: saleId, template: "polite" },
        200,
      );
      const request = {
        requestId: randomUUID(),
        invoiceId: saleId,
        template: "polite",
        previewHash: preview.previewHash,
      };
      await post("/reminders", request);
      await post("/reminders", request, 200);
      let calls = 0;
      const fetcher = (async (_url: unknown, init?: RequestInit) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.chat_id, "9911223344");
        assert.equal(body.text, preview.text);
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 1234 } }),
          { status: 200 },
        );
      }) as typeof fetch;
      assert.equal(await processReminder(pool, "fake-token", fetcher), true);
      assert.equal(calls, 1);
      assert.equal(await processReminder(pool, "fake-token", fetcher), false);
      assert.equal(calls, 1);
      assert.equal(
        (
          await pool.query("select status from reminders where id=$1", [
            request.requestId,
          ])
        ).rows[0].status,
        "Sent",
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from notifications where id=$1",
            [`reminder:${request.requestId}`],
          )
        ).rows[0].n,
        1,
      );
      await post("/reminders", { ...request, requestId: randomUUID() }, 409);
    },
  );
  await t.test(
    "rate-limited delivery retries; revoked recipient cancels before a second send",
    async () => {
      const invoice = await post("/invoices", {
        ...make(customer.id, 1),
        items: [{ ...make(customer.id, 1).items[0], productId: undefined }],
      });
      const preview = await post(
        "/reminders/preview",
        { invoiceId: invoice.id, template: "firm" },
        200,
      );
      const requestId = randomUUID();
      await post("/reminders", {
        requestId,
        invoiceId: invoice.id,
        template: "firm",
        previewHash: preview.previewHash,
      });
      await processReminder(
        pool,
        "fake-token",
        (async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error_code: 429,
              parameters: { retry_after: 1 },
            }),
            { status: 429 },
          )) as typeof fetch,
      );
      assert.equal(
        (
          await pool.query("select status from reminders where id=$1", [
            requestId,
          ])
        ).rows[0].status,
        "Retry",
      );
      await customerReminderCommand(pool, {
        channel: "telegram",
        externalUserId: "9911223344",
        externalChatId: "9911223344",
        messageId: "stop",
        text: "/stop",
        timestamp: Date.now(),
      });
      await pool.query("update reminders set next_attempt=now() where id=$1", [
        requestId,
      ]);
      await processReminder(pool, "fake-token", (async () => {
        throw Error("Must not send");
      }) as typeof fetch);
      assert.equal(
        (
          await pool.query("select status from reminders where id=$1", [
            requestId,
          ])
        ).rows[0].status,
        "Cancelled",
      );
    },
  );
}
