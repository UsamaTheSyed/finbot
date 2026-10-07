import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, transactionEditInput, transactionPaymentInput } from "../domain/validation.js";
import { ApiError } from "../lib/errors.js";
import { businessDate, requireScopedRecord, transactionDto } from "../services/ledger.js";
import { createPayment } from "../services/payments.js";

type Params = { businessId: string; id?: string };
const filters = z.object({
  type: z.string().optional(), partyId: z.string().optional(), status: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(), search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export async function transactionRoutes(app: FastifyInstance, pool: DatabasePool, auth: Auth) {
  app.get<{ Params: Params }>("/api/businesses/:businessId/transactions", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const query = filters.parse(request.query);
    const values: unknown[] = [businessId];
    const where = ["t.business_id = $1"];
    const add = (clause: string, value: unknown) => { values.push(value); where.push(clause.replace("?", `$${values.length}`)); };
    if (query.type) add("t.type = ?", query.type);
    if (query.partyId) add("t.party_id = ?", query.partyId);
    if (query.from) add("t.date >= ?", query.from);
    if (query.to) add("t.date <= ?", query.to);
    if (query.search) {
      values.push(`%${query.search}%`);
      where.push(`(t.display_id ilike $${values.length} or party.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(businessDate());
      const businessDateParameter = `$${values.length}`;

      const statusSql = `
        case
          when t.total_minor - coalesce(paid.paid_minor, 0) = 0
            then 'Completed'
          when coalesce(paid.paid_minor, 0) > 0
            then 'Partial'
          when t.due_date < ${businessDateParameter}
            then 'Overdue'
          else 'Unpaid'
        end
      `;

      add(`${statusSql} = ?`, query.status);
    }
    const common = `from transactions t join parties party on party.id=t.party_id
      left join (select transaction_id,sum(amount_minor)::bigint paid_minor from payments where status='Completed' group by transaction_id) paid on paid.transaction_id=t.id
      where ${where.join(" and ")}`;
    const count = await pool.query(`select count(*)::int total ${common}`, values);
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const rows = await pool.query(`select t.id ${common} order by t.date desc,t.display_id desc limit $${values.length - 1} offset $${values.length}`, values);
    return {
      items: await Promise.all(rows.rows.map((row) => transactionDto(pool, businessId, row.id))),
      total: count.rows[0].total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
  app.get<{ Params: Params }>("/api/businesses/:businessId/transactions/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    return transactionDto(pool, businessId, id.parse(request.params.id));
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/transactions/:id", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const transactionId = id.parse(request.params.id);
    await auth.requireMembership(request, businessId);
    const input = transactionEditInput.parse(request.body);
    const current = await requireScopedRecord(pool, "transactions", businessId, transactionId);
    const conflict = await pool.query(
      `select exists(select 1 from invoices where business_id=$1 and transaction_id=$2 and due_date < $3)
        or exists(select 1 from payments where business_id=$1 and transaction_id=$2 and date < $3) as invalid`,
      [businessId, transactionId, input.date],
    );
    if (conflict.rows[0].invalid) throw new ApiError(409, "TRANSACTION_DATE_CONFLICT", "Transaction date conflicts with an invoice due date or existing payment.");
    await pool.query("update transactions set date=$3, notes=$4, updated_at=now() where id=$1 and business_id=$2", [transactionId, businessId, input.date, input.notes]);
    await pool.query("update invoices set date=$3, notes=$4, updated_at=now() where transaction_id=$1 and business_id=$2", [transactionId, businessId, input.date, input.notes]);
    void current;
    return transactionDto(pool, businessId, transactionId);
  });
  app.post<{ Params: Params }>("/api/businesses/:businessId/transactions/:id/payments", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const transactionId = id.parse(request.params.id);
    await auth.requireMembership(request, businessId);
    const input = transactionPaymentInput.parse(request.body);
    const transaction = await requireScopedRecord(pool, "transactions", businessId, transactionId);
    await createPayment(pool, businessId, {
      ...input,
      direction: transaction.type === "Purchase" ? "Sent" : "Received",
      partyId: String(transaction.party_id),
      invoiceId: "",
      reference: "",
      notes: "",
    }, transactionId);
    return transactionDto(pool, businessId, transactionId);
  });
  app.delete<{ Params: Params }>("/api/businesses/:businessId/transactions/:id", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    const transactionId = id.parse(request.params.id);
    await auth.requireMembership(request, businessId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await requireScopedRecord(client, "transactions", businessId, transactionId, true);
      await client.query("delete from payment_allocations where payment_id in (select id from payments where business_id=$1 and transaction_id=$2)", [businessId, transactionId]);
      await client.query("delete from payments where business_id=$1 and transaction_id=$2", [businessId, transactionId]);
      await client.query("delete from invoices where business_id=$1 and transaction_id=$2", [businessId, transactionId]);
      await client.query("delete from transactions where business_id=$1 and id=$2", [businessId, transactionId]);
      await client.query("commit");
      return reply.status(204).send();
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}
