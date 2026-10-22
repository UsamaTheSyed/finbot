import { z } from "zod";
import { invoiceInput, calendarDate } from "./validation.js";
import { calculateInvoice } from "./money.js";
import { ApiError } from "../lib/errors.js";
import type { Invoice } from "../../src/types/index.js";
export const correctionInput = z
  .object({
    revision: z.string().regex(/^\d+$/),
    reason: z
      .string()
      .trim()
      .min(5, "Explain why this correction is needed.")
      .max(500),
    effectiveDate: calendarDate,
    data: invoiceInput,
  })
  .strict();
export type CorrectionInput = z.infer<typeof correctionInput>;
export function correctionPlan(
  current: Omit<Invoice, "status"> & { status: string },
  input: CorrectionInput,
  today: string,
) {
  const value = correctionInput.parse(input),
    data = value.data;
  if (current.status === "Draft" || !current.transactionId)
    throw new ApiError(
      409,
      "NOT_ISSUED",
      "Use Edit Draft for an unissued document.",
    );
  if (current.revision !== value.revision)
    throw new ApiError(
      409,
      "DOCUMENT_CHANGED",
      "This document or its payments changed. Reopen the correction and review it again.",
    );
  if (
    data.partyId !== current.partyId ||
    data.date !== current.date ||
    data.dueDate !== current.dueDate
  )
    throw new ApiError(
      400,
      "LOCKED_FIELDS",
      "Party, document date and due date cannot change in a financial correction.",
    );
  if (data.draft || data.amountPaid !== 0)
    throw new ApiError(
      400,
      "PAYMENTS_LOCKED",
      "Record payments separately; this correction cannot change cash or allocations.",
    );
  if (value.effectiveDate !== today || value.effectiveDate < current.date)
    throw new ApiError(
      400,
      "CORRECTION_DATE",
      "Corrections must be posted on today's workspace date, on or after the original document date.",
    );
  let totals: ReturnType<typeof calculateInvoice>;
  try {
    totals = calculateInvoice(data);
  } catch (error) {
    throw new ApiError(
      400,
      "INVALID_TOTAL",
      error instanceof Error ? error.message : "Invalid total.",
    );
  }
  if (
    ![totals.subtotalMinor, totals.taxMinor, totals.totalMinor].every(
      Number.isSafeInteger,
    )
  )
    throw new ApiError(
      400,
      "INVALID_TOTAL",
      "Invoice amount is outside the supported range.",
    );
  if (totals.totalMinor < current.paidMinor)
    throw new ApiError(
      409,
      "CREDIT_REQUIRED",
      "Corrected total cannot be below the allocated payment. A refund or credit adjustment is required; no payment has been changed.",
    );
  const comparable = (items: Invoice["items"]) =>
    items.map((i) => [
      i.item,
      i.description,
      i.quantity,
      i.unit,
      i.rateMinor,
      i.taxPercent,
    ]);
  const items = totals.items.map((i, index) => ({
    id: `${current.id}-line-${index + 1}`,
    item: i.item,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    rateMinor: i.rateMinor,
    taxPercent: i.taxPercent,
  }));
  if (
    JSON.stringify(comparable(items)) ===
      JSON.stringify(comparable(current.items)) &&
    totals.discountMinor === current.discountMinor &&
    data.reference === current.reference &&
    data.notes === current.notes &&
    data.terms === current.terms
  )
    throw new ApiError(
      400,
      "NO_CHANGES",
      "Change at least one document field before posting a correction.",
    );
  return {
    totals,
    items,
    deltaMinor: totals.totalMinor - current.totalMinor,
    balanceMinor: totals.totalMinor - current.paidMinor,
  };
}
