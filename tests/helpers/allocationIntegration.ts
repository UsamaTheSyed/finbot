import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Pool, PoolClient } from "pg";
import { insertInvoiceGraph } from "../../server/services/invoices";
import { executePayment, createPayment } from "../../server/services/payments";
import {
  invoiceDto,
  paymentDto,
  transactionDto,
} from "../../server/services/ledger";
import { partySummaries } from "../../server/services/parties";
import { applyAdvance } from "../../server/services/allocations";
import {
  dashboardReport,
  financialReport,
} from "../../server/services/reports";
import { prepareWrite, executeWrite } from "../../server/bot/tools/write";
import { blankExtraction } from "../../server/bot/types";

const payment = (
  partyId: string,
  amount: number,
  direction: "Sent" | "Received" = "Received",
) => ({
  partyId,
  amount,
  direction,
  invoiceId: "",
  allocationMode: "fifo" as const,
  method: "Cash" as const,
  date: "2026-10-12",
  reference: "FIFO TEST",
  notes: "",
});
async function party(c: PoolClient, kind = "Customer") {
  const id = `fifo-${randomUUID()}`;
  await c.query(
    "insert into parties(id,business_id,name,kind) values($1,'business-1',$1,$2)",
    [id, kind],
  );
  return id;
}
async function issue(
  c: PoolClient,
  partyId: string,
  amount: number,
  date = "2026-10-10",
  draft = false,
) {
  const id = `INV-fifo-${randomUUID()}`;
  await insertInvoiceGraph(
    c,
    "business-1",
    "user-1",
    id,
    {
      partyId,
      date,
      dueDate: date,
      reference: "",
      items: [
        {
          item: "Test",
          description: "",
          quantity: 1,
          unit: "Piece",
          rate: amount,
          taxPercent: 0,
        },
      ],
      discount: 0,
      amountPaid: 0,
      method: "Cash",
      notes: "",
      terms: "",
      draft,
    },
    id,
  );
  return id;
}
export async function allocationIntegration(t: TestContext, pool: Pool) {
  async function check(name: string, run: (c: PoolClient) => Promise<void>) {
    await t.test(name, async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await run(c);
      } finally {
        await c.query("rollback");
        c.release();
      }
    });
  }
  await check(
    "FIFO customer: reversed creation order still allocates by date; reports count receipt once",
    async (c) => {
      const p = await party(c),
        next = await issue(c, p, 30000, "2026-10-20"),
        old = await issue(c, p, 40000);
      const before = (await dashboardReport(c, "business-1"))[0];
      const receipt = await executePayment(c, "business-1", payment(p, 50000));
      assert.deepEqual(
        receipt.allocations.map((a) => a.invoiceId),
        [old, next],
      );
      assert.deepEqual(
        receipt.allocations.map((a) => a.amountMinor),
        [4000000, 1000000],
      );
      assert.equal((await invoiceDto(c, "business-1", old)).status, "Paid");
      assert.equal(
        (await invoiceDto(c, "business-1", next)).balanceMinor,
        2000000,
      );
      assert.equal(
        (
          await transactionDto(
            c,
            "business-1",
            receipt.allocations[1].transactionId,
          )
        ).paid,
        10000,
      );
      const after = (await dashboardReport(c, "business-1"))[0];
      assert.equal(after.totalCash - before.totalCash, 50000);
      assert.equal(before.receivable - after.receivable, 50000);
      assert.equal(
        (await partySummaries(c, "business-1")).find((x) => x.id === p)!
          .balanceMinor,
        2000000,
      );
    },
  );
  await check(
    "FIFO advance applies on future issue, not draft, preserving payment and effective dates",
    async (c) => {
      const p = await party(c),
        old = await issue(c, p, 40000);
      const receipt = await executePayment(c, "business-1", payment(p, 50000));
      assert.equal(receipt.advanceMinor, 1000000);
      const draft = await issue(c, p, 99999, "2026-10-15", true);
      assert.equal((await invoiceDto(c, "business-1", draft)).paidMinor, 0);
      const future = await issue(c, p, 7000, "2026-11-20");
      const updated = await paymentDto(c, "business-1", receipt.id);
      assert.equal(updated.advanceMinor, 300000);
      assert.equal(updated.date, "2026-10-12");
      assert.equal(
        updated.allocations.find((a) => a.invoiceId === future)!.effectiveDate,
        "2026-11-20",
      );
      assert.equal((await invoiceDto(c, "business-1", old)).balanceMinor, 0);
      assert.equal(
        (
          await c.query(
            "select count(*)::int n from payments where party_id=$1",
            [p],
          )
        ).rows[0].n,
        1,
      );
      await applyAdvance(c, "business-1", p, "Received");
      assert.equal(
        (await paymentDto(c, "business-1", receipt.id)).advanceMinor,
        300000,
      );
    },
  );
  await check(
    "FIFO supplier: 100000 payment settles 80000 and applies 20000 to future bill",
    async (c) => {
      const p = await party(c, "Supplier"),
        old = await issue(c, p, 80000);
      const receipt = await executePayment(
        c,
        "business-1",
        payment(p, 100000, "Sent"),
      );
      assert.equal(receipt.advanceMinor, 2000000);
      const later = await issue(c, p, 30000, "2026-10-20");
      assert.equal((await invoiceDto(c, "business-1", old)).status, "Paid");
      assert.equal(
        (await invoiceDto(c, "business-1", later)).paidMinor,
        2000000,
      );
      assert.equal(
        (await paymentDto(c, "business-1", receipt.id)).advanceMinor,
        0,
      );
      assert.equal(
        (await partySummaries(c, "business-1")).find((x) => x.id === p)!
          .balanceMinor,
        -1000000,
      );
    },
  );
  await check(
    "FIFO isolated party/workspace and wrong direction rejection",
    async (c) => {
      const p = await party(c),
        other = await party(c),
        invoice = await issue(c, other, 100);
      const receipt = await executePayment(c, "business-1", payment(p, 500));
      assert.equal(receipt.advanceMinor, 50000);
      assert.equal((await invoiceDto(c, "business-1", invoice)).paidMinor, 0);
      await assert.rejects(
        () => executePayment(c, "business-1", payment(p, 100, "Sent")),
        { code: "DIRECTION_MISMATCH" },
      );
      await assert.rejects(
        () => executePayment(c, "business-2", payment(p, 100)),
        { code: "NOT_FOUND" },
      );
    },
  );
  await check(
    "FIFO manual invoice overpayment remains rejected; transaction payments sync invoice",
    async (c) => {
      const p = await party(c),
        invoice = await issue(c, p, 100);
      const i = await invoiceDto(c, "business-1", invoice);
      await assert.rejects(
        () =>
          executePayment(c, "business-1", {
            ...payment(p, 101),
            allocationMode: "manual",
            invoiceId: invoice,
          }),
        { code: "OVERPAYMENT" },
      );
      await executePayment(
        c,
        "business-1",
        { ...payment(p, 40), allocationMode: "manual" },
        i.transactionId,
      );
      assert.equal(
        (await invoiceDto(c, "business-1", invoice)).paidMinor,
        4000,
      );
      await executePayment(c, "business-1", payment(p, 80));
      assert.equal(
        (await invoiceDto(c, "business-1", invoice)).paidMinor,
        10000,
      );
      assert.equal(
        (await transactionDto(c, "business-1", i.transactionId!)).paid,
        100,
      );
    },
  );
  await check(
    "FIFO bot preview exposes advance and rejects a changed allocation before saving",
    async (c) => {
      const p = await party(c);
      await issue(c, p, 40000);
      const identity = {
        id: randomUUID(),
        business_id: "business-1",
        user_id: "user-1",
        timezone: "Asia/Karachi",
      };
      const state = {
        partyId: p,
        invoiceId: "__fifo__",
        extraction: {
          ...blankExtraction(),
          intent: "RECORD_PAYMENT" as const,
          amountText: "50000 PKR",
          direction: "Received" as const,
          method: "Cash" as const,
          dateText: "2026-10-12",
        },
      };
      const preview = await prepareWrite(
        c,
        identity,
        state,
        new Date("2026-10-12T12:00:00Z"),
      );
      assert.match(preview.summary, /Advance: PKR 10,000.00/);
      await executePayment(c, "business-1", payment(p, 1000));
      await assert.rejects(() => executeWrite(c, identity, preview.value), {
        code: "ALLOCATION_CHANGED",
      });
      const fresh = await prepareWrite(
        c,
        identity,
        state,
        new Date("2026-10-12T12:00:00Z"),
      );
      const saved = await executeWrite(c, identity, fresh.value);
      assert.match(saved.text, /Advance remaining: PKR 11,000.00/);
    },
  );
  await check(
    "FIFO aging does not subtract payments after the requested month",
    async (c) => {
      const p = await party(c),
        inv = await issue(c, p, 100, "2026-09-10");
      await executePayment(c, "business-1", payment(p, 100));
      assert.equal((await invoiceDto(c, "business-1", inv)).balanceMinor, 0);
      const report = await financialReport(
        c,
        "business-1",
        "ar-aging",
        "2026-09",
      );
      assert.equal(report!.aging.find((a) => a.party === p)!.total, 100);
    },
  );
  await t.test(
    "FIFO concurrent receipts cannot over-allocate one invoice",
    async () => {
      const c = await pool.connect();
      let p = "";
      try {
        await c.query("begin");
        p = await party(c);
        await issue(c, p, 100);
        await c.query("commit");
        const receipts = await Promise.all([
          createPayment(pool, "business-1", payment(p, 70)),
          createPayment(pool, "business-1", payment(p, 70)),
        ]);
        const rows = await pool.query(
          "select id from payments where party_id=$1",
          [p],
        );
        const current = await Promise.all(
          rows.rows.map((row) => paymentDto(pool, "business-1", row.id)),
        );
        assert.equal(
          current.reduce((s, p) => s + p.advanceMinor, 0),
          4000,
        );
        assert.equal(
          current
            .flatMap((p) => p.allocations)
            .reduce((s, a) => s + a.amountMinor, 0),
          10000,
        );
        assert.equal(receipts.length, 2);
      } finally {
        await c.query("rollback");
        // Only these test-owned records are removed; no seed/reset of unrelated tests.
        if (p) {
          await c.query("begin");
          await c.query("delete from payments where party_id=$1", [p]);
          await c.query("delete from invoices where party_id=$1", [p]);
          await c.query("delete from transactions where party_id=$1", [p]);
          await c.query("delete from parties where id=$1", [p]);
          await c.query("commit");
        }
        c.release();
      }
    },
  );
}
