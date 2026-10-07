import type { InvoiceInput } from "./validation.js";

export function toMinor(value: number) {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("Money value is outside the supported range.");
  return minor;
}

export function fromMinor(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Money value is outside the supported range.");
  return value / 100;
}

export function calculateInvoice(input: InvoiceInput) {
  const items = input.items.map((item) => {
    const quantityMilli = Math.round(item.quantity * 1000);
    const rateMinor = toMinor(item.rate);
    const taxBasisPoints = Math.round(item.taxPercent * 100);
    const roundedDivide = (numerator: bigint, denominator: bigint) =>
      Number((numerator + denominator / 2n) / denominator);
    const baseMinor = roundedDivide(BigInt(quantityMilli) * BigInt(rateMinor), 1000n);
    const taxMinor = roundedDivide(BigInt(baseMinor) * BigInt(taxBasisPoints), 10_000n);
    if (![baseMinor, taxMinor].every(Number.isSafeInteger))
      throw new Error("Invoice amount is outside the supported range.");
    return { ...item, quantityMilli, rateMinor, taxBasisPoints, baseMinor, taxMinor };
  });
  const subtotalMinor = items.reduce((sum, item) => sum + item.baseMinor, 0);
  const taxMinor = items.reduce((sum, item) => sum + item.taxMinor, 0);
  const discountMinor = toMinor(input.discount);
  const totalMinor = subtotalMinor + taxMinor - discountMinor;
  if (totalMinor < 0) throw new Error("Discount cannot exceed invoice subtotal and tax.");
  const paidMinor = toMinor(input.amountPaid);
  if (paidMinor > totalMinor) throw new Error("Payment cannot exceed invoice total.");
  return { items, subtotalMinor, taxMinor, discountMinor, totalMinor, paidMinor };
}
