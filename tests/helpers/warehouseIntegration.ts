import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
export async function warehouseIntegration(
  t: TestContext,
  app: FastifyInstance,
  pool: Pool,
  headers: { cookie: string },
) {
  const base = "/api/businesses/business-1",
    date = "2026-11-28";
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
  const p = await post("/inventory", {
    sku: "WAREHOUSE-" + randomUUID(),
    name: "Warehouse rice",
    unit: "kg",
    opening: 0,
    minimum: 1,
    date,
  });
  const supplier = await post("/parties", {
    name: "Warehouse supplier",
    kind: "Supplier",
    phone: "",
    email: "",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const customer = await post("/parties", {
    name: "Warehouse customer",
    kind: "Customer",
    phone: "",
    email: "",
    ntn: "",
    address: "Karachi",
    paymentTerms: "Net 30",
  });
  const make = (partyId: string, qty: number, unit = "kg") => ({
    partyId,
    date,
    dueDate: "2026-12-28",
    reference: "Stock QA",
    items: [
      {
        productId: p.id,
        item: "Rice",
        description: "",
        quantity: qty,
        unit,
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
    stockMode: "Deferred",
  });
  const op = (
    kind: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => ({
    requestId: randomUUID(),
    kind,
    quantity,
    productId: p.id,
    warehouseId: "main:business-1",
    date,
    reason: "Warehouse verification",
    ...extra,
  });
  const balance = async (w = "main:business-1") =>
    (
      await pool.query(
        "select * from warehouse_stock where product_id=$1 and warehouse_id=$2",
        [p.id, w],
      )
    ).rows[0];
  let receipt = "",
    sale = "",
    target = "";
  await t.test(
    "converted deferred receipts post exact partial quantity and purchase cost",
    async () => {
      await post(`/stock/products/${p.id}/units`, { name: "Bag", factor: 10 });
      const draft = await post("/invoices", {
        ...make(supplier.id, 1, "Bag"),
        draft: true,
      });
      assert.equal(Number((await balance())?.quantity_milli || 0), 0);
      assert.ok(draft.id);
      const inv = await post("/invoices", make(supplier.id, 1, "Bag"));
      receipt = `${inv.id}:${p.id}`;
      assert.equal(Number((await balance()).quantity_milli), 0);
      await post("/stock/operations", op("Receive", 6, { lineId: receipt }));
      assert.equal(Number((await balance()).quantity_milli), 6000);
      assert.equal(Number((await balance()).value_minor), 60000);
    },
  );
  await t.test(
    "reservations protect stock and dispatch/returns conserve cost without cash",
    async () => {
      const inv = await post("/invoices", make(customer.id, 4));
      sale = `${inv.id}:${p.id}`;
      const cash = (
        await pool.query(
          "select count(*)::int n from payments where business_id='business-1'",
        )
      ).rows[0].n;
      await post("/stock/operations", op("Reserve", 4, { lineId: sale }));
      assert.equal(Number((await balance()).reserved_milli), 4000);
      await post(
        "/stock/operations",
        op("Count", 1, {
          expectedRevision: String((await balance()).revision),
        }),
        409,
      );
      await post("/stock/operations", op("Dispatch", 4, { lineId: sale }));
      assert.equal(Number((await balance()).reserved_milli), 0);
      assert.equal(Number((await balance()).quantity_milli), 2000);
      await post(
        "/stock/operations",
        op("Customer return", 1, { lineId: sale }),
      );
      assert.equal(Number((await balance()).value_minor), 30000);
      await post(
        "/stock/operations",
        op("Customer return", 4, { lineId: sale }),
        409,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from payments where business_id='business-1'",
          )
        ).rows[0].n,
        cash,
      );
    },
  );
  await t.test(
    "transfers conserve value, replay safely and reject stale counts",
    async () => {
      await post("/stock/warehouses", { name: "QA " + randomUUID() });
      target = (
        await pool.query(
          "select id from warehouses where business_id='business-1' and id <> 'main:business-1' order by name limit 1",
        )
      ).rows[0].id;
      const v = op("Transfer", 1, { targetWarehouseId: target });
      await post("/stock/operations", v);
      await post("/stock/operations", v);
      await post("/stock/operations", { ...v, quantity: 2 }, 409);
      assert.equal(Number((await balance(target)).value_minor), 10000);
      assert.equal(Number((await balance()).value_minor), 20000);
      const revision = String((await balance()).revision);
      await post(
        "/stock/operations",
        op("Count", 1, { expectedRevision: revision }),
      );
      await post(
        "/stock/operations",
        op("Count", 0, { expectedRevision: revision }),
        409,
      );
      const report = await app.inject({
        method: "GET",
        url: base + `/stock/reports?from=${date}&to=${date}`,
        headers,
      });
      assert.equal(report.statusCode, 200, report.body);
      assert.ok(report.json().movements.length);
    },
  );
  await t.test(
    "supplier returns require fulfilled goods and correct workspace",
    async () => {
      await post(
        "/stock/operations",
        op("Supplier return", 1, { lineId: receipt }),
      );
      assert.equal(Number((await balance()).quantity_milli), 0);
      await post(
        "/stock/operations",
        op("Supplier return", 7, { lineId: receipt }),
        409,
      );
      await post(
        "/stock/operations",
        op("Transfer", 1, {
          warehouseId: "missing",
          targetWarehouseId: target,
        }),
        404,
      );
    },
  );
  await t.test(
    "concurrent transfers cannot consume the same stock twice",
    async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          app.inject({
            method: "POST",
            url: base + "/stock/operations",
            headers,
            payload: op("Transfer", 1, {
              warehouseId: target,
              targetWarehouseId: "main:business-1",
            }),
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
      assert.equal(Number((await balance(target)).quantity_milli), 0);
      assert.equal(Number((await balance()).quantity_milli), 1000);
    },
  );
  await t.test(
    "unknown opening cost requires explicit valuation and rejects stale revaluation",
    async () => {
      const legacy = await post("/inventory", {
        sku: "UNKNOWN-" + randomUUID(),
        name: "Unknown cost",
        unit: "pcs",
        opening: 2,
        minimum: 0,
        date,
      });
      const row = (
        await pool.query("select * from warehouse_stock where product_id=$1", [
          legacy.id,
        ])
      ).rows[0];
      assert.equal(row.value_minor, null);
      await post(
        "/stock/operations",
        op("Valuation", 0, {
          productId: legacy.id,
          expectedRevision: String(row.revision),
          valueMinor: 12345,
        }),
      );
      const after = (
        await pool.query("select * from warehouse_stock where product_id=$1", [
          legacy.id,
        ])
      ).rows[0];
      assert.equal(Number(after.value_minor), 12345);
      await post(
        "/stock/operations",
        op("Valuation", 0, {
          productId: legacy.id,
          expectedRevision: String(after.revision),
          valueMinor: 12345,
        }),
        409,
      );
    },
  );
}
