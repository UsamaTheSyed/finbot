import type { trialBalance } from "../domain/trialBalance";
import { csvCell } from "./reportExport";
export function trialBalanceCsv(
  report: ReturnType<typeof trialBalance>,
  date: string,
  cutover: string,
  warnings: string[] = [],
) {
  const rows: (string | number)[][] = [
    ["FinBot Trial Balance", "PKR", "As of", date],
    ["Accounting cutover", cutover],
    [
      "Includes verified opening balances and journals through the selected date. Revenue and expense accounts have not been year-end closed.",
    ],
    ...warnings.map((w) => [w]),
    ["Account", "Debit PKR", "Credit PKR"],
    ...report.rows.map((r) => [
      r.account,
      (r.debit / 100).toFixed(2),
      (r.credit / 100).toFixed(2),
    ]),
    [
      "TOTAL",
      (report.debit / 100).toFixed(2),
      (report.credit / 100).toFixed(2),
    ],
    ["Debit minus credit PKR", (report.difference / 100).toFixed(2)],
    [report.balanced ? "Balanced" : "Out of balance"],
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
