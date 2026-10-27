import { z } from "zod";
import { calendarDate } from "./validation.js";
import { stockQuantity } from "./inventory.js";
export const warehouseInput = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export const unitInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    factor: stockQuantity.refine((v) => v > 0),
  })
  .strict();
export const operationInput = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum([
      "Transfer",
      "Count",
      "Receive",
      "Dispatch",
      "Customer return",
      "Supplier return",
      "Reserve",
      "Release",
      "Valuation",
    ]),
    productId: z.string().min(1),
    warehouseId: z.string().min(1),
    targetWarehouseId: z.string().optional(),
    lineId: z.string().optional(),
    quantity: stockQuantity,
    date: calendarDate,
    reason: z.string().trim().min(5).max(500),
    expectedRevision: z.string().optional(),
    valueMinor: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000_000_000)
      .optional(),
  })
  .strict();
export type StockOperation = z.infer<typeof operationInput>;
export function portion(value: number, part: number, total: number) {
  if (
    ![value, part, total].every(Number.isSafeInteger) ||
    value < 0 ||
    part < 0 ||
    total <= 0 ||
    part > total
  )
    throw new Error("Invalid cost split");
  return Number(
    (BigInt(value) * BigInt(part) + BigInt(total) / 2n) / BigInt(total),
  );
}
export function converted(q: number, f: number) {
  if (![q, f].every(Number.isSafeInteger) || q <= 0 || f <= 0)
    throw new Error("Invalid conversion");
  const n = BigInt(q) * BigInt(f);
  if (n % 1000n !== 0n || n > BigInt(Number.MAX_SAFE_INTEGER) * 1000n)
    throw new Error("Use quantities convertible to 0.001 stock units");
  return Number(n / 1000n);
}
export function weightedMove(
  q: number,
  v: number | null,
  d: number,
  incoming: number | null,
) {
  if (![q, d, q + d].every(Number.isSafeInteger) || q < 0 || q + d < 0)
    throw new Error("Insufficient stock");
  if (v !== null && (!Number.isSafeInteger(v) || v < 0))
    throw new Error("Invalid value");
  if (d >= 0) {
    const value =
      q === 0
        ? incoming
        : v === null || incoming === null
          ? null
          : v + incoming;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error("Invalid value");
    return { quantity: q + d, value, cost: incoming };
  }
  const cost = v === null ? null : portion(v, -d, q);
  return {
    quantity: q + d,
    value: q + d === 0 ? 0 : v === null || cost === null ? null : v - cost,
    cost,
  };
}
