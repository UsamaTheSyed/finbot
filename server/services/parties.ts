import type { Queryable } from "./ledger.js";
export async function partySummaries(pool: Queryable, businessId: string) {
  const partyRows = await pool.query(
    "select * from parties where business_id=$1 order by created_at,id",
    [businessId],
  );
  const transactionRows = await pool.query(
    "select party_id,type,total_minor from transactions where business_id=$1",
    [businessId],
  );
  const paymentRows = await pool.query(
    "select party_id,direction,amount_minor,transaction_id from payments where business_id=$1 and status='Completed'",
    [businessId],
  );
  const invoiceRows = await pool.query(
    "select party_id,status from invoices where business_id=$1",
    [businessId],
  );
  return partyRows.rows.map((party) => {
    const transactions = transactionRows.rows.filter(
      (row) => row.party_id === party.id,
    );
    const payments = paymentRows.rows.filter(
      (row) => row.party_id === party.id,
    );
    const gross = transactions.reduce(
      (sum, row) =>
        sum + (row.type === "Sale" ? 1 : -1) * Number(row.total_minor),
      0,
    );
    const expectedDirection = party.kind === "Customer" ? "Received" : "Sent";
    return {
      id: party.id,
      businessId: party.business_id,
      name: party.name,
      kind: party.kind,
      phone: party.phone,
      email: party.email,
      ntn: party.ntn,
      address: party.address,
      paymentTerms: party.payment_terms,
      totalMinor: Math.abs(gross),
      receivedMinor: payments.reduce(
        (sum, row) =>
          sum +
          (row.direction === expectedDirection ? 1 : -1) *
            Number(row.amount_minor),
        0,
      ),
      balanceMinor:
        gross +
        payments.reduce(
          (sum, row) =>
            sum +
            (row.direction === "Received" ? -1 : 1) * Number(row.amount_minor),
          0,
        ),
      invoiceCount: invoiceRows.rows.filter(
        (row) => row.party_id === party.id && row.status !== "Draft",
      ).length,
      paymentCount: payments.length,
    };
  });
}
