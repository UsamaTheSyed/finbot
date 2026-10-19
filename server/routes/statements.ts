import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id } from "../domain/validation.js";
import {
  statementRangeSchema,
  statementFilename,
} from "../../src/domain/accountStatement.js";
import { loadStatement } from "../services/statements.js";
import { statementHtml } from "../pdf/statementHtml.js";
import { createPdfRenderer, embeddedFonts } from "../pdf/renderer.js";
import { ApiError } from "../lib/errors.js";
export async function statementRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  const renderer = createPdfRenderer();
  app.addHook("onClose", () => renderer.close());
  for (const pdf of [false, true])
    app.get<{ Params: { businessId: string; id: string } }>(
      `/api/businesses/:businessId/parties/:id/statement${pdf ? "/pdf" : ""}`,
      async (request, reply) => {
        const businessId = id.parse(request.params.businessId);
        await auth.requireMembership(request, businessId);
        const partyId = id.parse(request.params.id);
        const range = statementRangeSchema.parse(request.query);
        const data = await loadStatement(pool, businessId, partyId, range);
        reply.header("Cache-Control", "private, no-store");
        if (!pdf) return data;
        try {
          const bytes = await renderer.render(
            statementHtml(data, await embeddedFonts()),
          );
          return reply
            .header(
              "Content-Disposition",
              `attachment; filename="${statementFilename(partyId, range)}"`,
            )
            .header("X-Content-Type-Options", "nosniff")
            .type("application/pdf")
            .send(bytes);
        } catch (error) {
          if (error instanceof ApiError) throw error;
          request.log.error({ err: error }, "Statement PDF generation failed");
          throw new ApiError(
            503,
            "PDF_UNAVAILABLE",
            "Statement PDF could not be generated. Please retry.",
          );
        }
      },
    );
}
