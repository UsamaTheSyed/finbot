import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../../server/db/client";
import { loadStatement } from "../../server/services/statements";
import { salesApReport } from "../../server/services/salesApReports";
import { financialReport } from "../../server/services/reports";
export async function creditIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: DatabasePool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1";
  const post = (path: string, payload: unknown) =>
    app.inject({
      method: "POST",
      url: base + path,
      headers,
      payload: payload as object,
    });
  const get = async (path: string) =>
    (await app.inject({ method: "GET", url: base + path, headers })).json();
  for (const kind of ["Customer", "Supplier"] as const)
    await t.test(
      `${kind} credit, refund and application conserve cash and historical balances with idempotent concurrent posting`,
      async () => {
        const p = await post("/parties", {
          kind,
          name: `Credit ${kind}`,
          phone: "",
          email: "",
          ntn: "",
          address: "",
          paymentTerms: "Net 30",
        });
        assert.equal(p.statusCode, 201, p.body);
        const party = p.json();
        const input = {
          partyId: party.id,
          date: "2026-10-10",
          dueDate: "2026-11-10",
          reference: "credit-test",
          items: [
            {
              item: "Goods",
              description: "",
              quantity: 1,
              unit: "Each",
              rate: 1000,
              taxPercent: 10,
            },
          ],
          discount: 100,
          amountPaid: 800,
          method: "Cash",
          notes: "",
          terms: "",
          draft: false,
        };
        const created = await post("/invoices", input);
        assert.equal(created.statusCode, 201, created.body);
        const original = created.json();
        const payload = {
          requestId: randomUUID(),
          invoiceId: original.id,
          revision: original.revision,
          amountMinor: 50000,
          subtotalMinor: 50000,
          taxMinor: 5000,
          discountMinor: 5000,
          effectiveDate: "2026-11-28",
          reason: "Credit returned goods",
        };
        const cashBefore = (
          await pool.query(
            "select id,amount_minor,direction,date from payments where party_id=$1",
            [party.id],
          )
        ).rows;
        const note = await post("/credits/notes", payload);
        assert.equal(note.statusCode, 201, note.body);
        assert.equal(note.json().fundedCreditMinor, 30000);
        const repeat = await post("/credits/notes", payload);
        assert.equal(repeat.statusCode, 201, repeat.body);
        assert.deepEqual(repeat.json(), note.json());
        assert.equal(
          (
            await post("/credits/notes", {
              ...payload,
              reason: "Different request",
            })
          ).statusCode,
          409,
        );
        assert.deepEqual(
          (
            await pool.query(
              "select id,amount_minor,direction,date from payments where party_id=$1",
              [party.id],
            )
          ).rows,
          cashBefore,
        );
        const invoice = await get(`/invoices/${original.id}`);
        assert.equal(invoice.totalMinor, 100000);
        assert.equal(invoice.creditedMinor, 50000);
        assert.equal(invoice.paidMinor, 50000);
        assert.equal(invoice.balanceMinor, 0);
        assert.equal(
          (await get("/invoices")).find(
            (i: { id: string }) => i.id === original.id,
          ).balanceMinor,
          0,
        );
        const ctx = await get(`/parties/${party.id}/credits`);
        assert.equal(ctx.availableMinor, 30000);
        assert.equal(ctx.notes.length, 1);
        for (const [period, amount] of [
          ["2026-10", 1000],
          ["2026-11", -500],
        ] as const) {
          const report = await salesApReport(
            pool,
            "business-1",
            kind === "Customer" ? "sales" : "purchases",
            period,
          );
          const rows =
            kind === "Customer" ? report!.sales! : report!.purchases!;
          assert.equal(
            rows
              .filter((r) => r.invoiceId === original.id)
              .reduce((n, r) => n + r.total, 0),
            amount,
          );
        }
        const old = await loadStatement(pool, "business-1", party.id, {
          from: "2026-10-01",
          to: "2026-10-31",
        });
        assert.equal(old.closingMinor, kind === "Customer" ? 20000 : -20000);
        const aging =
          kind === "Customer"
            ? await financialReport(pool, "business-1", "ar-aging", "2026-10")
            : await salesApReport(pool, "business-1", "ap-aging", "2026-10");
        assert.equal(
          aging!.aging.find((r) => r.party === party.name)!.total,
          200,
        );
        const invalid = await post("/credits/notes", {
          ...payload,
          requestId: randomUUID(),
          revision: invoice.revision,
          taxMinor: 5001,
          amountMinor: 50001,
        });
        assert.equal(invalid.statusCode, 400);
        assert.equal(
          (await get(`/parties/${party.id}/credits`)).notes.length,
          1,
        );
        const refundData = {
          requestId: randomUUID(),
          partyId: party.id,
          amountMinor: 10000,
          effectiveDate: "2026-11-28",
          reason: "Actual refund recorded",
          method: "Bank Transfer",
          reference: "REF-1",
        };
        const refund = await post("/credits/refunds", refundData);
        assert.equal(refund.statusCode, 201, refund.body);
        assert.equal(
          (await post("/credits/refunds", refundData)).statusCode,
          201,
        );
        const refundRow = (
          await pool.query(
            "select direction,amount_minor from payments where id=$1",
            [refund.json().paymentId],
          )
        ).rows[0];
        assert.equal(
          refundRow.direction,
          kind === "Customer" ? "Sent" : "Received",
        );
        assert.equal(Number(refundRow.amount_minor), 10000);
        const next = await post("/invoices", {
          ...input,
          date: "2026-11-28",
          dueDate: "2026-12-28",
          items: [{ ...input.items[0], rate: 500, taxPercent: 0 }],
          discount: 0,
          amountPaid: 0,
        });
        assert.equal(next.statusCode, 201, next.body);
        const target = next.json();
        const apply = {
          requestId: randomUUID(),
          invoiceId: target.id,
          revision: target.revision,
          amountMinor: 15000,
          effectiveDate: "2026-11-28",
          reason: "Apply available credit",
        };
        const application = await post("/credits/applications", apply);
        assert.equal(application.statusCode, 201, application.body);
        assert.equal(
          (await post("/credits/applications", apply)).statusCode,
          201,
        );
        assert.equal((await get(`/invoices/${target.id}`)).balanceMinor, 35000);
        assert.equal(
          (await get(`/parties/${party.id}/credits`)).availableMinor,
          5000,
        );
        const race = await Promise.all([
          post("/credits/refunds", {
            ...refundData,
            requestId: randomUUID(),
            amountMinor: 5000,
          }),
          post("/credits/refunds", {
            ...refundData,
            requestId: randomUUID(),
            amountMinor: 5000,
          }),
        ]);
        assert.deepEqual(
          race.map((r) => r.statusCode).sort(),
          [201, 400],
          race.map((r) => r.body).join("\n"),
        );
        assert.equal(
          (await get(`/parties/${party.id}/credits`)).availableMinor,
          0,
        );
        assert.equal(
          Number(
            (
              await pool.query(
                "select count(*) count from payments where party_id=$1",
                [party.id],
              )
            ).rows[0].count,
          ),
          3,
        );
        const statement = await loadStatement(pool, "business-1", party.id, {
          from: "",
          to: "",
        });
        assert.equal(
          statement.closingMinor,
          kind === "Customer" ? 35000 : -35000,
        );
        for (const id of [original.transactionId, target.transactionId])
          assert.equal(
            (
              await app.inject({
                method: "DELETE",
                url: `${base}/transactions/${id}`,
                headers,
              })
            ).statusCode,
            409,
          );
        const cashCount = Number(
          (
            await pool.query(
              "select count(*) count from payments where party_id=$1",
              [party.id],
            )
          ).rows[0].count,
        );
        assert.equal(
          (
            await post("/credits/refunds", {
              ...refundData,
              requestId: randomUUID(),
              amountMinor: 1,
            })
          ).statusCode,
          400,
        );
        assert.equal(
          Number(
            (
              await pool.query(
                "select count(*) count from payments where party_id=$1",
                [party.id],
              )
            ).rows[0].count,
          ),
          cashCount,
        );
      },
    );
}
