import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id } from "../domain/validation.js";
import { dashboardReport, financialReport } from "../services/reports.js";

type Params = { businessId: string; kind?: string };
const periodQuery = z.object({
  period: z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/),
});
export async function reportRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/reports",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);
      return dashboardReport(pool, businessId);
    },
  );

  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/reports/:kind",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);
      const kind = z
        .enum(["daily", "ar-aging", "profit-loss", "cash-flow"])
        .parse(request.params.kind);
      const { period } = periodQuery.parse(request.query);
      return financialReport(pool, businessId, kind, period);
    },
  );
}
