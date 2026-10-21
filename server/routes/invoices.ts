import { z } from "zod";
import { editDraft } from "../services/editDraft.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, invoiceInput } from "../domain/validation.js";
import { insertInvoiceGraph } from "../services/invoices.js";
import { ApiError } from "../lib/errors.js";
import { allocateInvoiceNumber } from "../services/invoiceNumber.js";
import {
  businessDate,
  invoiceDto,
  invoiceStatus,
  requireScopedRecord,
} from "../services/ledger.js";

type Params = { businessId: string; id?: string };

export async function invoiceRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/invoices",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);

      const result = await pool.query(
        `select
          i.*,
          coalesce((
            select sum(pa.amount_minor)
            from payment_allocations pa
            join payments p
              on p.id = pa.payment_id
              and p.status = 'Completed'
            where pa.invoice_id = i.id
          ), 0)::bigint as paid_minor
        from invoices i
        where i.business_id = $1
        order by i.date desc, i.display_id desc`,
        [businessId],
      );

      return result.rows.map((row) => {
        const totalMinor = Number(row.total_minor);
        const paidMinor = Number(row.paid_minor);
        const balanceMinor = totalMinor - paidMinor;
        const status = invoiceStatus(
          row.status,
          totalMinor,
          paidMinor,
          row.due_date,
        );

        return {
          id: row.id,
          displayId: row.display_id,
          businessId: row.business_id,
          transactionId: row.transaction_id || undefined,
          partyId: row.party_id,
          date: row.date,
          dueDate: row.due_date,
          reference: row.reference,
          items: [],
          subtotalMinor: Number(row.subtotal_minor),
          taxMinor: Number(row.tax_minor),
          discountMinor: Number(row.discount_minor),
          totalMinor,
          paidMinor,
          balanceMinor,
          status,
          notes: row.notes,
          terms: row.terms,
          daysOverdue:
            balanceMinor > 0 && status !== "Draft"
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.parse(businessDate()) - Date.parse(row.due_date)) /
                      86_400_000,
                  ),
                )
              : 0,
        };
      });
    },
  );
  app.get<{ Params: Params }>(
    "/api/businesses/:businessId/invoices/:id",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      await auth.requireMembership(request, businessId);
      return invoiceDto(pool, businessId, id.parse(request.params.id));
    },
  );
  app.post<{ Params: Params }>(
    "/api/businesses/:businessId/invoices",
    async (request, reply) => {
      const businessId = id.parse(request.params.businessId);
      const membership = await auth.requireMembership(request, businessId);
      const input = invoiceInput.parse(request.body);
      const invoiceId = `INV-${randomUUID()}`;
      const client = await pool.connect();
      try {
        await client.query("begin");
        const displayId = await allocateInvoiceNumber(client, businessId);
        await insertInvoiceGraph(
          client,
          businessId,
          membership.user.id,
          invoiceId,
          input,
          displayId,
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      return reply
        .status(201)
        .send(await invoiceDto(pool, businessId, invoiceId));
    },
  );
  app.patch<{ Params: Params }>(
    "/api/businesses/:businessId/invoices/:id/draft",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      const invoiceId = id.parse(request.params.id);
      await auth.requireMembership(request, businessId);
      const { data, revision } = z
        .object({
          data: invoiceInput,
          revision: z.string().regex(/^\d+$/),
        })
        .strict()
        .parse(request.body);
      await editDraft(pool, businessId, invoiceId, data, revision);
      return invoiceDto(pool, businessId, invoiceId);
    },
  );
  app.patch<{ Params: Params }>(
    "/api/businesses/:businessId/invoices/:id",
    async (request) => {
      const businessId = id.parse(request.params.businessId);
      const invoiceId = id.parse(request.params.id);
      const membership = await auth.requireMembership(request, businessId);
      const input = invoiceInput.parse(request.body);
      const { revision } = z
        .object({ revision: z.string().regex(/^\d+$/).optional() })
        .parse(request.body);
      if (input.draft) {
        await editDraft(pool, businessId, invoiceId, input, revision);
        return invoiceDto(pool, businessId, invoiceId);
      }
      const client = await pool.connect();
      try {
        await client.query("begin");
        const draft = await requireScopedRecord(
          client,
          "invoices",
          businessId,
          invoiceId,
        );
        await requireScopedRecord(
          client,
          "parties",
          businessId,
          String(draft.party_id),
          true,
        );
        const current = await requireScopedRecord(
          client,
          "invoices",
          businessId,
          invoiceId,
          true,
        );
        if (current.status !== "Draft")
          throw new ApiError(
            409,
            "INVOICE_NOT_DRAFT",
            "Only drafts can be edited.",
          );
        if (
          current.party_id !== draft.party_id ||
          input.partyId !== current.party_id
        )
          throw new ApiError(
            409,
            "DRAFT_CHANGED",
            "Save party changes before issuing this draft.",
          );
        if (revision !== undefined) {
          const version = await client.query(
            "select xmin::text as revision from invoices where id=$1 and business_id=$2",
            [invoiceId, businessId],
          );
          if (version.rows[0].revision !== revision)
            throw new ApiError(
              409,
              "DRAFT_CHANGED",
              "This draft changed. Refresh its details before issuing.",
            );
        }
        await client.query("delete from invoice_items where invoice_id=$1", [
          invoiceId,
        ]);
        await client.query(
          "delete from invoices where id=$1 and business_id=$2",
          [invoiceId, businessId],
        );
        await insertInvoiceGraph(
          client,
          businessId,
          membership.user.id,
          invoiceId,
          input,
          String(current.display_id),
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      return invoiceDto(pool, businessId, invoiceId);
    },
  );
}
