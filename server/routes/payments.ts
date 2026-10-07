import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, paymentInput } from "../domain/validation.js";
import { paymentDto } from "../services/ledger.js";
import { createPayment } from "../services/payments.js";

type Params = { businessId: string };

export async function paymentRoutes(app: FastifyInstance, pool: DatabasePool, auth: Auth) {
  app.get<{ Params: Params }>("/api/businesses/:businessId/payments", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const result = await pool.query("select id from payments where business_id=$1 order by date desc,display_id desc", [businessId]);
    return Promise.all(result.rows.map((row) => paymentDto(pool, businessId, row.id)));
  });
  app.post<{ Params: Params }>("/api/businesses/:businessId/payments", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const created = await createPayment(pool, businessId, paymentInput.parse(request.body));
    return reply.status(201).send(created);
  });
}
