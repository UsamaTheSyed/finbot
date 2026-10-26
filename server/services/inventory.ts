import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError } from "../lib/errors.js";
import type { InvoiceInput } from "../domain/validation.js";
import { businessDate } from "./ledger.js";
import { stockAfter } from "../domain/inventory.js";
// All callers hold their party/document locks before taking sorted product locks.
export async function validateProducts(
  client: PoolClient,
  businessId: string,
  items: InvoiceInput["items"],
) {
  const ids = [
    ...new Set(items.flatMap((i) => (i.productId ? [i.productId] : []))),
  ].sort();
  for (const id of ids) {
    const { rows } = await client.query(
      "select * from products where id=$1 and business_id=$2 for update",
      [id, businessId],
    );
    const product = rows[0];
    if (!product || !product.active)
      throw new ApiError(
        409,
        "PRODUCT_UNAVAILABLE",
        "A selected product is unavailable. Refresh the product list.",
      );
    if (items.some((i) => i.productId === id && i.unit !== product.unit))
      throw new ApiError(
        400,
        "PRODUCT_UNIT",
        "Use the product's stock unit; automatic unit conversion is not supported.",
      );
  }
}
export async function moveStock(
  client: PoolClient,
  input: {
    businessId: string;
    productId: string;
    delta: number;
    date: string;
    kind: string;
    reason: string;
    userId: string;
    requestId: string;
    invoiceId?: string;
  },
) {
  if (input.date > businessDate())
    throw new ApiError(
      400,
      "STOCK_DATE",
      "Physical stock cannot be recorded in the future.",
    );
  const { rows } = await client.query(
    "select * from products where business_id=$1 and id=$2 for update",
    [input.businessId, input.productId],
  );
  if (!rows[0])
    throw new ApiError(404, "PRODUCT_MISSING", "Product not found.");
  // Replay is handled before balance validation, including retries after stock changes.
  const prior = await client.query(
    "select * from stock_movements where business_id=$1 and request_id=$2",
    [input.businessId, input.requestId],
  );
  if (prior.rows[0]) {
    const r = prior.rows[0];
    if (
      r.product_id !== input.productId ||
      Number(r.delta_milli) !== input.delta ||
      r.date !== input.date ||
      r.kind !== input.kind ||
      r.reason !== input.reason
    )
      throw new ApiError(
        409,
        "STOCK_REQUEST_REUSED",
        "Request already used for a different stock movement.",
      );
    return;
  }
  const latest = await client.query(
    "select max(date) date from stock_movements where product_id=$1",
    [input.productId],
  );
  if (latest.rows[0]?.date && input.date < latest.rows[0].date)
    throw new ApiError(
      409,
      "STOCK_DATE",
      "Stock movements must follow the latest movement date for this product.",
    );
  let next: number;
  try {
    next = stockAfter(Number(rows[0].stock_milli), input.delta);
  } catch {
    throw new ApiError(
      409,
      "INSUFFICIENT_STOCK",
      `Insufficient stock for ${rows[0].name}. Available: ${Number(rows[0].stock_milli) / 1000} ${rows[0].unit}.`,
    );
  }
  await client.query(
    "update products set stock_milli=$3 where business_id=$1 and id=$2",
    [input.businessId, input.productId, next],
  );
  await client.query(
    `insert into stock_movements(id,business_id,product_id,delta_milli,date,kind,reason,user_id,request_id,invoice_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      randomUUID(),
      input.businessId,
      input.productId,
      input.delta,
      input.date,
      input.kind,
      input.reason,
      input.userId,
      input.requestId,
      input.invoiceId || null,
    ],
  );
}
export async function postInvoiceStock(
  client: PoolClient,
  businessId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceInput,
  supplier: boolean,
) {
  const grouped = new Map<string, number>();
  for (const i of input.items)
    if (i.productId)
      grouped.set(
        i.productId,
        (grouped.get(i.productId) || 0) + Math.round(i.quantity * 1000),
      );
  for (const [productId, quantity] of [...grouped].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    await moveStock(client, {
      businessId,
      userId,
      invoiceId,
      productId,
      delta: supplier ? quantity : -quantity,
      date: input.date,
      kind: supplier ? "Purchase" : "Sale",
      reason: "Issued document",
      requestId: `invoice:${invoiceId}:${productId}`,
    });
}
