import { calendarDate } from "../../domain/validation.js";

export function amountPaisa(raw: string): number {
  const match = raw
    .trim()
    .toLowerCase()
    .match(
      /^(?:(?:pkr|rs\.?|rupees?)\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(k|hazar|thousand|lakh|lac)?(?:\s*(?:pkr|rs\.?|rupees?))?$/i,
    );
  if (!match) throw new Error("Amount saaf likhein, misal 15k ya 15000.50.");
  const [whole, fraction = ""] = match[1].replaceAll(",", "").split(".");
  const multiplier = /^(lakh|lac)$/.test(match[2] ?? "")
    ? 100000n
    : match[2]
      ? 1000n
      : 1n;
  const value =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * multiplier;
  if (value > 100_000_000_000n)
    throw new Error("Amount supported limit se zyada hai.");
  return Number(value);
}
export function localDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export function dateRange(raw: string, timezone: string, now = new Date()) {
  const today = localDate(timezone, now),
    value = raw.toLowerCase().trim();
  if (["today", "aaj"].includes(value)) return { start: today, end: today };
  if (["yesterday", "guzishta kal", "beeta kal"].includes(value)) {
    const day = shiftDate(today, -1);
    return { start: day, end: day };
  }
  if (value === "kal")
    throw new Error(
      "Kal se murad yesterday ya tomorrow? YYYY-MM-DD date likhein.",
    );
  if (["tomorrow", "aanay wala kal"].includes(value)) {
    const day = shiftDate(today, 1);
    return { start: day, end: day };
  }
  if (["this week", "is haftay"].includes(value)) {
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    return { start: shiftDate(today, -((dow + 6) % 7)), end: today };
  }
  if (["this month", "is mahine"].includes(value))
    return { start: today.slice(0, 7) + "-01", end: today };
  const day = calendarDate.parse(value);
  return { start: day, end: day };
}
export function mutationDate(raw: string, timezone: string, now = new Date()) {
  const range = dateRange(raw, timezone, now);
  if (range.start !== range.end)
    throw new Error("Ek absolute transaction date YYYY-MM-DD mein dein.");
  return range.start;
}
export const pkr = (minor: number) =>
  `PKR ${(minor / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
