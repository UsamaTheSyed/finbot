import type { PoolClient } from "pg";
import { ApiError } from "../lib/errors.js";
import type { InvoiceInput } from "../domain/validation.js";
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
    const units=items.some(i=>i.productId===id&&i.unit!==product.unit)?(await client.query("select name from product_units where product_id=$1",[id])).rows:[];
    if (items.some((i) => i.productId === id && i.unit !== product.unit && !units.some(u=>u.name===i.unit)))
      throw new ApiError(
        400,
        "PRODUCT_UNIT",
        "Choose the stock unit or a configured conversion.",
      );
  }
}
export { warehouseMove as moveStock } from "./warehouseStock.js";
export { initializeStockLines as postInvoiceStock } from "./stockFulfillment.js";
