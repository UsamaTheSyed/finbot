import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id } from "../domain/validation.js";
import { creditContext } from "../services/creditContext.js";
import { postCredit, type CreditAction } from "../services/credits.js";
export async function creditRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  app.get<{ Params: { businessId: string; partyId: string } }>(
    "/api/businesses/:businessId/parties/:partyId/credits",
    async (request) => {
      const business = id.parse(request.params.businessId);
      await auth.requireMembership(request, business);
      const { lots: _lots, ...result } = await creditContext(
        pool,
        business,
        id.parse(request.params.partyId),
      );
      void _lots;
      return result;
    },
  );
  for (const [path, kind] of [
    ["notes", "note"],
    ["applications", "application"],
    ["refunds", "refund"],
  ] as [string, CreditAction][])
    app.post<{ Params: { businessId: string } }>(
      `/api/businesses/:businessId/credits/${path}`,
      async (request, reply) => {
        const business = id.parse(request.params.businessId),
          membership = await auth.requireMembership(request, business);
        return reply
          .status(201)
          .send(
            await postCredit(
              pool,
              business,
              membership.user.id,
              kind,
              request.body,
            ),
          );
      },
    );
}
