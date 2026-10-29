import type { FinancialReport } from "../types/financialReports";
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportCsv(report: FinancialReport) {
  const rows: (string | number)[][] = [
    [
      "FinBot workspace report — not for filing",
      report.kind,
      report.period,
      "PKR",
    ],
  ];
  if (report.accountingBasis) rows.push([report.accountingBasis]);
  for (const warning of report.warnings || []) rows.push([warning]);
  if (report.kind === "ar-aging" || report.kind === "ap-aging") {
    rows.push([
      "Party",
      "Current",
      ...(report.kind === "ap-aging"
        ? ["1–30 Days", "31–60 Days", "61+ Days"]
        : ["30+ Days", "60+ Days", "90+ Days"]),
      "Total Outstanding",
    ]);
    rows.push(
      ...report.aging.map((r) => [
        r.party,
        r.current,
        r.thirty,
        r.sixty,
        r.ninety,
        r.total,
      ]),
    );
  } else {
    rows.push(
      ["Description", "Amount (PKR)"],
      ...report.lines.map((r) => [r.label, r.amount]),
    );
    const documents =
      report.kind === "purchases" ? report.purchases : report.sales;
    if (documents?.length)
      rows.push(
        [],
        [
          "Date",
          "Document",
          report.kind === "purchases" ? "Supplier" : "Customer",
          "Subtotal",
          "Discount",
          "Tax",
          "Total",
        ],
        ...documents.map((r) => [
          r.date,
          r.displayId,
          r.party,
          r.subtotal,
          r.discount,
          r.tax,
          r.total,
        ]),
      );
    if (report.cash.length)
      rows.push(
        [],
        ["Date", "Description", "Category", "Cash In", "Cash Out", "Balance"],
        ...report.cash.map((r) => [
          r.date,
          r.description,
          r.category,
          r.incoming,
          r.outgoing,
          r.balance,
        ]),
      );
  }
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function downloadReport(report: FinancialReport) {
  const url = URL.createObjectURL(
    new Blob([reportCsv(report)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `finbot-${report.kind}-${report.period}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
