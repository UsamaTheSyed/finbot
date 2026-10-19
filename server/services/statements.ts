import type { DatabasePool } from "../db/client.js";
import { ApiError } from "../lib/errors.js";
import { requireScopedRecord } from "./ledger.js";
import {
  accountStatement,
  type StatementEntry,
  type StatementRange,
} from "../../src/domain/accountStatement.js";
import { safeMinor } from "../../src/utils/money.js";

export async function loadStatement(
  pool: DatabasePool,
  businessId: string,
  partyId: string,
  range: StatementRange,
) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const party = await requireScopedRecord(
      client,
      "parties",
      businessId,
      partyId,
    );
    const businessResult = await client.query(
      "select name,address,email,phone from businesses where id=$1",
      [businessId],
    );
    const business = businessResult.rows[0];
    if (!business) throw new ApiError(404, "NOT_FOUND", "Workspace not found.");
    const transactions = await client.query(
      `select t.id,t.date,t.type,t.total_minor,
      i.id as invoice_id,i.display_id from transactions t
      left join invoices i on i.transaction_id=t.id and i.business_id=t.business_id
      where t.business_id=$1 and t.party_id=$2`,
      [businessId, partyId],
    );
    // Count cash once, on its payment date. Allocations never create statement movements.
    const payments = await client.query(
      `select id,display_id,date,direction,amount_minor,reference
      from payments where business_id=$1 and party_id=$2 and status='Completed'`,
      [businessId, partyId],
    );
    const entries: StatementEntry[] = [
      ...transactions.rows.map((t) => ({
        id: `transaction:${t.id}`,
        date: t.date,
        reference: t.display_id || t.id,
        label: t.type,
        amountMinor:
          safeMinor(Number(t.total_minor)) * (t.type === "Sale" ? 1 : -1),
        href: t.invoice_id
          ? `/invoices/${t.invoice_id}`
          : `/transactions/${t.id}`,
      })),
      ...payments.rows.map((p) => ({
        id: `payment:${p.id}`,
        date: p.date,
        reference: p.reference || p.display_id || p.id,
        label: `Payment ${p.direction.toLowerCase()}`,
        amountMinor:
          safeMinor(Number(p.amount_minor)) *
          (p.direction === "Received" ? -1 : 1),
        href: "/payments",
      })),
    ];
    const statement = accountStatement(entries, range);
    await client.query("commit");
    const contact = (r: Record<string, unknown>) => ({
      name: String(r.name || ""),
      address: String(r.address || ""),
      email: String(r.email || ""),
      phone: String(r.phone || ""),
    });
    return {
      ...statement,
      party: { ...contact(party), id: partyId, kind: String(party.kind) },
      business: contact(business),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export type StatementData = Awaited<ReturnType<typeof loadStatement>>;
