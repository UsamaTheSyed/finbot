import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../../server/db/client";
import { insertInvoiceGraph } from "../../server/services/invoices";
import { allocateInvoiceNumber } from "../../server/services/invoiceNumber";
export async function safetyIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: DatabasePool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1";
  const partyInput = {
    kind: "Customer",
    name: "Safety Customer",
    phone: "",
    email: "",
    ntn: "",
    address: "",
    paymentTerms: "Net 30",
  };
  const createParty = async () => {
    const r = await app.inject({
      method: "POST",
      url: `${base}/parties`,
      headers,
      payload: partyInput,
    });
    assert.equal(r.statusCode, 201, r.body);
    return r.json();
  };
  const input = (partyId: string) => ({
    partyId,
    date: "2026-11-28",
    dueDate: "2026-12-28",
    reference: "safety",
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
    amountPaid: 100,
    method: "Cash" as const,
    notes: "",
    terms: "",
    draft: false,
  });
  await t.test(
    "deleting a manually paid invoice transaction preserves invoice, payments and cash",
    async () => {
      const party = await createParty();
      const made = await app.inject({
        method: "POST",
        url: `${base}/invoices`,
        headers,
        payload: input(party.id),
      });
      assert.equal(made.statusCode, 201, made.body);
      const invoice = made.json();
      const before = (
        await pool.query(
          "select id,amount_minor,direction from payments where party_id=$1 order by id",
          [party.id],
        )
      ).rows;
      const result = await app.inject({
        method: "DELETE",
        url: `${base}/transactions/${invoice.transactionId}`,
        headers,
      });
      assert.equal(result.statusCode, 409, result.body);
      assert.equal(result.json().code, "TRANSACTION_HAS_PAYMENTS");
      assert.deepEqual(
        (
          await pool.query(
            "select id,amount_minor,direction from payments where party_id=$1 order by id",
            [party.id],
          )
        ).rows,
        before,
      );
      assert.equal(
        (
          await app.inject({
            method: "GET",
            url: `${base}/invoices/${invoice.id}`,
            headers,
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    "party type edit waits for a financial writer and rechecks committed records",
    async () => {
      const party = await createParty(),
        writer = await pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await writer.query("begin");
        await writer.query("select id from parties where id=$1 for update", [
          party.id,
        ]);
        pending = app
          .inject({
            method: "PATCH",
            url: `${base}/parties/${party.id}`,
            headers,
            payload: { ...partyInput, kind: "Supplier" },
          })
          .then((r) => r);
        // Wait until the PATCH is blocked on its party row. This checks actual DB
        // contention, rather than relying on a fixed sleep to order the requests.
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          const r = await pool.query(
            "select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%select * from parties%' and query ilike '%for update%' limit 1",
          );
          if (r.rowCount) {
            waiting = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(
          waiting,
          "Party PATCH must wait for the financial writer lock",
        );
        const user = (
          await writer.query(
            "select id from users where email='owner@alienterprise.pk'",
          )
        ).rows[0];
        await insertInvoiceGraph(
          writer,
          "business-1",
          user.id,
          `INV-${randomUUID()}`,
          input(party.id),
          await allocateInvoiceNumber(writer, "business-1"),
        );
        await writer.query("commit");
        const result = (await pending) as {
          statusCode: number;
          body: string;
          json: () => { code: string };
        };
        assert.equal(result.statusCode, 400, result.body);
        assert.equal(result.json().code, "PARTY_KIND_LOCKED");
        assert.equal(
          (await pool.query("select kind from parties where id=$1", [party.id]))
            .rows[0].kind,
          "Customer",
        );
      } finally {
        await writer.query("rollback");
        writer.release();
        if (pending) await pending;
      }
    },
  );
}
