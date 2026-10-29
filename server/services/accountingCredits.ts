import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { businessDate } from "./ledger.js";
import { safeMinor, sumMinor } from "../../src/utils/money.js";
import { balance } from "./warehouseStock.js";
import type { JournalLine } from "./accountingOpening.js";
export interface CreditAllocationInput {
  creditId: string;
  date: string;
  reason: string;
  cogsMinor: number;
  clearingMinor: number;
  expenseMinor: number;
  allocations: {
    productId: string;
    warehouseId: string;
    amountMinor: number;
  }[];
}
const n = (value: unknown) => safeMinor(Number(value));
export async function resolveSupplierCredit(
  pool: DatabasePool,
  b: string,
  u: string,
  v: CreditAllocationInput,
) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const credit = (
      await c.query(
        "select c.*,j.lines from credit_notes c join accounting_journals j on j.business_id=c.business_id and j.source='document:'||c.id where c.business_id=$1 and c.id=$2 for update of c",
        [b, v.creditId],
      )
    ).rows[0];
    if (
      !credit ||
      !credit.lines.some(
        (l: JournalLine) => l.account === "Supplier credits pending allocation",
      )
    )
      throw new ApiError(
        404,
        "CREDIT_MISSING",
        "Unallocated supplier credit not found.",
      );
    await c.query("select id from invoices where id=$1 for update", [
      credit.invoice_id,
    ]);
    if (
      (
        await c.query(
          "select 1 from accounting_credit_resolutions where credit_id=$1",
          [v.creditId],
        )
      ).rowCount
    )
      throw new ApiError(
        409,
        "CREDIT_ALLOCATED",
        "This credit has already been allocated.",
      );
    const net = n(credit.subtotal_minor) - n(credit.discount_minor),
      inventoryMinor = sumMinor(v.allocations.map((a) => a.amountMinor));
    if (
      sumMinor([
        inventoryMinor,
        v.cogsMinor,
        v.clearingMinor,
        v.expenseMinor,
      ]) !== net ||
      v.date < credit.date ||
      v.date > businessDate()
    )
      throw new ApiError(
        400,
        "CREDIT_ALLOCATION",
        "Allocation must equal the net credit and use a valid effective date.",
      );
    if (
      new Set(v.allocations.map((a) => a.productId + ":" + a.warehouseId))
        .size !== v.allocations.length
    )
      throw new ApiError(
        400,
        "CREDIT_ALLOCATION",
        "Combine duplicate product and warehouse allocations.",
      );
    const returned = n(
      (
        await c.query(
          "select coalesce(sum(cost_minor),0) n from stock_movements where invoice_id=$1 and kind='Supplier return' and date<=$2",
          [credit.invoice_id, v.date],
        )
      ).rows[0].n,
    );
    const prior = n(
      (
        await c.query(
          "select coalesce(sum(r.clearing_minor),0) n from accounting_credit_resolutions r join credit_notes cn on cn.id=r.credit_id where cn.invoice_id=$1",
          [credit.invoice_id],
        )
      ).rows[0].n,
    );
    if (v.clearingMinor > returned - prior)
      throw new ApiError(
        400,
        "RETURN_ALLOCATION",
        "Returned-goods allocation exceeds unallocated physical return cost.",
      );
    for (const a of [...v.allocations].sort((x, y) =>
      (x.productId + x.warehouseId).localeCompare(y.productId + y.warehouseId),
    )) {
      if (
        !(
          await c.query(
            "select 1 from invoice_items where invoice_id=$1 and product_id=$2",
            [credit.invoice_id, a.productId],
          )
        ).rowCount
      )
        throw new ApiError(
          400,
          "PRODUCT_MISMATCH",
          "Product must belong to the credited bill.",
        );
      const stock = await balance(c, b, a.productId, a.warehouseId);
      const last = (
        await c.query(
          "select max(date) date from stock_movements where product_id=$1",
          [a.productId],
        )
      ).rows[0].date;
      if (
        stock.quantity_milli <= 0 ||
        stock.value_minor === null ||
        stock.value_minor < a.amountMinor ||
        last > v.date
      )
        throw new ApiError(
          409,
          "STOCK_VALUE",
          "Stock value or movement date does not permit this adjustment.",
        );
      await c.query(
        "update warehouse_stock set value_minor=value_minor-$3,revision=revision+1 where product_id=$1 and warehouse_id=$2",
        [a.productId, a.warehouseId, a.amountMinor],
      );
      await c.query(
        "insert into stock_movements(id,business_id,product_id,warehouse_id,delta_milli,date,kind,reason,user_id,request_id,cost_minor,value_after_minor,invoice_id) values($1,$2,$3,$4,0,$5,'Supplier cost credit',$6,$7,$1,$8,$9,$10)",
        [
          randomUUID(),
          b,
          a.productId,
          a.warehouseId,
          v.date,
          v.reason,
          u,
          a.amountMinor,
          stock.value_minor - a.amountMinor,
          credit.invoice_id,
        ],
      );
    }
    await c.query(
      "insert into accounting_credit_resolutions(id,business_id,credit_id,user_id,date,inventory_minor,cogs_minor,clearing_minor,expense_minor,allocations,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        randomUUID(),
        b,
        v.creditId,
        u,
        v.date,
        inventoryMinor,
        v.cogsMinor,
        v.clearingMinor,
        v.expenseMinor,
        JSON.stringify(v.allocations),
        v.reason,
      ],
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
