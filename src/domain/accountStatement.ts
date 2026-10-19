import { z } from "zod";
import { safeMinor, sumMinor } from "../utils/money.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v
    );
  }, "Choose a real calendar date");
export const statementRangeSchema = z
  .object({
    from: z.union([date, z.literal("")]).default(""),
    to: z.union([date, z.literal("")]).default(""),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Start date must not be after end date",
    path: ["to"],
  });
export type StatementRange = z.infer<typeof statementRangeSchema>;
export interface StatementEntry {
  id: string;
  date: string;
  reference: string;
  label: string;
  amountMinor: number;
  href: string;
}
export interface AccountStatement {
  range: StatementRange;
  openingMinor: number;
  increasesMinor: number;
  decreasesMinor: number;
  closingMinor: number;
  rows: (StatementEntry & { balanceMinor: number })[];
}
export function accountStatement(
  entries: StatementEntry[],
  input: StatementRange,
): AccountStatement {
  const range = statementRangeSchema.parse(input);
  const ordered = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  let openingMinor = 0,
    balanceMinor = 0,
    increasesMinor = 0,
    decreasesMinor = 0;
  const rows: AccountStatement["rows"] = [];
  for (const entry of ordered) {
    date.parse(entry.date);
    safeMinor(entry.amountMinor);
    if (range.to && entry.date > range.to) continue;
    if (range.from && entry.date < range.from) {
      openingMinor = sumMinor([openingMinor, entry.amountMinor]);
      balanceMinor = openingMinor;
      continue;
    }
    balanceMinor = sumMinor([balanceMinor, entry.amountMinor]);
    if (entry.amountMinor >= 0)
      increasesMinor = sumMinor([increasesMinor, entry.amountMinor]);
    else decreasesMinor = sumMinor([decreasesMinor, -entry.amountMinor]);
    rows.push({ ...entry, balanceMinor });
  }
  return {
    range,
    openingMinor,
    increasesMinor,
    decreasesMinor,
    closingMinor: balanceMinor,
    rows,
  };
}
export const statementPeriod = (range: StatementRange) =>
  `${range.from || "Beginning"} to ${range.to || "Latest recorded date"}`;
export const statementFilename = (id: string, range: StatementRange) =>
  `finbot-statement-${id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}-${range.from || "beginning"}-${range.to || "latest"}.pdf`;
