import { z } from "zod";
import { calendarDate } from "./validation.js";
export const stockQuantity = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(
    (v) => Math.round(v * 1000) / 1000 === v,
    "Use at most three decimal places",
  );
export const productInput = z
  .object({
    category:z.string().trim().max(100).optional(),variant:z.string().trim().max(100).optional(),openingValueMinor:z.number().int().nonnegative().max(1_000_000_000_000).optional(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    unit: z.string().trim().min(1).max(40),
    opening: stockQuantity,
    minimum: stockQuantity,
    date: calendarDate,
  })
  .strict();
export const adjustmentInput = z
  .object({
    incomingCost:z.number().int().nonnegative().max(1_000_000_000_000).optional(),
    requestId: z.string().uuid(),
    date: calendarDate,
    kind: z.enum([
      "Adjustment in",
      "Adjustment out",
      "Customer return",
      "Supplier return",
    ]),
    quantity: stockQuantity.refine(
      (v) => v > 0,
      "Quantity must be greater than zero",
    ),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export function stockAfter(current: number, delta: number) {
  const next = current + delta;
  if (![current, delta, next].every(Number.isSafeInteger) || next < 0)
    throw new Error("Insufficient stock or unsupported quantity.");
  return next;
}
