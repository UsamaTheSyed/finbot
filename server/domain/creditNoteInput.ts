import { z } from "zod";
import { calendarDate, id, paymentInput } from "./validation.js";
const reason = z.string().trim().min(5).max(500);
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Paisa at this boundary: do not convert a second time in the service. */
export const creditNoteInput = z
  .object({
    requestId: z.string().uuid(),
    invoiceId: id,
    revision: z.string().regex(/^\d+$/),
    amountMinor: amount,
    subtotalMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    taxMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    discountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    effectiveDate: calendarDate,
    reason,
  })
  .strict();
export const creditRefundInput = z
  .object({
    requestId: z.string().uuid(),
    partyId: id,
    amountMinor: amount,
    effectiveDate: calendarDate,
    reason,
    method: paymentInput.shape.method,
    reference: z.string().trim().max(100),
  })
  .strict();
export const applyCreditInput = z
  .object({
    requestId: z.string().uuid(),
    invoiceId: id,
    revision: z.string().regex(/^\d+$/),
    amountMinor: amount,
    effectiveDate: calendarDate,
    reason,
  })
  .strict();
// Direction, workspace, actor, available balance and tax are never supplied by
// these requests. The authenticated posting service must resolve them itself.
