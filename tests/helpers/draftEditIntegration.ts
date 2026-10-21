import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { TestContext } from "node:test";
import type { DatabasePool } from "../../server/db/client";

export async function draftEditIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: DatabasePool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1";
  for (const kind of ["Customer", "Supplier"] as const) {
    await t.test(
      `${kind} draft edit is atomic, versioned, scoped and posts only on issue`,
      async () => {
        const party = await app.inject({
          method: "POST",
          url: `${base}/parties`,
          headers,
          payload: {
            kind,
            name: `Draft edit ${kind}`,
            phone: "",
            email: "",
            ntn: "",
            address: "",
            paymentTerms: "Net 30",
          },
        });
        assert.equal(party.statusCode, 201, party.body);
        const input = {
          partyId: party.json().id,
          date: "2026-11-28",
          dueDate: "2026-12-28",
          reference: "draft-edit",
          items: [
            {
              item: "Goods",
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
        const created = await app.inject({
          method: "POST",
          url: `${base}/invoices`,
          headers,
          payload: input,
        });
        assert.equal(created.statusCode, 201, created.body);
        const before = created.json();
        assert.match(before.revision, /^\d+$/);
        const path = `${base}/invoices/${before.id}`;
        const get = async () =>
          (await app.inject({ method: "GET", url: path, headers })).json();
        const snapshot = async () =>
          (
            await pool.query("select created_at from invoices where id=$1", [
              before.id,
            ])
          ).rows[0].created_at;
        const createdAt = await snapshot();
        const replacement = {
          ...input,
          discount: 10,
          notes: "Edited draft",
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
        const save = (data: unknown, revision = before.revision) =>
          app.inject({
            method: "PATCH",
            url: `${path}/draft`,
            headers,
            payload: { data, revision },
          });
        assert.equal(
          (
            await app.inject({
              method: "PATCH",
              url: `${path}/draft`,
              payload: { data: replacement, revision: before.revision },
            })
          ).statusCode,
          401,
        );
        assert.equal(
          (
            await app.inject({
              method: "PATCH",
              url: `/api/businesses/business-2/invoices/${before.id}/draft`,
              headers,
              payload: { data: replacement, revision: before.revision },
            })
          ).statusCode,
          404,
        );
        const responses = await Promise.all([
          save(replacement),
          save({ ...replacement, notes: "Other tab" }),
        ]);
        assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
        const edited = responses.find((r) => r.statusCode === 200)!.json();
        assert.equal(edited.id, before.id);
        assert.equal(edited.displayId, before.displayId);
        assert.notEqual(edited.revision, before.revision);
        assert.equal(edited.totalMinor, 35500);
        assert.equal(edited.status, "Draft");
        assert.equal(edited.paidMinor, 0);
        assert.equal(edited.transactionId, undefined);
        assert.deepEqual(await snapshot(), createdAt);
        for (const table of ["transactions", "payments"]) {
          const count = await pool.query(
            `select count(*)::int count from ${table} where party_id=$1`,
            [input.partyId],
          );
          assert.equal(count.rows[0].count, 0);
        }
        const wrongKind = await app.inject({
          method: "POST",
          url: `${base}/parties`,
          headers,
          payload: {
            kind: kind === "Customer" ? "Supplier" : "Customer",
            name: "Wrong kind",
            phone: "",
            email: "",
            ntn: "",
            address: "",
            paymentTerms: "Net 30",
          },
        });
        for (const data of [
          { ...replacement, amountPaid: 1 },
          { ...replacement, draft: false },
          { ...replacement, partyId: wrongKind.json().id },
          { ...replacement, dueDate: "2026-01-01" },
          { ...replacement, discount: 999999 },
        ]) {
          assert.equal((await save(data, edited.revision)).statusCode, 400);
          assert.deepEqual(await get(), edited);
        }
        const crossParty = await save(
          { ...replacement, partyId: "other-party" },
          edited.revision,
        );
        assert.equal(crossParty.statusCode, 404);
        const staleIssue = await app.inject({
          method: "PATCH",
          url: path,
          headers,
          payload: { ...replacement, draft: false, revision: before.revision },
        });
        assert.equal(staleIssue.statusCode, 409);
        const issue = await app.inject({
          method: "PATCH",
          url: path,
          headers,
          payload: { ...replacement, draft: false, revision: edited.revision },
        });
        assert.equal(issue.statusCode, 200, issue.body);
        const issued = issue.json();
        assert.equal(issued.displayId, before.displayId);
        assert.equal(issued.totalMinor, 35500);
        const transaction = await pool.query(
          "select type,total_minor from transactions where id=$1",
          [issued.transactionId],
        );
        assert.equal(
          transaction.rows[0].type,
          kind === "Supplier" ? "Purchase" : "Sale",
        );
        assert.equal(Number(transaction.rows[0].total_minor), 35500);
        assert.equal(
          (await save(replacement, edited.revision)).statusCode,
          409,
        );
        assert.equal(
          (
            await app.inject({
              method: "PATCH",
              url: path,
              headers,
              payload: { ...replacement, draft: false },
            })
          ).statusCode,
          409,
        );
      },
    );
  }
}
