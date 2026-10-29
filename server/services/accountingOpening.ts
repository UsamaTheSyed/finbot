import { createHash } from "node:crypto";
import type { DatabasePool } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { businessDate, type Queryable } from "./ledger.js";
import { safeMinor, sumMinor } from "../../src/utils/money.js";
export interface JournalLine {
  account: string;
  amountMinor: number;
}
const n = (value: unknown) => safeMinor(Number(value));
export async function openingPreview(c: Queryable, b: string, date: string) {
  const sources = (
    await c.query(
      "select source,date,md5(jsonb_build_object('date',date,'payload',payload)::text) hash from accounting_sources where business_id=$1 order by source",
      [b],
    )
  ).rows;
  const stock = (
    await c.query(
      `select s.*,p.name,p.sku,w.name warehouse from warehouse_stock s join products p on p.id=s.product_id join warehouses w on w.id=s.warehouse_id where p.business_id=$1 order by s.product_id,s.warehouse_id`,
      [b],
    )
  ).rows;
  const parties = (
    await c.query(
      `select p.id,p.name,p.kind,coalesce((select sum(case m.type when 'Sale' then m.total_minor else -m.total_minor end) from ledger_movements m where m.business_id=$1 and m.party_id=p.id),0)+coalesce((select sum(case direction when 'Received' then -amount_minor else amount_minor end) from payments x where x.business_id=$1 and x.party_id=p.id and status='Completed'),0) balance from parties p where business_id=$1 order by id`,
      [b],
    )
  ).rows;
  const cash = n(
    (
      await c.query(
        `select opening_cash_minor+coalesce((select sum(case direction when 'Received' then amount_minor else -amount_minor end) from payments where business_id=$1 and status='Completed'),0) value from businesses where id=$1`,
        [b],
      )
    ).rows[0]?.value || 0,
  );
  const unfinished = (
    await c.query(
      "select count(*)::int n from stock_lines where business_id=$1 and fulfilled_milli<expected_milli",
      [b],
    )
  ).rows[0].n;
  const blockers: string[] = [];
  if (date !== businessDate())
    blockers.push(
      "Activate on the current business date after reviewing current balances.",
    );
  if (sources.some((s) => s.date > date))
    blockers.push("Resolve future-dated records before activation.");
  if (stock.some((s) => Number(s.quantity_milli) > 0 && s.value_minor === null))
    blockers.push("Value all positive stock before activation.");
  if (unfinished)
    blockers.push(
      "Complete outstanding receipts and dispatches before activation.",
    );
  const inventory = sumMinor(stock.map((s) => n(s.value_minor || 0))),
    customer = sumMinor(
      parties.filter((p) => p.kind === "Customer").map((p) => n(p.balance)),
    ),
    supplier = sumMinor(
      parties.filter((p) => p.kind === "Supplier").map((p) => n(p.balance)),
    );
  const snapshot = {
    date,
    cash,
    inventory,
    customer,
    supplier,
    parties: parties.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      kind: String(p.kind),
      balance: n(p.balance),
    })),
    stock: stock.map((s) => ({
      productId: String(s.product_id),
      warehouseId: String(s.warehouse_id),
      name: String(s.name),
      warehouse: String(s.warehouse),
      quantityMilli: n(s.quantity_milli),
      valueMinor: s.value_minor === null ? null : n(s.value_minor),
    })),
  };
  const baseline = Object.fromEntries(sources.map((s) => [s.source, s.hash]));
  const token = createHash("sha256")
    .update(JSON.stringify({ snapshot, baseline }))
    .digest("hex");
  return { ...snapshot, token, blockers, baseline };
}
export interface OpeningInput {
  date: string;
  token: string;
  cash: number;
  inventory: number;
  customer: number;
  supplier: number;
  inputTax: number;
  outputTax: number;
  confirmed: boolean;
}
export async function activateAccounting(
  pool: DatabasePool,
  b: string,
  userId: string,
  v: OpeningInput,
) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    // Freeze the snapshot against every financial writer before taking the journal lock.
    await c.query(
      "lock table transactions,payments,stock_movements,invoices,stock_lines,warehouse_stock,products,invoice_corrections,credit_notes,parties,businesses,accounting_cutovers in share row exclusive mode",
    );
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "accounting:" + b,
    ]);
    if (
      (
        await c.query(
          "select 1 from accounting_cutovers where business_id=$1",
          [b],
        )
      ).rowCount
    )
      throw new ApiError(
        409,
        "ACCOUNTING_ACTIVE",
        "Accounting is already active.",
      );
    const preview = await openingPreview(c, b, v.date);
    if (preview.blockers.length)
      throw new ApiError(409, "OPENING_INCOMPLETE", preview.blockers.join(" "));
    if (
      v.token !== preview.token ||
      (["cash", "inventory", "customer", "supplier"] as const).some(
        (k) => v[k] !== preview[k],
      ) ||
      !v.confirmed
    )
      throw new ApiError(
        409,
        "OPENING_CHANGED",
        "Balances changed or verification is incomplete. Load a fresh preview.",
      );
    const lines: JournalLine[] = [
      { account: "Cash and bank", amountMinor: preview.cash },
      { account: "Inventory", amountMinor: preview.inventory },
      { account: "Customer control", amountMinor: preview.customer },
      { account: "Supplier control", amountMinor: preview.supplier },
      { account: "Input tax control", amountMinor: v.inputTax },
      { account: "Output tax control", amountMinor: -v.outputTax },
    ];
    lines.push({
      account: "Opening equity",
      amountMinor: -sumMinor(lines.map((l) => l.amountMinor)),
    });
    const {
      baseline,
      blockers: _blockers,
      token: _token,
      ...snapshot
    } = preview;
    void _blockers;
    void _token;
    await c.query(
      "insert into accounting_cutovers(business_id,date,user_id,snapshot,baseline) values($1,$2,$3,$4,$5)",
      [
        b,
        v.date,
        userId,
        JSON.stringify({
          ...snapshot,
          inputTax: v.inputTax,
          outputTax: v.outputTax,
        }),
        JSON.stringify(baseline),
      ],
    );
    await c.query(
      "insert into accounting_journals(business_id,source,date,source_hash,lines) values($1,'opening',$2,$3,$4)",
      [b, v.date, preview.token, JSON.stringify(lines)],
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
