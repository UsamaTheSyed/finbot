import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { id } from "../domain/validation.js";
import { loadInvoicePdf, invoicePdfFilename } from "../pdf/invoiceData.js";
import { invoiceHtml } from "../pdf/invoiceHtml.js";
import { createPdfRenderer, embeddedFonts } from "../pdf/renderer.js";
export async function invoicePdfRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  const renderer = createPdfRenderer();
  app.addHook("onClose", () => renderer.close());
  app.get<{ Params: { businessId: string; id: string } }>(
    "/api/businesses/:businessId/invoices/:id/pdf",
    async (request, reply) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);
      const data = await loadInvoicePdf(
        pool,
        businessId,
        id.parse(request.params.id),
      );
      try {
        const pdf = await renderer.render(
          invoiceHtml(data, await embeddedFonts()),
        );
        return reply
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff")
          .header(
            "Content-Disposition",
            `attachment; filename="${invoicePdfFilename(data)}"`,
          )
          .type("application/pdf")
          .send(pdf);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        request.log.error({ err: error }, "Invoice PDF generation failed");
        throw new ApiError(
          503,
          "PDF_UNAVAILABLE",
          "PDF could not be generated. Please retry or contact the administrator.",
        );
      }
    },
  );
}
