import { multiplyMinor, percentMinor, sumMinor } from "../utils/money";
export interface CalculableLine {
  quantity: number;
  rateMinor: number;
  taxPercent: number;
}
export const calculateLineSubtotal = (line: CalculableLine) =>
  multiplyMinor(line.rateMinor, line.quantity);
export const calculateLineTax = (line: CalculableLine) =>
  percentMinor(calculateLineSubtotal(line), line.taxPercent);
export const calculateLineTotal = (line: CalculableLine) =>
  sumMinor([calculateLineSubtotal(line), calculateLineTax(line)]);
export const calculateInvoiceSubtotal = (items: CalculableLine[]) =>
  sumMinor(items.map(calculateLineSubtotal));
export const calculateInvoiceTax = (items: CalculableLine[]) =>
  sumMinor(items.map(calculateLineTax));
export function calculateInvoiceTotal(
  items: CalculableLine[],
  discountMinor = 0,
) {
  const subtotalMinor = calculateInvoiceSubtotal(items),
    taxMinor = calculateInvoiceTax(items);
  if (
    !Number.isSafeInteger(discountMinor) ||
    discountMinor < 0 ||
    discountMinor > subtotalMinor
  )
    throw new Error("Discount must be between zero and the subtotal.");
  return {
    subtotalMinor,
    taxMinor,
    discountMinor,
    totalMinor: sumMinor([subtotalMinor, taxMinor, -discountMinor]),
  };
}
