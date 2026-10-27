import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { ApiError } from "../lib/errors.js";
import { weightedMove } from "../domain/warehouse.js";
import { businessDate } from "./ledger.js";
export async function mainWarehouse(c: PoolClient, b: string) {
  const id = `main:${b}`;
  await c.query(
    "insert into warehouses(id,business_id,name) values($1,$2,'Main warehouse') on conflict(id) do nothing",
    [id, b],
  );
  return id;
}
export async function balance(c: PoolClient, b: string, p: string, w: string) {
  const wh = (
    await c.query(
      "select id from warehouses where id=$1 and business_id=$2 and active=true for share",
      [w, b],
    )
  ).rows[0];
  if (!wh)
    throw new ApiError(404, "WAREHOUSE_MISSING", "Active warehouse not found.");
  const product = (
    await c.query(
      "select * from products where id=$1 and business_id=$2 for update",
      [p, b],
    )
  ).rows[0];
  if (!product)
    throw new ApiError(404, "PRODUCT_MISSING", "Product not found.");
  await c.query(
    "insert into warehouse_stock(product_id,warehouse_id,quantity_milli,value_minor) values($1,$2,0,0) on conflict do nothing",
    [p, w],
  );
  const r = (
    await c.query(
      "select * from warehouse_stock where product_id=$1 and warehouse_id=$2 for update",
      [p, w],
    )
  ).rows[0];
  return {
    ...r,
    quantity_milli: Number(r.quantity_milli),
    reserved_milli: Number(r.reserved_milli),
    value_minor: r.value_minor === null ? null : Number(r.value_minor),
    product,
  };
}
export type Move = {
  businessId: string;
  productId: string;
  warehouseId?: string;
  delta: number;
  date: string;
  kind: string;
  reason: string;
  userId: string;
  requestId: string;
  invoiceId?: string;
  lineId?: string;
  incomingCost?: number | null;
};
export async function warehouseMove(c: PoolClient, v: Move) {
  const w = v.warehouseId || (await mainWarehouse(c, v.businessId)),
    s = await balance(c, v.businessId, v.productId, w);
  const previous = (
    await c.query(
      "select * from stock_movements where business_id=$1 and request_id=$2",
      [v.businessId, v.requestId],
    )
  ).rows[0];
  if (previous) {
    if (
      previous.product_id !== v.productId ||
      previous.warehouse_id !== w ||
      Number(previous.delta_milli) !== v.delta ||
      previous.date !== v.date ||
      previous.kind !== v.kind ||
      previous.reason !== v.reason ||
      (v.incomingCost !== undefined &&
        previous.cost_minor !== null &&
        Number(previous.cost_minor) !== v.incomingCost)
    )
      throw new ApiError(
        409,
        "STOCK_REQUEST_REUSED",
        "Movement request changed.",
      );
    return previous.cost_minor === null ? null : Number(previous.cost_minor);
  }
  if (v.date > businessDate())
    throw new ApiError(
      400,
      "STOCK_DATE",
      "Physical stock cannot be recorded in the future.",
    );
  const latest = (
    await c.query(
      "select max(date) date from stock_movements where product_id=$1",
      [v.productId],
    )
  ).rows[0]?.date;
  if (latest && v.date < latest)
    throw new ApiError(
      409,
      "STOCK_DATE",
      "Movement must follow this product's latest stock date.",
    );
  if (s.quantity_milli + v.delta < s.reserved_milli)
    throw new ApiError(
      409,
      "INSUFFICIENT_STOCK",
      "Insufficient stock available in this warehouse; reserved stock is excluded.",
    );
  if (v.delta > 0 && v.kind === "Adjustment in" && v.incomingCost == null)
    throw new ApiError(
      400,
      "STOCK_COST",
      "Enter the total cost of additional stock.",
    );
  if (!Number.isSafeInteger(Number(s.product.stock_milli) + v.delta))
    throw new ApiError(
      400,
      "STOCK_QUANTITY",
      "Unsupported total stock quantity.",
    );
  const result = weightedMove(
    s.quantity_milli,
    s.value_minor,
    v.delta,
    v.incomingCost ?? null,
  );
  await c.query(
    "update warehouse_stock set quantity_milli=$3,value_minor=$4,revision=revision+1 where product_id=$1 and warehouse_id=$2",
    [v.productId, w, result.quantity, result.value],
  );
  await c.query("update products set stock_milli=stock_milli+$2 where id=$1", [
    v.productId,
    v.delta,
  ]);
  await c.query(
    `insert into stock_movements(id,business_id,product_id,warehouse_id,delta_milli,date,kind,reason,user_id,request_id,invoice_id,line_id,cost_minor,value_after_minor) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      randomUUID(),
      v.businessId,
      v.productId,
      w,
      v.delta,
      v.date,
      v.kind,
      v.reason,
      v.userId,
      v.requestId,
      v.invoiceId || null,
      v.lineId || null,
      result.cost,
      result.value,
    ],
  );
  const before = Number(s.product.stock_milli),
    after = before + v.delta,
    min = Number(s.product.minimum_milli);
  if (before > min && after <= min && v.kind !== "Transfer out")
    await c.query(
      "insert into notifications(id,business_id,title,description,event_date,read,href) values($1,$2,'Low stock',$3,$4,false,$5)",
      [
        randomUUID(),
        v.businessId,
        `${s.product.name}: ${after / 1000} ${s.product.unit} remaining.`,
        v.date,
        `/inventory/${v.productId}`,
      ],
    );
  return result.cost;
}
