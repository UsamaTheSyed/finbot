import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ApiError } from "../lib/errors.js";
import {
  warehouseInput,
  unitInput,
  operationInput,
} from "../domain/warehouse.js";
import { calendarDate } from "../domain/validation.js";
import { mainWarehouse } from "../services/warehouseStock.js";
import { stockOperation } from "../services/stockOperations.js";
export function inventoryManager(role: string) {
  if (!["Owner", "Admin"].includes(role))
    throw new ApiError(
      403,
      "INVENTORY_PERMISSION",
      "Owner or Admin permission is required for inventory setup and valuation.",
    );
}
export async function warehouseRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  const path = "/api/businesses/:businessId/stock";
  type P = { businessId: string; id: string };
  app.get<{ Params: P }>(path, async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b),
      c = await pool.connect();
    try {
      await mainWarehouse(c, b);
    } finally {
      c.release();
    }
    const data = (
      await pool.query(
        `select
   (select coalesce(json_agg(w order by name),'[]') from warehouses w where business_id=$1) warehouses,
   (select coalesce(json_agg(x order by product_name,warehouse_name),'[]') from (select s.*,p.name product_name,p.sku,p.unit,p.minimum_milli,w.name warehouse_name from warehouse_stock s join products p on p.id=s.product_id join warehouses w on w.id=s.warehouse_id where p.business_id=$1) x) balances,
   (select coalesce(json_agg(x order by invoice_date,display_id),'[]') from (select l.*,i.display_id,i.date invoice_date,p.name product_name,p.unit,w.name warehouse_name from stock_lines l join invoices i on i.id=l.invoice_id join products p on p.id=l.product_id join warehouses w on w.id=l.warehouse_id where l.business_id=$1) x) lines`,
        [b],
      )
    ).rows[0];
    return { ...data, canManage: ["Owner", "Admin"].includes(m.role) };
  });
  app.post<{ Params: P }>(path + "/warehouses", async (r, reply) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    inventoryManager(m.role);
    const v = warehouseInput.parse(r.body);
    try {
      await pool.query(
        "insert into warehouses(id,business_id,name) values($1,$2,$3)",
        [randomUUID(), b, v.name],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "WAREHOUSE_EXISTS",
          "Warehouse name already exists.",
        );
      throw e;
    }
    return reply.status(201).send({ ok: true });
  });
  app.patch<{ Params: P }>(path + "/warehouses/:id", async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    inventoryManager(m.role);
    const v = z.object({ active: z.boolean() }).strict().parse(r.body),
      c = await pool.connect();
    try {
      await c.query("begin");
      const w = (
        await c.query(
          "select * from warehouses where id=$1 and business_id=$2 for update",
          [r.params.id, b],
        )
      ).rows[0];
      if (!w)
        throw new ApiError(404, "WAREHOUSE_MISSING", "Warehouse not found.");
      if (!v.active) {
        if (w.id === `main:${b}`)
          throw new ApiError(
            409,
            "MAIN_WAREHOUSE",
            "Main warehouse must remain active.",
          );
        if (
          (
            await c.query(
              "select 1 from warehouse_stock where warehouse_id=$1 and quantity_milli>0 union all select 1 from stock_lines where warehouse_id=$1 and fulfilled_milli<expected_milli limit 1",
              [w.id],
            )
          ).rowCount
        )
          throw new ApiError(
            409,
            "WAREHOUSE_IN_USE",
            "Transfer stock and complete outstanding documents before archiving.",
          );
      }
      await c.query("update warehouses set active=$2 where id=$1", [
        w.id,
        v.active,
      ]);
      await c.query("commit");
      return { ok: true };
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post<{ Params: P }>(path + "/products/:id/units", async (r, reply) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    inventoryManager(m.role);
    const v = unitInput.parse(r.body),
      c = await pool.connect();
    try {
      await c.query("begin");
      const p = (
        await c.query(
          "select * from products where id=$1 and business_id=$2 for update",
          [r.params.id, b],
        )
      ).rows[0];
      if (!p) throw new ApiError(404, "PRODUCT_MISSING", "Product not found.");
      if (v.name === p.unit)
        throw new ApiError(
          409,
          "UNIT_EXISTS",
          "Base unit already has factor 1.",
        );
      await c.query(
        "insert into product_units(product_id,name,factor_milli) values($1,$2,$3)",
        [p.id, v.name, Math.round(v.factor * 1000)],
      );
      await c.query("commit");
      return reply.status(201).send({ ok: true });
    } catch (e) {
      await c.query("rollback");
      if ((e as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "UNIT_EXISTS",
          "Conversion already exists and is immutable to protect history.",
        );
      throw e;
    } finally {
      c.release();
    }
  });
  app.post<{ Params: P }>(path + "/operations", async (r, reply) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b),
      v = operationInput.parse(r.body);
    if (["Count", "Valuation"].includes(v.kind)) inventoryManager(m.role);
    return reply.status(201).send(await stockOperation(pool, b, m.user.id, v));
  });
  app.get<{ Params: P }>(path + "/reports", async (r) => {
    const b = r.params.businessId;
    await auth.requireMembership(r, b);
    const v = z
      .object({
        from: calendarDate,
        to: calendarDate,
        warehouseId: z.string().optional(),
      })
      .parse(r.query);
    if (v.from > v.to)
      throw new ApiError(
        400,
        "DATE_RANGE",
        "Start date must precede end date.",
      );
    const client = await pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const movements = (
        await client.query(
          `select s.*,p.name product_name,p.sku,p.unit,w.name warehouse_name,u.name actor,i.display_id from stock_movements s join products p on p.id=s.product_id left join warehouses w on w.id=s.warehouse_id join users u on u.id=s.user_id left join invoices i on i.id=s.invoice_id where s.business_id=$1 and s.date between $2 and $3 and ($4::text is null or s.warehouse_id=$4) order by s.date,s.created_at,s.sequence`,
          [b, v.from, v.to, v.warehouseId || null],
        )
      ).rows;
      const valuation = (
        await client.query(
          `select p.id,p.sku,p.name,p.unit,w.name warehouse_name,coalesce(sum(s.delta_milli),0)::text quantity_milli,
   CASE WHEN coalesce(sum(s.delta_milli),0)=0 THEN 0 ELSE (select m.value_after_minor from stock_movements m where m.product_id=p.id and m.warehouse_id=w.id and m.date<=$2 order by m.date desc,m.created_at desc,m.sequence desc limit 1) END value_minor
   from products p join warehouse_stock ws on ws.product_id=p.id join warehouses w on w.id=ws.warehouse_id left join stock_movements s on s.product_id=p.id and s.warehouse_id=w.id and s.date<=$2 where p.business_id=$1 and ($3::text is null or w.id=$3) group by p.id,w.id order by p.name,w.name`,
          [b, v.to, v.warehouseId || null],
        )
      ).rows;
      const operations = (
        await client.query(
          "select o.id,o.payload,o.created_at,u.name actor from inventory_operations o join users u on u.id=o.user_id where o.business_id=$1 and (o.payload->>'date')::date between $2 and $3 and ($4::text is null or o.payload->>'warehouseId'=$4 or o.payload->>'targetWarehouseId'=$4) order by o.created_at,o.id",
          [b, v.from, v.to, v.warehouseId || null],
        )
      ).rows;
      await client.query("commit");
      return { movements, valuation, operations };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  });
}
