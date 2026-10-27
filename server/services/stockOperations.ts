import type { DatabasePool } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { type StockOperation } from "../domain/warehouse.js";
import { balance, warehouseMove } from "./warehouseStock.js";
import { fulfillLine } from "./stockFulfillment.js";
import { businessDate } from "./ledger.js";
export async function stockOperation(
  pool: DatabasePool,
  b: string,
  u: string,
  v: StockOperation,
) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `stock:${b}:${v.requestId}`,
    ]);
    const prior = (
      await c.query("select * from inventory_operations where id=$1", [
        v.requestId,
      ])
    ).rows[0];
    if (prior) {
      const canonical = (o: Record<string, unknown>) =>
        JSON.stringify(
          Object.keys(o)
            .sort()
            .map((k) => [k, o[k]]),
        );
      if (prior.business_id !== b || canonical(prior.payload) !== canonical(v))
        throw new ApiError(
          409,
          "REQUEST_REUSED",
          "Operation ID belongs to a different request.",
        );
      await c.query("commit");
      return { ok: true };
    }
    if (v.date > businessDate())
      throw new ApiError(
        400,
        "STOCK_DATE",
        "Stock operations cannot be dated in the future.",
      );
    const q = Math.round(v.quantity * 1000);
    let line;
    if (v.lineId) {
      line = (
        await c.query(
          "select * from stock_lines where id=$1 and business_id=$2 for update",
          [v.lineId, b],
        )
      ).rows[0];
      if (
        !line ||
        line.product_id !== v.productId ||
        line.warehouse_id !== v.warehouseId
      )
        throw new ApiError(
          409,
          "STOCK_LINE",
          "Document, product and warehouse must match.",
        );
    }
    const s = await balance(c, b, v.productId, v.warehouseId),
      common = {
        businessId: b,
        userId: u,
        productId: v.productId,
        warehouseId: v.warehouseId,
        date: v.date,
        reason: v.reason,
        requestId: v.requestId,
      };
    if (
      ["Receive", "Dispatch", "Customer return", "Supplier return"].includes(
        v.kind,
      )
    ) {
      if (
        !line ||
        (v.kind === "Receive" || v.kind === "Supplier return") !==
          (line.kind === "Receive")
      )
        throw new ApiError(
          409,
          "STOCK_LINE",
          "Select a matching issued document line.",
        );
      await fulfillLine(
        c,
        b,
        u,
        line.id,
        q,
        v.date,
        v.requestId,
        v.reason,
        v.kind.endsWith("return"),
      );
    } else if (v.kind === "Reserve" || v.kind === "Release") {
      if (!line || line.kind !== "Dispatch" || q <= 0)
        throw new ApiError(
          409,
          "RESERVATION",
          "Select an outstanding sale and positive quantity.",
        );
      const delta = v.kind === "Reserve" ? q : -q;
      if (
        (delta > 0 &&
          (!s.product.active ||
            q > s.quantity_milli - s.reserved_milli ||
            q >
              Number(line.expected_milli) -
                Number(line.fulfilled_milli) -
                Number(line.reserved_milli))) ||
        (delta < 0 && q > Number(line.reserved_milli))
      )
        throw new ApiError(
          409,
          "RESERVATION",
          "Reservation exceeds available stock or outstanding sale quantity.",
        );
      await c.query(
        "update stock_lines set reserved_milli=reserved_milli+$2 where id=$1",
        [line.id, delta],
      );
      await c.query(
        "update warehouse_stock set reserved_milli=reserved_milli+$3,revision=revision+1 where product_id=$1 and warehouse_id=$2",
        [v.productId, v.warehouseId, delta],
      );
    } else if (v.kind === "Transfer") {
      if (
        !v.targetWarehouseId ||
        v.targetWarehouseId === v.warehouseId ||
        q <= 0
      )
        throw new ApiError(
          400,
          "TRANSFER",
          "Choose different warehouses and positive quantity.",
        );
      await balance(c, b, v.productId, v.targetWarehouseId);
      const cost = await warehouseMove(c, {
        ...common,
        delta: -q,
        kind: "Transfer out",
        requestId: `${v.requestId}:out`,
      });
      await warehouseMove(c, {
        ...common,
        warehouseId: v.targetWarehouseId,
        delta: q,
        incomingCost: cost,
        kind: "Transfer in",
        requestId: `${v.requestId}:in`,
      });
    } else {
      if (v.expectedRevision !== String(s.revision))
        throw new ApiError(
          409,
          "STOCK_CHANGED",
          "Stock changed. Refresh balances and review again.",
        );
      if (v.kind === "Count") {
        const delta = q - s.quantity_milli;
        if (delta > 0 && v.valueMinor === undefined)
          throw new ApiError(
            400,
            "STOCK_COST",
            "Enter total value of additional counted stock.",
          );
        await warehouseMove(c, {
          ...common,
          delta,
          kind: "Physical count",
          incomingCost: delta === 0 ? 0 : v.valueMinor,
        });
      } else {
        if (
          v.valueMinor === undefined ||
          s.quantity_milli === 0 ||
          s.value_minor !== null
        )
          throw new ApiError(
            409,
            "VALUATION",
            "Opening valuation requires positive unvalued stock.",
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
            "Valuation must follow latest movement date.",
          );
        await c.query(
          "update warehouse_stock set value_minor=$3,revision=revision+1 where product_id=$1 and warehouse_id=$2",
          [v.productId, v.warehouseId, v.valueMinor],
        );
        await c.query(
          "insert into stock_movements(id,business_id,product_id,warehouse_id,delta_milli,date,kind,reason,user_id,request_id,cost_minor,value_after_minor) values($1,$2,$3,$4,0,$5,'Opening valuation',$6,$7,$1,$8,$8)",
          [
            v.requestId,
            b,
            v.productId,
            v.warehouseId,
            v.date,
            v.reason,
            u,
            v.valueMinor,
          ],
        );
      }
    }
    await c.query(
      "insert into inventory_operations(id,business_id,user_id,payload) values($1,$2,$3,$4)",
      [v.requestId, b, u, JSON.stringify(v)],
    );
    await c.query("commit");
    return { ok: true };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
