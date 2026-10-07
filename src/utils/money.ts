/** All new ledger amounts are integer paisa. Round half-up per line, then sum.
 * Legacy transaction DTOs expose rupees; convert only at their service boundary. */
export function safeMinor(value: bigint | number): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Amount exceeds the supported money range.");
  return n;
}
export function scaled(value: number | string, decimals: number): bigint {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text))
    throw new Error("Enter a valid decimal amount.");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const result =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  return negative ? -result : result;
}
export const toMinor = (value: number | string) => safeMinor(scaled(value, 2));
export function fromMinor(value: number) {
  const minor = safeMinor(value),
    rupees = minor / 100;
  if (toMinor(rupees) !== minor)
    throw new Error(
      "Amount cannot be represented by the legacy rupee interface.",
    );
  return rupees;
}
export function sumMinor(values: number[]) {
  return safeMinor(values.reduce((n, v) => n + BigInt(safeMinor(v)), 0n));
}
export function multiplyMinor(amountMinor: number, quantity: number) {
  if (amountMinor < 0 || !Number.isFinite(quantity) || quantity <= 0)
    throw new Error(
      "Rates must be nonnegative and quantities must be positive.",
    );
  return safeMinor(
    (BigInt(safeMinor(amountMinor)) * scaled(quantity, 3) + 500n) / 1000n,
  );
}
export function percentMinor(amountMinor: number, percent: number) {
  if (
    amountMinor < 0 ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw new Error("Tax must be between zero and 100 percent.");
  return safeMinor(
    (BigInt(safeMinor(amountMinor)) * scaled(percent, 2) + 5000n) / 10000n,
  );
}
export function formatPKR(minor: number) {
  return `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(fromMinor(minor))}`;
}
