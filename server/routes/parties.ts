import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, partyInput } from "../domain/validation.js";
import { invoiceDto, paymentDto, transactionDto } from "../services/ledger.js";
import { ApiError } from "../lib/errors.js";

type Params = { businessId: string; id?: string };

async function summaries(pool: DatabasePool, businessId: string) {
  const [partyRows, transactionRows, paymentRows, invoiceRows] = await Promise.all([
    pool.query("select * from parties where business_id = $1 order by created_at, id", [businessId]),
    pool.query("select party_id, type, total_minor from transactions where business_id = $1", [businessId]),
    pool.query("select party_id, direction, amount_minor, transaction_id from payments where business_id = $1 and status = 'Completed'", [businessId]),
    pool.query("select party_id, status from invoices where business_id = $1", [businessId]),
  ]);
  return partyRows.rows.map((party) => {
    const transactions = transactionRows.rows.filter((row) => row.party_id === party.id);
    const payments = paymentRows.rows.filter((row) => row.party_id === party.id);
    const allocated = new Set(payments.filter((row) => row.transaction_id).map((row) => row.transaction_id));
    const transactionPaid = payments.filter((row) => row.transaction_id).reduce((sum, row) => sum + Number(row.amount_minor), 0);
    const gross = transactions.reduce((sum, row) => sum + (row.type === "Sale" ? 1 : -1) * Number(row.total_minor), 0);
    const unallocated = payments.filter((row) => !row.transaction_id).reduce((sum, row) => sum + (row.direction === "Received" ? -1 : 1) * Number(row.amount_minor), 0);
    void allocated;
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
      receivedMinor: payments.reduce((sum, row) => sum + (row.direction === expectedDirection ? 1 : -1) * Number(row.amount_minor), 0),
      balanceMinor: gross + (party.kind === "Customer" ? -transactionPaid : transactionPaid) + unallocated,
      invoiceCount: invoiceRows.rows.filter((row) => row.party_id === party.id && row.status !== "Draft").length,
      paymentCount: payments.length,
    };
  });
}

export async function partyRoutes(app: FastifyInstance, pool: DatabasePool, auth: Auth) {
  app.get<{ Params: Params }>("/api/businesses/:businessId/parties", async (request) => {
    await auth.requireMembership(request, id.parse(request.params.businessId));
    return summaries(pool, request.params.businessId);
  });
  app.get<{ Params: Params }>("/api/businesses/:businessId/parties/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const partyId = id.parse(request.params.id);
    await auth.requireMembership(request, businessId);
    const party = (await summaries(pool, businessId)).find((row) => row.id === partyId);
    if (!party) throw new ApiError(404, "PARTY_NOT_FOUND", "Party not found.");
    const [transactions, invoices, payments] = await Promise.all([
      pool.query("select id from transactions where business_id = $1 and party_id = $2 order by date desc, id", [businessId, partyId]),
      pool.query("select id from invoices where business_id = $1 and party_id = $2 order by date desc, id", [businessId, partyId]),
      pool.query("select id from payments where business_id = $1 and party_id = $2 order by date desc, id", [businessId, partyId]),
    ]);
    return {
      party,
      transactions: await Promise.all(transactions.rows.map((row) => transactionDto(pool, businessId, row.id))),
      invoices: await Promise.all(invoices.rows.map((row) => invoiceDto(pool, businessId, row.id))),
      payments: await Promise.all(payments.rows.map((row) => paymentDto(pool, businessId, row.id))),
    };
  });
  app.post<{ Params: Params }>("/api/businesses/:businessId/parties", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const value = partyInput.parse(request.body);
    const partyId = `party-${randomUUID()}`;
    await pool.query(
      `insert into parties (id, business_id, name, kind, phone, email, ntn, address, payment_terms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [partyId, businessId, value.name, value.kind, value.phone, value.email, value.ntn, value.address, value.paymentTerms],
    );
    const result = await pool.query("select * from parties where id = $1 and business_id = $2", [partyId, businessId]);
    return reply.status(201).send({ ...value, id: result.rows[0].id, businessId });
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/parties/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const partyId = id.parse(request.params.id);
    await auth.requireMembership(request, businessId);
    const value = partyInput.parse(request.body);
    const current = await pool.query("select * from parties where id = $1 and business_id = $2", [partyId, businessId]);
    if (!current.rows[0]) throw new ApiError(404, "PARTY_NOT_FOUND", "Party not found.");
    if (current.rows[0].kind !== value.kind) {
      const linked = await pool.query(
        `select exists(select 1 from transactions where business_id=$1 and party_id=$2)
          or exists(select 1 from invoices where business_id=$1 and party_id=$2)
          or exists(select 1 from payments where business_id=$1 and party_id=$2) as linked`,
        [businessId, partyId],
      );
      if (linked.rows[0].linked) throw new ApiError(400, "PARTY_KIND_LOCKED", "Party type cannot change after financial records exist.");
    }
    await pool.query(
      `update parties set name=$3, kind=$4, phone=$5, email=$6, ntn=$7, address=$8, payment_terms=$9, updated_at=now()
       where id=$1 and business_id=$2`,
      [partyId, businessId, value.name, value.kind, value.phone, value.email, value.ntn, value.address, value.paymentTerms],
    );
    return { ...value, id: partyId, businessId };
  });
}
