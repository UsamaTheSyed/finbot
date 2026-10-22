import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../../server/db/client";
import { loadStatement } from "../../server/services/statements";
import { salesApReport } from "../../server/services/salesApReports";
import { financialReport } from "../../server/services/reports";
export async function correctionIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: DatabasePool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1";
  for (const kind of ["Customer", "Supplier"] as const)
    await t.test(
      `${kind} corrections preserve cash, snapshots and historical reports; FIFO increments keep their dates`,
      async () => {
        const partyResponse = await app.inject({
          method: "POST",
          url: `${base}/parties`,
          headers,
          payload: {
            kind,
            name: `Correction ${kind}`,
            phone: "",
            email: "",
            ntn: "",
            address: "",
            paymentTerms: "Net 30",
          },
        });
        assert.equal(partyResponse.statusCode, 201, partyResponse.body);
        const party = partyResponse.json();
        const data = {
          partyId: party.id,
          date: "2026-10-10",
          dueDate: "2026-11-10",
          reference: "correction-test",
          items: [
            {
              item: "Goods",
              description: "",
              quantity: 1,
              unit: "Bag",
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
        const created = await app.inject({
          method: "POST",
          url: `${base}/invoices`,
          headers,
          payload: data,
        });
        assert.equal(created.statusCode, 201, created.body);
        let invoice = created.json();
        const originalId = invoice.id;
        const displayId = invoice.displayId;
        const direction = kind === "Customer" ? "Received" : "Sent";
        const pay = async (amount: number, date: string) =>
          app.inject({
            method: "POST",
            url: `${base}/payments`,
            headers,
            payload: {
              partyId: party.id,
              invoiceId: "",
              allocationMode: "fifo",
              direction,
              amount,
              method: "Cash",
              date,
              reference: "advance",
              notes: "",
            },
          });
        const receipt = await pay(1200, "2026-10-12");
        assert.equal(receipt.statusCode, 201, receipt.body);
        const payment = receipt.json();
        invoice = (
          await app.inject({
            method: "GET",
            url: `${base}/invoices/${invoice.id}`,
            headers,
          })
        ).json();
        assert.equal(invoice.paidMinor, 100000);
        const cashBefore = (
          await pool.query(
            "select id,amount_minor,date from payments where party_id=$1 order by id",
            [party.id],
          )
        ).rows;
        const allocationsBefore = (
          await pool.query(
            "select * from payment_transaction_allocations where payment_id=$1",
            [payment.id],
          )
        ).rows;
        const payload = {
          revision: invoice.revision,
          reason: "Correct supplier/customer rate",
          effectiveDate: "2026-11-28",
          data: { ...data, items: [{ ...data.items[0], rate: 1300 }] },
        };
        const path = `${base}/invoices/${invoice.id}/corrections`;
        assert.equal(
          (await app.inject({ method: "POST", url: path, payload })).statusCode,
          401,
        );
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: `/api/businesses/business-2/invoices/${invoice.id}/corrections`,
              headers,
              payload,
            })
          ).statusCode,
          404,
        );
        const saves = await Promise.all([
          app.inject({ method: "POST", url: path, headers, payload }),
          app.inject({ method: "POST", url: path, headers, payload }),
        ]);
        assert.deepEqual(
          saves.map((r) => r.statusCode).sort(),
          [201, 409],
          saves.map((r) => r.body).join("\n"),
        );
        invoice = saves.find((r) => r.statusCode === 201)!.json();
        assert.equal(invoice.id, originalId);
        assert.equal(invoice.displayId, displayId);
        assert.equal(invoice.totalMinor, 130000);
        assert.equal(invoice.paidMinor, 100000);
        assert.equal(invoice.balanceMinor, 30000);
        assert.deepEqual(
          (
            await pool.query(
              "select id,amount_minor,date from payments where party_id=$1 order by id",
              [party.id],
            )
          ).rows,
          cashBefore,
        );
        assert.deepEqual(
          (
            await pool.query(
              "select * from payment_transaction_allocations where payment_id=$1",
              [payment.id],
            )
          ).rows,
          allocationsBefore,
        );
        const history = (
          await app.inject({ method: "GET", url: path, headers })
        ).json();
        assert.equal(history.entries.length, 1);
        assert.equal(history.entries[0].before.totalMinor, 100000);
        assert.equal(history.entries[0].after.totalMinor, 130000);
        const reportKind = kind === "Customer" ? "sales" : "purchases";
        for (const [period, total] of [
          ["2026-10", 1000],
          ["2026-11", 300],
        ] as const) {
          const report = await salesApReport(
            pool,
            "business-1",
            reportKind,
            period,
          );
          const rows =
            reportKind === "sales" ? report!.sales! : report!.purchases!;
          assert.equal(
            rows
              .filter((r) => r.invoiceId === originalId)
              .reduce((s, r) => s + r.total, 0),
            total,
          );
        }
        const october = await loadStatement(pool, "business-1", party.id, {
          from: "2026-10-01",
          to: "2026-10-31",
        });
        assert.equal(
          october.closingMinor,
          kind === "Customer" ? -20000 : 20000,
        );
        const november = await loadStatement(pool, "business-1", party.id, {
          from: "2026-11-01",
          to: "2026-11-30",
        });
        assert.equal(
          november.closingMinor,
          kind === "Customer" ? 10000 : -10000,
        );
        assert.ok(november.rows.some((r) => r.label.includes("correction")));
        const invalid = {
          ...payload,
          revision: invoice.revision,
          data: { ...data, items: [{ ...data.items[0], rate: 900 }] },
        };
        const rejected = await app.inject({
          method: "POST",
          url: path,
          headers,
          payload: invalid,
        });
        assert.equal(rejected.statusCode, 409);
        assert.equal(rejected.json().code, "CREDIT_REQUIRED");
        assert.equal(
          (
            await app.inject({
              method: "DELETE",
              url: `${base}/transactions/${invoice.transactionId}`,
              headers,
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await app.inject({
              method: "PATCH",
              url: `${base}/transactions/${invoice.transactionId}`,
              headers,
              payload: { date: "2026-10-11", notes: "bypass" },
            })
          ).statusCode,
          409,
        );
        // A subsequent receipt uses the carried 200 plus new 100. The original 1000
        // allocation remains in October, while both new allocations are in November.
        const second = await pay(100, "2026-11-28");
        assert.equal(second.statusCode, 201, second.body);
        invoice = (
          await app.inject({
            method: "GET",
            url: `${base}/invoices/${originalId}`,
            headers,
          })
        ).json();
        assert.equal(invoice.paidMinor, 130000);
        assert.equal(invoice.balanceMinor, 0);
        const events = await pool.query(
          "select amount_minor,effective_date from payment_allocation_events where payment_id=$1 order by effective_date",
          [payment.id],
        );
        assert.deepEqual(
          events.rows.map((r) => [Number(r.amount_minor), r.effective_date]),
          [
            [100000, "2026-10-12"],
            [20000, "2026-11-28"],
          ],
        );
        const aging =
          kind === "Customer"
            ? await financialReport(pool, "business-1", "ar-aging", "2026-10")
            : await salesApReport(pool, "business-1", "ap-aging", "2026-10");
        assert.ok(!aging?.aging.some((r) => r.party === party.name));
        const afterStatement = await loadStatement(
          pool,
          "business-1",
          party.id,
          { from: "", to: "" },
        );
        assert.equal(afterStatement.closingMinor, 0);
        // A same-total item correction remains valid after settlement.
        const revised = {
          ...payload,
          revision: invoice.revision,
          data: {
            ...payload.data,
            items: [{ ...payload.data.items[0], item: "Correct description" }],
          },
        };
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers,
              payload: revised,
            })
          ).statusCode,
          201,
        );
        // A real reduction produces a negative movement in the correction month,
        // without rewriting the original month or changing its initial payment.
        const decreaseCreated = await app.inject({
          method: "POST",
          url: `${base}/invoices`,
          headers,
          payload: { ...data, amountPaid: 200 },
        });
        assert.equal(decreaseCreated.statusCode, 201, decreaseCreated.body);
        const decrease = decreaseCreated.json();
        const lowered = await app.inject({
          method: "POST",
          url: `${base}/invoices/${decrease.id}/corrections`,
          headers,
          payload: {
            revision: decrease.revision,
            reason: "Reduce incorrect unit rate",
            effectiveDate: "2026-11-28",
            data: { ...data, items: [{ ...data.items[0], rate: 500 }] },
          },
        });
        assert.equal(lowered.statusCode, 201, lowered.body);
        assert.equal(lowered.json().paidMinor, 20000);
        assert.equal(lowered.json().balanceMinor, 30000);
        for (const [period, total] of [
          ["2026-10", 1000],
          ["2026-11", -500],
        ] as const) {
          const report = await salesApReport(
            pool,
            "business-1",
            reportKind,
            period,
          );
          const rows =
            reportKind === "sales" ? report!.sales! : report!.purchases!;
          assert.equal(
            rows
              .filter((r) => r.invoiceId === decrease.id)
              .reduce((sum, r) => sum + r.total, 0),
            total,
          );
        }
      },
    );
}
