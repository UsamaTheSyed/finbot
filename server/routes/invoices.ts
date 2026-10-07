import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, invoiceInput, type InvoiceInput } from "../domain/validation.js";
import { calculateInvoice } from "../domain/money.js";
import { ApiError } from "../lib/errors.js";
import { allocateInvoiceNumber } from "../services/invoiceNumber.js";
import {
  businessDate,
  invoiceDto,
  invoiceStatus,
  requireScopedRecord,
} from "../services/ledger.js";

type Params = { businessId: string; id?: string };

async function insertInvoiceGraph(
  client: PoolClient,
  businessId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceInput,
  displayId: string,
) {
  const party = await requireScopedRecord(client, "parties", businessId, input.partyId, true);
  if (party.kind !== "Customer") throw new ApiError(400, "CUSTOMER_REQUIRED", "Choose a customer for a new sales invoice.");
  const totals = calculateInvoice(input);
  const transactionId = input.draft ? null : `SALE-${randomUUID()}`;
  const storedStatus = input.draft ? "Draft" : totals.paidMinor === totals.totalMinor ? "Paid" : totals.paidMinor > 0 ? "Partial" : "Sent";
  await client.query(
    `insert into invoices
     (id,display_id,business_id,transaction_id,party_id,date,due_date,reference,subtotal_minor,tax_minor,discount_minor,total_minor,status,notes,terms)
     values ($1,$15,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [ invoiceId, businessId, null, input.partyId, input.date, input.dueDate, input.reference, totals.subtotalMinor, totals.taxMinor, totals.discountMinor, totals.totalMinor, storedStatus, input.notes, input.terms, displayId ],
  );
  for (const [position, item] of totals.items.entries()) {
    const itemId = `${invoiceId}-line-${position + 1}`;
    await client.query(
      `insert into invoice_items (id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [itemId, invoiceId, position, item.item, item.description, item.quantityMilli, item.unit, item.rateMinor, item.taxBasisPoints],
    );
  }
  if (transactionId) {
    const uniformTax = totals.items.every((item) => item.taxBasisPoints === totals.items[0]?.taxBasisPoints)
      ? totals.items[0]?.taxBasisPoints ?? 0 : null;
    await client.query(
      `insert into transactions
       (id,display_id,business_id,party_id,created_by,date,due_date,type,status,subtotal_minor,discount_minor,tax_minor,tax_rate_basis_points,total_minor,notes)
       values ($1,$1,$2,$3,$4,$5,$6,'Sale',$7,$8,$9,$10,$11,$12,$13)`,
      [transactionId, businessId, input.partyId, userId, input.date, input.dueDate, totals.paidMinor === totals.totalMinor ? "Completed" : totals.paidMinor > 0 ? "Partial" : "Unpaid", totals.subtotalMinor, totals.discountMinor, totals.taxMinor, uniformTax, totals.totalMinor, input.notes],
    );
    await client.query(
      `update invoices
      set transaction_id = $1, updated_at = now()
      where id = $2 and business_id = $3`,
      [transactionId, invoiceId, businessId],
    );
    for (const [position, item] of totals.items.entries())
      await client.query(
        `insert into transaction_items (id,transaction_id,position,description,quantity_milli,unit,rate_minor)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [`${transactionId}-line-${position + 1}`, transactionId, position, item.description || item.item, item.quantityMilli, item.unit, item.rateMinor],
      );
    if (totals.paidMinor > 0) {
      const paymentId = `PAY-${randomUUID()}`;
      await client.query(
        `insert into payments
         (id,display_id,business_id,party_id,transaction_id,direction,amount_minor,method,date,reference,notes,status)
         values ($1,$1,$2,$3,$4,'Received',$5,$6,$7,$8,'Initial invoice payment','Completed')`,
        [paymentId, businessId, input.partyId, transactionId, totals.paidMinor, input.method, input.date, input.reference],
      );
      await client.query("insert into payment_allocations (payment_id,invoice_id,amount_minor) values ($1,$2,$3)", [paymentId, invoiceId, totals.paidMinor]);
    }
  }
}

export async function invoiceRoutes(app: FastifyInstance, pool: DatabasePool, auth: Auth) {
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
  app.get<{ Params: Params }>("/api/businesses/:businessId/invoices/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    return invoiceDto(pool, businessId, id.parse(request.params.id));
  });
  app.post<{ Params: Params }>("/api/businesses/:businessId/invoices", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    const membership = await auth.requireMembership(request, businessId);
    const input = invoiceInput.parse(request.body);
    const invoiceId = `INV-${randomUUID()}`;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const displayId = await allocateInvoiceNumber(client, businessId);
      await insertInvoiceGraph(client, businessId, membership.user.id, invoiceId, input, displayId);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return reply.status(201).send(await invoiceDto(pool, businessId, invoiceId));
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/invoices/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const invoiceId = id.parse(request.params.id);
    const membership = await auth.requireMembership(request, businessId);
    const input = invoiceInput.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await requireScopedRecord(client, "invoices", businessId, invoiceId, true);
      if (current.status !== "Draft") throw new ApiError(409, "INVOICE_NOT_DRAFT", "Only drafts can be edited.");
      await client.query("delete from invoice_items where invoice_id=$1", [invoiceId]);
      await client.query("delete from invoices where id=$1 and business_id=$2", [invoiceId, businessId]);
      await insertInvoiceGraph(client, businessId, membership.user.id, invoiceId, input, String(current.display_id));
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return invoiceDto(pool, businessId, invoiceId);
  });
}
