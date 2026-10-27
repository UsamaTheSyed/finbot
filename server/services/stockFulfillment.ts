import type { PoolClient } from "pg";
import type { InvoiceInput } from "../domain/validation.js";
import { calculateInvoice } from "../domain/money.js";
import { converted, portion } from "../domain/warehouse.js";
import { ApiError } from "../lib/errors.js";
import { mainWarehouse, warehouseMove, balance } from "./warehouseStock.js";
export async function initializeStockLines(
  c: PoolClient,
  b: string,
  u: string,
  id: string,
  input: InvoiceInput,
  supplier: boolean,
) {
  if (!input.items.some((i) => i.productId)) return;
  const w = input.warehouseId || (await mainWarehouse(c, b)),
    totals = calculateInvoice(input),
    groups = new Map<string, { qty: number; cost: number }>();
  let cumulative = 0,
    priorDiscount = 0;
  for (const item of totals.items) {
    cumulative += item.baseMinor;
    const discount = totals.subtotalMinor
        ? portion(
            Math.min(totals.discountMinor, totals.subtotalMinor),
            cumulative,
            totals.subtotalMinor,
          )
        : 0,
      cost = item.baseMinor - (discount - priorDiscount);
    priorDiscount = discount;
    if (!item.productId) continue;
    const p = (
      await c.query(
        "select unit from products where id=$1 and business_id=$2",
        [item.productId, b],
      )
    ).rows[0];
    const factor =
      item.unit === p.unit
        ? 1000
        : Number(
            (
              await c.query(
                "select factor_milli from product_units where product_id=$1 and name=$2",
                [item.productId, item.unit],
              )
            ).rows[0]?.factor_milli,
          );
    let qty: number;
    try {
      qty = converted(item.quantityMilli, factor);
    } catch {
      throw new ApiError(
        400,
        "UNIT_PRECISION",
        "Use quantities convertible to 0.001 stock units.",
      );
    }
    const g = groups.get(item.productId) || { qty: 0, cost: 0 };
    g.qty += qty;
    g.cost += cost;
    groups.set(item.productId, g);
  }
  for (const [p, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    await balance(c, b, p, w);
    const lineId = `${id}:${p}`;
    await c.query(
      "insert into stock_lines(id,business_id,invoice_id,product_id,warehouse_id,kind,expected_milli,purchase_minor,fulfilled_cost_minor) values($1,$2,$3,$4,$5,$6,$7,$8,0)",
      [lineId, b, id, p, w, supplier ? "Receive" : "Dispatch", g.qty, g.cost],
    );
    if (input.stockMode !== "Deferred")
      await fulfillLine(
        c,
        b,
        u,
        lineId,
        g.qty,
        input.date,
        `invoice:${id}:${p}`,
        "Issued document",
      );
  }
}
export async function fulfillLine(
  c: PoolClient,
  b: string,
  u: string,
  lineId: string,
  qty: number,
  date: string,
  requestId: string,
  reason: string,
  returning = false,
) {
  const l = (
    await c.query(
      "select l.*,i.date invoice_date from stock_lines l join invoices i on i.id=l.invoice_id where l.id=$1 and l.business_id=$2 for update of l",
      [lineId, b],
    )
  ).rows[0];
  if (!l)
    throw new ApiError(404, "STOCK_LINE", "Stock document line not found.");
  if (date < l.invoice_date)
    throw new ApiError(
      400,
      "STOCK_DATE",
      "Movement cannot precede invoice date.",
    );
  const expected = Number(l.expected_milli),
    done = Number(l.fulfilled_milli),
    returned = Number(l.returned_milli),
    reserved = Number(l.reserved_milli);
  if (qty <= 0 || qty > (returning ? done - returned : expected - done))
    throw new ApiError(
      409,
      "STOCK_QUANTITY",
      "Quantity exceeds the outstanding document quantity.",
    );
  const receiving = l.kind === "Receive",
    s = await balance(c, b, l.product_id, l.warehouse_id);
  if (!returning && !s.product.active)
    throw new ApiError(
      409,
      "PRODUCT_UNAVAILABLE",
      "Activate product before receiving or dispatching.",
    );
  const release = !receiving && !returning ? Math.min(qty, reserved) : 0;
  if (release)
    await c.query(
      "update warehouse_stock set reserved_milli=reserved_milli-$3 where product_id=$1 and warehouse_id=$2",
      [l.product_id, l.warehouse_id, release],
    );
  let incoming: number | null = null;
  if (receiving && !returning)
    incoming =
      portion(Number(l.purchase_minor), done + qty, expected) -
      portion(Number(l.purchase_minor), done, expected);
  if (!receiving && returning && l.fulfilled_cost_minor !== null) {
    // Split the still-returnable cost; previous returns must never be costed twice.
    incoming = portion(
      Number(l.fulfilled_cost_minor) - Number(l.returned_cost_minor),
      qty,
      done - returned,
    );
  }
  const cost = await warehouseMove(c, {
    businessId: b,
    productId: l.product_id,
    warehouseId: l.warehouse_id,
    invoiceId: l.invoice_id,
    lineId: l.id,
    userId: u,
    requestId,
    delta: (receiving !== returning ? 1 : -1) * qty,
    date,
    kind: returning
      ? receiving
        ? "Supplier return"
        : "Customer return"
      : receiving
        ? "Purchase"
        : "Sale",
    reason,
    incomingCost: incoming,
  });
  if (returning)
    await c.query(
      "update stock_lines set returned_milli=returned_milli+$2,returned_cost_minor=returned_cost_minor+$3 where id=$1",
      [l.id, qty, cost ?? 0],
    );
  else
    await c.query(
      "update stock_lines set fulfilled_milli=fulfilled_milli+$2,reserved_milli=reserved_milli-$3,fulfilled_cost_minor=case when fulfilled_cost_minor is null or $4::bigint is null then null else fulfilled_cost_minor+$4 end where id=$1",
      [l.id, qty, release, cost],
    );
}
