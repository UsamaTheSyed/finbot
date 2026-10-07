import type { PoolClient } from "pg";

// Caller owns the transaction. The upsert serializes allocations per workspace;
// rollbacks also roll back the counter. Deleted committed numbers are not reused.
export async function allocateInvoiceNumber(client: PoolClient, businessId: string) {
  const result = await client.query<{ last_number: string }>(
    `insert into invoice_counters (business_id, last_number)
     select $1, coalesce(max(substring(display_id from '^INV-([0-9]+)$')::bigint), 0) + 1
     from invoices where business_id = $1
     on conflict (business_id) do update
       set last_number = invoice_counters.last_number + 1
     returning last_number`,
    [businessId],
  );
  return `INV-${result.rows[0].last_number.padStart(6, "0")}`;
}
