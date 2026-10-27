import { inventoryManager } from "./warehouses.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id } from "../domain/validation.js";
import { productInput, adjustmentInput } from "../domain/inventory.js";
import { moveStock } from "../services/inventory.js";
import { ApiError } from "../lib/errors.js";
export async function inventoryRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  const path = "/api/businesses/:businessId/inventory";
  type Params = { businessId: string; id?: string };
  app.patch<{ Params: Params }>(path + "/:id", async (r) => {
    const b = id.parse(r.params.businessId);
    inventoryManager((await auth.requireMembership(r,b)).role);
    const v = z
      .object({
        category:z.string().trim().max(100).optional(),variant:z.string().trim().max(100).optional(),
        name: z.string().trim().min(1).max(160),
        minimum: productInput.shape.minimum,
        active: z.boolean(),
      })
      .strict()
      .parse(r.body);
    const result = await pool.query(
      "update products set name=$3,minimum_milli=$4,active=$5,category=coalesce($6,category),variant=coalesce($7,variant) where business_id=$1 and id=$2 returning id",
      [
        b,
        id.parse(r.params.id),
        v.name,
        Math.round(v.minimum * 1000),
        v.active,v.category??null,v.variant??null,
      ],
    );
    if (!result.rowCount)
      throw new ApiError(404, "PRODUCT_MISSING", "Product not found.");
    return { ok: true };
  });
  app.get<{ Params: Params }>(path, async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    return (
      await pool.query(
        "select p.*,coalesce((select json_agg(json_build_object('name',u.name,'factor',u.factor_milli::numeric/1000)) from product_units u where u.product_id=p.id),'[]'::json) units from products p where business_id=$1 order by name,id",
        [b],
      )
    ).rows.map((p) => ({
      ...p,
      stock_milli: Number(p.stock_milli),
      minimum_milli: Number(p.minimum_milli),
    }));
  });
  app.post<{ Params: Params }>(path, async (r, reply) => {
    const b = id.parse(r.params.businessId),
      { user,role } = await auth.requireMembership(r, b),
      v = productInput.parse(r.body),
      productId = randomUUID(),
      c = await pool.connect();
    try {
      inventoryManager(role);
      await c.query("begin");
      const duplicate = await c.query(
        "select 1 from products where business_id=$1 and sku=$2",
        [b, v.sku],
      );
      if (duplicate.rowCount)
        throw new ApiError(409, "SKU_EXISTS", "This SKU already exists.");
      await c.query(
        "insert into products(id,business_id,sku,name,unit,minimum_milli) values($1,$2,$3,$4,$5,$6)",
        [productId, b, v.sku, v.name, v.unit, Math.round(v.minimum * 1000)],
      );
      await moveStock(c, {
        businessId: b,
        productId,
        delta: Math.round(v.opening * 1000),
        date: v.date,
        kind: "Opening",incomingCost:v.opening===0?0:v.openingValueMinor??null,
        reason: "Opening physical stock",
        userId: user.id,
        requestId: `opening:${productId}`,
      });
      await c.query("update products set category=$2,variant=$3 where id=$1",[productId,v.category||"",v.variant||""]);
      await c.query("commit");
      return reply.status(201).send({ id: productId });
    } catch (e) {
      await c.query("rollback");
      if ((e as { code?: string }).code === "23505")
        throw new ApiError(409, "SKU_EXISTS", "This SKU already exists.");
      throw e;
    } finally {
      c.release();
    }
  });
  app.get<{ Params: Params }>(path + "/:id", async (r) => {
    const b = id.parse(r.params.businessId);
    await auth.requireMembership(r, b);
    const product = (
      await pool.query(
        "select * from products where business_id=$1 and id=$2",
        [b, id.parse(r.params.id)],
      )
    ).rows[0];
    if (!product)
      throw new ApiError(404, "PRODUCT_MISSING", "Product not found.");
    return {
      product,
      movements: (
        await pool.query(
          "select s.*,u.name actor from stock_movements s join users u on u.id=s.user_id where s.business_id=$1 and s.product_id=$2 order by s.date desc,s.created_at desc,s.id",
          [b, product.id],
        )
      ).rows,
    };
  });
  app.post<{ Params: Params }>(path + "/:id/adjustments", async (r, reply) => {
    const b = id.parse(r.params.businessId),
      { user,role } = await auth.requireMembership(r, b),
      v = adjustmentInput.parse(r.body),
      c = await pool.connect();
    try {
      inventoryManager(role);
      await c.query("begin");
      if(v.kind.endsWith("return"))throw new ApiError(400,"LINK_RETURN","Use Stock Operations and select the original document for returns.");
      const outgoing =
        v.kind === "Adjustment out" || v.kind === "Supplier return";
      await moveStock(c, {
        businessId: b,
        productId: id.parse(r.params.id),
        delta: Math.round(v.quantity * 1000) * (outgoing ? -1 : 1),
        date: v.date,
        kind: v.kind,incomingCost:v.incomingCost??null,
        reason: v.reason,
        userId: user.id,
        requestId: v.requestId,
      });
      await c.query("commit");
      return reply.status(201).send({ ok: true });
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });
}
