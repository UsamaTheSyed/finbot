import type { PoolClient } from "pg";
import { fifoPlan, type AllocationTarget } from "../domain/allocation.js";
import { requireScopedRecord } from "./ledger.js";
import { ApiError } from "../lib/errors.js";

// Every financial allocator/issuer/deleter locks the party first, then its records.
export async function allocationTargets(
  client: PoolClient,
  businessId: string,
  partyId: string,
  direction: string,
) {
  const currency = await client.query(
    "select currency from businesses where id=$1",
    [businessId],
  );
  if (currency.rows[0]?.currency !== "PKR")
    throw new ApiError(
      400,
      "UNSUPPORTED_CURRENCY",
      "FIFO currently supports PKR workspaces only.",
    );
  const party = await requireScopedRecord(
    client,
    "parties",
    businessId,
    partyId,
    true,
  );
  if (direction !== (party.kind === "Customer" ? "Received" : "Sent"))
    throw new ApiError(
      400,
      "DIRECTION_MISMATCH",
      "FIFO supports customer receipts and supplier payments only.",
    );
  const result = await client.query(
    `
    select t.id, coalesce(i.display_id,t.display_id) display_id, i.id invoice_id, greatest(t.date,coalesce((select max(c.date) from invoice_corrections c where c.transaction_id=t.id),t.date)) as date,
      t.total_minor-coalesce((select sum(s.amount_minor) from ledger_settlements s where s.transaction_id=t.id),0) balance_minor
    from transactions t left join invoices i on i.transaction_id=t.id and i.business_id=t.business_id
    where t.business_id=$1 and t.party_id=$2 and t.type=$3 and (i.id is null or i.status<>'Draft')
    order by t.date,t.created_at,t.id for update of t`,
    [businessId, partyId, direction === "Received" ? "Sale" : "Purchase"],
  );
  return result.rows.map((row) => ({
    transactionId: row.id,
    displayId: row.display_id,
    invoiceId: row.invoice_id || undefined,
    date: String(row.date),
    balanceMinor: Math.max(0, Number(row.balance_minor)),
  })) as AllocationTarget[];
}
export async function previewAllocation(
  client: PoolClient,
  businessId: string,
  partyId: string,
  direction: string,
  amountMinor: number,
) {
  return fifoPlan(
    amountMinor,
    await allocationTargets(client, businessId, partyId, direction),
  );
}
export async function applyAdvance(
  client: PoolClient,
  businessId: string,
  partyId: string,
  direction: string,
) {
  const targets = await allocationTargets(
    client,
    businessId,
    partyId,
    direction,
  );
  const payments = await client.query(
    `select p.*,
    p.amount_minor-coalesce((select sum(a.amount_minor) from payment_transaction_allocations a where a.payment_id=p.id),0) remaining
    from payments p where business_id=$1 and party_id=$2 and direction=$3
    and status='Completed' and allocation_mode='fifo' order by date,created_at,id for update`,
    [businessId, partyId, direction],
  );
  for (const payment of payments.rows) {
    const plan = fifoPlan(Number(payment.remaining), targets);
    for (const allocation of plan.allocations) {
      // Cash date never changes. Applying advance to a later bill has its own effective date.
      const effectiveDate =
        String(payment.date) > allocation.date
          ? String(payment.date)
          : allocation.date;
      await client.query(
        `insert into payment_transaction_allocations(payment_id,transaction_id,amount_minor,effective_date)
        values($1,$2,$3,$4) on conflict(payment_id,transaction_id) do update
        set amount_minor=payment_transaction_allocations.amount_minor+excluded.amount_minor,effective_date=excluded.effective_date`,
        [
          payment.id,
          allocation.transactionId,
          allocation.amountMinor,
          effectiveDate,
        ],
      );
      if (allocation.invoiceId) {
        await client.query(
          `insert into payment_allocations(payment_id,invoice_id,amount_minor) values($1,$2,$3)
          on conflict(payment_id,invoice_id) do update set amount_minor=payment_allocations.amount_minor+excluded.amount_minor`,
          [payment.id, allocation.invoiceId, allocation.amountMinor],
        );
      }
      const target = targets.find(
        (t) => t.transactionId === allocation.transactionId,
      )!;
      target.balanceMinor -= allocation.amountMinor;
      await client.query(
        "update transactions set status=$2,updated_at=now() where id=$1",
        [
          target.transactionId,
          target.balanceMinor === 0 ? "Completed" : "Partial",
        ],
      );
      if (target.invoiceId)
        await client.query(
          "update invoices set status=$2,updated_at=now() where id=$1",
          [target.invoiceId, target.balanceMinor === 0 ? "Paid" : "Partial"],
        );
    }
  }
}
