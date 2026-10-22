import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id } from "../domain/validation.js";
import { correctionInput } from "../domain/correction.js";
import { correctionContext, correctInvoice } from "../services/corrections.js";
export async function correctionRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  const path = "/api/businesses/:businessId/invoices/:id/corrections";
  type Params = { businessId: string; id: string };
  app.get<{ Params: Params }>(path, async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    return correctionContext(pool, businessId, id.parse(request.params.id));
  });
  app.post<{ Params: Params }>(path, async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    const membership = await auth.requireMembership(request, businessId);
    const result = await correctInvoice(
      pool,
      businessId,
      id.parse(request.params.id),
      membership.user.id,
      correctionInput.parse(request.body),
    );
    return reply.status(201).send(result);
  });
}
