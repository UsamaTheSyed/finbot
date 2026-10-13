import { partySummaries } from "../services/parties.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, partyInput } from "../domain/validation.js";
import { invoiceDto, paymentDto, transactionDto } from "../services/ledger.js";
import { ApiError } from "../lib/errors.js";

type Params = { businessId: string; id?: string };

export async function partyRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/parties",
    async (request) => {
      await auth.requireMembership(
        request,
        id.parse(request.params.businessId),
      );
      return partySummaries(pool, request.params.businessId);
    },
  );
  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/parties/:id",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      const partyId = id.parse(request.params.id);
      await auth.requireMembership(request, businessId);
      const party = (await partySummaries(pool, businessId)).find(
        (row) => row.id === partyId,
      );
      if (!party)
        throw new ApiError(404, "PARTY_NOT_FOUND", "Party not found.");
      const [transactions, invoices, payments] = await Promise.all([
        pool.query(
          "select id from transactions where business_id = $1 and party_id = $2 order by date desc, id",
          [businessId, partyId],
        ),
        pool.query(
          "select id from invoices where business_id = $1 and party_id = $2 order by date desc, id",
          [businessId, partyId],
        ),
        pool.query(
          "select id from payments where business_id = $1 and party_id = $2 order by date desc, id",
          [businessId, partyId],
        ),
      ]);
      return {
        party,
        transactions: await Promise.all(
          transactions.rows.map((row) =>
            transactionDto(pool, businessId, row.id),
          ),
        ),
        invoices: await Promise.all(
          invoices.rows.map((row) => invoiceDto(pool, businessId, row.id)),
        ),
        payments: await Promise.all(
          payments.rows.map((row) => paymentDto(pool, businessId, row.id)),
        ),
      };
    },
  );
  app.post<{ Params: Params }>(
    "/api/businesses/:businessId/parties",
    async (request, reply) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);
      const value = partyInput.parse(request.body);
      const partyId = `party-${randomUUID()}`;
      await pool.query(
        `insert into parties (id, business_id, name, kind, phone, email, ntn, address, payment_terms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          partyId,
          businessId,
          value.name,
          value.kind,
          value.phone,
          value.email,
          value.ntn,
          value.address,
          value.paymentTerms,
        ],
      );
      const result = await pool.query(
        "select * from parties where id = $1 and business_id = $2",
        [partyId, businessId],
      );
      return reply
        .status(201)
        .send({ ...value, id: result.rows[0].id, businessId });
    },
  );
  app.patch<{ Params: Params }>(
    "/api/businesses/:businessId/parties/:id",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      const partyId = id.parse(request.params.id);
      await auth.requireMembership(request, businessId);
      const value = partyInput.parse(request.body);
      const current = await pool.query(
        "select * from parties where id = $1 and business_id = $2",
        [partyId, businessId],
      );
      if (!current.rows[0])
        throw new ApiError(404, "PARTY_NOT_FOUND", "Party not found.");
      if (current.rows[0].kind !== value.kind) {
        const linked = await pool.query(
          `select exists(select 1 from transactions where business_id=$1 and party_id=$2)
          or exists(select 1 from invoices where business_id=$1 and party_id=$2)
          or exists(select 1 from payments where business_id=$1 and party_id=$2) as linked`,
          [businessId, partyId],
        );
        if (linked.rows[0].linked)
          throw new ApiError(
            400,
            "PARTY_KIND_LOCKED",
            "Party type cannot change after financial records exist.",
          );
      }
      await pool.query(
        `update parties set name=$3, kind=$4, phone=$5, email=$6, ntn=$7, address=$8, payment_terms=$9, updated_at=now()
       where id=$1 and business_id=$2`,
        [
          partyId,
          businessId,
          value.name,
          value.kind,
          value.phone,
          value.email,
          value.ntn,
          value.address,
          value.paymentTerms,
        ],
      );
      return { ...value, id: partyId, businessId };
    },
  );
}
