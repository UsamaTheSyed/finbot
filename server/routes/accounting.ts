import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { z } from "zod";
import { calendarDate } from "../domain/validation.js";
import { ApiError } from "../lib/errors.js";
import {
  openingPreview,
  activateAccounting,
} from "../services/accountingOpening.js";
import { accountingReport } from "../services/accountingReports.js";
import { resolveSupplierCredit } from "../services/accountingCredits.js";
const amount = z.number().int().min(0).max(1_000_000_000_000),
  signed = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
export async function accountingRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  auth: Auth,
) {
  type P = { businessId: string };
  const base = "/api/businesses/:businessId/accounting";
  app.get<{ Params: P }>(base, async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b),
      q = z.object({ from: calendarDate, to: calendarDate }).parse(r.query);
    if (q.from > q.to)
      throw new ApiError(
        400,
        "DATE_RANGE",
        "Start date must precede end date.",
      );
    return {
      ...(await accountingReport(pool, b, q.from, q.to)),
      canManage: m.role === "Owner",
    };
  });
  app.get<{ Params: P }>(base + "/preview", async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    if (m.role !== "Owner")
      throw new ApiError(
        403,
        "ACCOUNTING_PERMISSION",
        "Only the owner can verify opening balances.",
      );
    const q = z.object({ date: calendarDate }).parse(r.query),
      c = await pool.connect();
    try {
      await c.query("begin isolation level repeatable read read only");
      const { baseline: _baseline, ...v } = await openingPreview(c, b, q.date);
      void _baseline;
      await c.query("commit");
      return v;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post<{ Params: P }>(base + "/activate", async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    if (m.role !== "Owner")
      throw new ApiError(
        403,
        "ACCOUNTING_PERMISSION",
        "Only the owner can activate accounting.",
      );
    const v = z
      .object({
        date: calendarDate,
        token: z.string().length(64),
        cash: signed,
        customer: signed,
        supplier: signed,
        inventory: amount,
        inputTax: amount,
        outputTax: amount,
        confirmed: z.literal(true),
      })
      .strict()
      .parse(r.body);
    return activateAccounting(pool, b, m.user.id, v);
  });
  app.post<{ Params: P }>(base + "/credits/resolve", async (r) => {
    const b = r.params.businessId,
      m = await auth.requireMembership(r, b);
    if (m.role !== "Owner")
      throw new ApiError(
        403,
        "ACCOUNTING_PERMISSION",
        "Only the owner can allocate purchase credits.",
      );
    const v = z
      .object({
        creditId: z.string().min(1),
        allocations: z
          .array(
            z
              .object({
                productId: z.string().min(1),
                warehouseId: z.string().min(1),
                amountMinor: amount.refine((n) => n > 0),
              })
              .strict(),
          )
          .max(100),
        cogsMinor: signed,
        clearingMinor: amount,
        expenseMinor: amount,
        date: calendarDate,
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(r.body);
    return resolveSupplierCredit(pool, b, m.user.id, v);
  });
}
