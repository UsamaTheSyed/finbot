import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  openingPreview,
  activateAccounting,
} from "../../server/services/accountingOpening";
import {
  accountingReport,
  accountingProfit,
} from "../../server/services/accountingReports";
import { resolveSupplierCredit } from "../../server/services/accountingCredits";
import { insertInvoiceGraph } from "../../server/services/invoices";
import { warehouseMove } from "../../server/services/warehouseStock";
import { stockOperation } from "../../server/services/stockOperations";
import { postCredit } from "../../server/services/credits";
import { createPayment } from "../../server/services/payments";
import type { InvoiceInput } from "../../server/domain/validation";
export async function accountingIntegration(
  t: TestContext,
  pool: Pool,
  concurrent = true,
) {
  const suffix = randomUUID(),
    b = "accounting-" + suffix,
    u = "owner-" + suffix,
    customer = "customer-" + suffix,
    supplier = "supplier-" + suffix,
    p = "product-" + suffix,
    w = "main:" + b,
    date = "2026-11-28";
  const previousDate = process.env.APP_DATE_OVERRIDE;
  process.env.APP_DATE_OVERRIDE = date;
  const tx = async (fn: (c: PoolClient) => Promise<unknown>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  await pool.query(
    "insert into users(id,email,name,password_hash) values($1,$2,'Accounting owner','test-only')",
    [u, u + "@example.test"],
  );
  await pool.query(
    "insert into businesses(id,name) values($1,'Accounting test')",
    [b],
  );
  await pool.query(
    "insert into parties(id,business_id,name,kind) values($1,$3,'Customer','Customer'),($2,$3,'Supplier','Supplier')",
    [customer, supplier, b],
  );
  await pool.query(
    "insert into products(id,business_id,sku,name,unit) values($1,$2,$1,'Test goods','Each')",
    [p, b],
  );
  const invoice = async (
    partyId: string,
    quantity: number,
    rate: number,
    tracked = true,
    deferred = false,
    day = date,
  ) => {
    const id = "INV-" + randomUUID(),
      input: InvoiceInput = {
        partyId,
        date: day,
        dueDate: "2026-12-28",
        reference: "Accounting QA",
        items: [
          {
            item: "Test goods",
            description: "",
            quantity,
            unit: "Each",
            rate,
            taxPercent: 0,
            ...(tracked ? { productId: p } : {}),
          },
        ],
        discount: 0,
        amountPaid: 0,
        method: "Cash",
        notes: "",
        terms: "",
        draft: false,
        stockMode: deferred ? "Deferred" : "Immediate",
      };
    await tx((c) => insertInvoiceGraph(c, b, u, id, input, id));
    return id;
  };
  const value = async (account: string) => {
    const r = await accountingReport(pool, b, date, "2026-12-31");
    return r.active
      ? r.accounts.find((a) => a.account === account)?.closing || 0
      : 0;
  };
  const op = async (
    kind: "Dispatch" | "Receive" | "Supplier return" | "Customer return",
    id: string,
    quantity: number,
    day = date,
  ) =>
    stockOperation(pool, b, u, {
      requestId: randomUUID(),
      kind,
      quantity,
      productId: p,
      warehouseId: w,
      lineId: id + ":" + p,
      date: day,
      reason: "Accounting verification",
    });
  const credit = async (id: string, amountMinor: number, day = date) => {
    const row = (
      await pool.query("select xmin::text revision from invoices where id=$1", [
        id,
      ])
    ).rows[0];
    await postCredit(pool, b, u, "note", {
      requestId: randomUUID(),
      invoiceId: id,
      revision: String(row.revision),
      amountMinor,
      subtotalMinor: amountMinor,
      taxMinor: 0,
      discountMinor: 0,
      effectiveDate: day,
      reason: "Agreed invoice allowance",
    });
    return (
      await pool.query(
        "select id from credit_notes where invoice_id=$1 order by created_at desc",
        [id],
      )
    ).rows[0].id as string;
  };
  const legacy = await invoice(customer, 1, 1000, false);
  await tx((c) =>
    warehouseMove(c, {
      businessId: b,
      productId: p,
      userId: u,
      delta: 10000,
      date,
      kind: "Opening",
      reason: "Verified opening stock",
      requestId: randomUUID(),
      incomingCost: 1000000,
    }),
  );
  let sale = "",
    bill = "",
    deferred = "",
    supplierCredit = "";
  try {
    await t.test(
      "accounting cutover rejects stale and unverified balances, then captures legacy once",
      async () => {
        const preview = await openingPreview(pool, b, date);
        assert.deepEqual(preview.blockers, []);
        assert.equal(preview.inventory, 1000000);
        assert.equal(preview.customer, 100000);
        const input = {
          ...preview,
          inputTax: 0,
          outputTax: 0,
          confirmed: true,
        };
        await assert.rejects(
          activateAccounting(pool, b, u, { ...input, inventory: 0 }),
          /Balances changed/,
        );
        await assert.rejects(
          activateAccounting(pool, b, u, { ...input, token: "0".repeat(64) }),
          /Balances changed/,
        );
        await activateAccounting(pool, b, u, input);
        await assert.rejects(
          activateAccounting(pool, b, u, input),
          /already active/,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::int n from accounting_journals where business_id=$1",
              [b],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "legacy receipt settles opening receivable without recreating revenue",
      async () => {
        await createPayment(pool, b, {
          direction: "Received",
          partyId: customer,
          invoiceId: legacy,
          amount: 1000,
          method: "Cash",
          date,
          reference: "Legacy settlement",
          notes: "",
        });
        assert.equal(await value("Cash and bank"), 100000);
        assert.equal(await value("Customer control"), 0);
        assert.equal(await value("Sales revenue"), 0);
      },
    );
    await t.test(
      "tracked sale posts matched COGS, inventory and tax-exclusive revenue",
      async () => {
        sale = await invoice(customer, 4, 1500);
        assert.equal(await value("Sales revenue"), -600000);
        assert.equal(await value("Cost of goods sold"), 400000);
        assert.equal(await value("Inventory"), 600000);
        assert.equal(await value("Deferred sales revenue"), 0);
        const profit = await accountingProfit(pool, b, "2026-11");
        assert.equal(profit?.lines.at(-1)?.amount, 2000);
      },
    );
    await t.test(
      "supplier bill and payment do not expense remaining inventory",
      async () => {
        bill = await invoice(supplier, 5, 1000);
        assert.equal(await value("Inventory"), 1100000);
        assert.equal(await value("Untracked purchase expense"), 0);
        assert.equal(await value("Inventory purchasing clearing"), 0);
        await createPayment(pool, b, {
          direction: "Sent",
          partyId: supplier,
          invoiceId: bill,
          amount: 5000,
          method: "Cash",
          date,
          reference: "Supplier payment",
          notes: "",
        });
        assert.equal(await value("Cost of goods sold"), 400000);
      },
    );
    await t.test(
      "partial dispatch recognizes only delivered revenue and cost; allowance reallocates exactly",
      async () => {
        deferred = await invoice(customer, 4, 2000, true, true);
        assert.equal(await value("Deferred sales revenue"), -800000);
        assert.equal(await value("Sales revenue"), -600000);
        await op("Dispatch", deferred, 1);
        assert.equal(await value("Sales revenue"), -800000);
        assert.equal(await value("Cost of goods sold"), 500000);
        await credit(deferred, 80000);
        assert.equal(await value("Sales revenue"), -780000);
        assert.equal(await value("Deferred sales revenue"), -540000);
        await op("Dispatch", deferred, 3);
        assert.equal(await value("Sales revenue"), -1320000);
        assert.equal(await value("Deferred sales revenue"), 0);
        assert.equal(await value("Cost of goods sold"), 800000);
      },
    );
    await t.test(
      "supplier physical return and credit clear cost once without inventing cash",
      async () => {
        const cash = await value("Cash and bank");
        await op("Supplier return", bill, 1);
        supplierCredit = await credit(bill, 100000);
        assert.equal(await value("Inventory purchasing clearing"), 100000);
        assert.equal(
          (await accountingReport(pool, b, date, date)).active,
          true,
        );
        await assert.rejects(
          resolveSupplierCredit(pool, b, u, {
            creditId: supplierCredit,
            date,
            reason: "Invalid allocation",
            allocations: [],
            cogsMinor: 0,
            expenseMinor: 0,
            clearingMinor: 200000,
          }),
          /equal/,
        );
        await resolveSupplierCredit(pool, b, u, {
          creditId: supplierCredit,
          date,
          reason: "Returned item cost verified",
          allocations: [],
          cogsMinor: 0,
          expenseMinor: 0,
          clearingMinor: 100000,
        });
        assert.equal(await value("Supplier credits pending allocation"), 0);
        assert.equal(await value("Inventory purchasing clearing"), 0);
        assert.equal(await value("Cost of goods sold"), 800000);
        assert.equal(await value("Cash and bank"), cash);
      },
    );
    await t.test(
      "purchase allowance reduces verified on-hand cost and sold cost without double counting",
      async () => {
        const id = await credit(bill, 50000),
          inventory = await value("Inventory");
        await resolveSupplierCredit(pool, b, u, {
          creditId: id,
          date,
          reason: "Verified split across held and sold goods",
          allocations: [{ productId: p, warehouseId: w, amountMinor: 30000 }],
          cogsMinor: 20000,
          expenseMinor: 0,
          clearingMinor: 0,
        });
        assert.equal(await value("Inventory"), inventory - 30000);
        assert.equal(await value("Cost of goods sold"), 780000);
        assert.equal(await value("Supplier credits pending allocation"), 0);
        await assert.rejects(
          resolveSupplierCredit(pool, b, u, {
            creditId: id,
            date,
            reason: "Duplicate allocation retry",
            allocations: [],
            cogsMinor: 50000,
            expenseMinor: 0,
            clearingMinor: 0,
          }),
          /already/,
        );
      },
    );
    await t.test(
      "customer return restores historical dispatch cost without creating cash",
      async () => {
        const cash = await value("Cash and bank"),
          inventory = await value("Inventory");
        await op("Customer return", sale, 1);
        await credit(sale, 150000);
        assert.equal(await value("Inventory"), inventory + 100000);
        assert.equal(await value("Cost of goods sold"), 680000);
        assert.equal(await value("Cash and bank"), cash);
      },
    );
    await t.test(
      "journal idempotency, balanced entries and stock reconciliation hold",
      async () => {
        const before = (
          await pool.query(
            "select count(*)::int n from accounting_journals where business_id=$1",
            [b],
          )
        ).rows[0].n;
        await pool.query("select sync_accounting($1)", [b]);
        await pool.query("select sync_accounting($1)", [b]);
        assert.equal(
          (
            await pool.query(
              "select count(*)::int n from accounting_journals where business_id=$1",
              [b],
            )
          ).rows[0].n,
          before,
        );
        const r = await accountingReport(pool, b, date, date);
        assert.ok(r.active);
        for (const j of r.journals)
          assert.equal(
            j.lines.reduce((n, l) => n + l.amountMinor, 0),
            0,
          );
        assert.equal(
          r.accounts.reduce((n, a) => n + a.closing, 0),
          0,
        );
        assert.equal(await value("Inventory"), r.currentInventoryMinor);
      },
    );
    await t.test(
      "source deletion, rewrites, opening cash edits and unknown costs roll back",
      async () => {
        await assert.rejects(
          pool.query(
            "delete from transactions where business_id=$1 and id=(select transaction_id from invoices where id=$2)",
            [b, sale],
          ),
        );
        await assert.rejects(
          pool.query("update businesses set opening_cash_minor=1 where id=$1", [
            b,
          ]),
          /ACCOUNTING_LOCKED/,
        );
        await assert.rejects(
          pool.query(
            "update payments set amount_minor=amount_minor+1 where business_id=$1",
            [b],
          ),
          /ACCOUNTING_LOCKED/,
        );
        const stock = await value("Inventory");
        await assert.rejects(
          tx((c) =>
            warehouseMove(c, {
              businessId: b,
              productId: p,
              userId: u,
              delta: 1000,
              date,
              kind: "Adjustment in",
              reason: "Unknown cost must fail",
              requestId: randomUUID(),
            }),
          ),
          /ACCOUNTING_COST|total cost/,
        );
        assert.equal(await value("Inventory"), stock);
        await assert.rejects(
          invoice(customer, 1, 10, false, false, "2026-12-01"),
          /Future-dated/,
        );
        await assert.rejects(
          invoice(customer, 1, 10, false, false, "2026-11-27"),
          /ACCOUNTING_DATE/,
        );
      },
    );
    if (concurrent)
      await t.test(
        "concurrent independent invoices create balanced journals exactly once",
        async () => {
          const second = "concurrent-" + randomUUID();
          await pool.query(
            "insert into parties(id,business_id,name,kind) values($1,$2,'Concurrent customer','Customer')",
            [second, b],
          );
          const prior = await value("Sales revenue");
          await Promise.all([
            invoice(customer, 1, 123, false),
            invoice(second, 1, 234, false),
          ]);
          assert.equal(await value("Sales revenue"), prior - 35700);
        },
      );
    await t.test(
      "later-period dispatch matches revenue and COGS while prior P&L remains unchanged",
      async () => {
        const id = await invoice(customer, 1, 2000, true, true),
          prior = await accountingProfit(pool, b, "2026-11");
        process.env.APP_DATE_OVERRIDE = "2026-12-01";
        await op("Dispatch", id, 1, "2026-12-01");
        assert.deepEqual(await accountingProfit(pool, b, "2026-11"), prior);
        const next = await accountingProfit(pool, b, "2026-12");
        assert.equal(next?.lines[0].amount, 2000);
        assert.ok(
          (next?.lines.find((l) => l.label === "Cost of Goods Sold")?.amount ||
            0) > 0,
        );
        await assert.rejects(
          invoice(customer, 1, 10, false, false, date),
          /ACCOUNTING_DATE/,
        );
      },
    );
  } finally {
    if (previousDate === undefined) delete process.env.APP_DATE_OVERRIDE;
    else process.env.APP_DATE_OVERRIDE = previousDate;
  }
}
