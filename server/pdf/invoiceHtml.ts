import { tokens } from "../../src/styles/tokens.js";
import { calculateInvoice } from "../domain/money.js";
import type { InvoicePdfData, Contact } from "./invoiceData.js";
import { invoicePdfStyles } from "./styles.js";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number) =>
  `PKR ${(n / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function details(c: Contact) {
  return `<strong>${escapeHtml(c.name)}</strong>${[
    c.phone,
    c.email,
    c.address,
    c.ntn && `NTN: ${c.ntn}`,
  ]
    .filter(Boolean)
    .map((v) => `<p dir="auto">${escapeHtml(v)}</p>`)
    .join("")}`;
}
export function invoiceHtml(data: InvoicePdfData, fonts: string) {
  const { invoice: i, party, business, payments } = data;
  const name = party.kind === "Supplier" ? "Bill" : "Invoice";
  // Same per-line rounding as the write service; displayed summary stays authoritative.
  const calculated = calculateInvoice({
    partyId: i.partyId,
    date: i.date,
    dueDate: i.dueDate,
    reference: i.reference,
    items: i.items.map((l) => ({ ...l, rate: l.rateMinor / 100 })),
    discount: i.discountMinor / 100,
    amountPaid: 0,
    method: "Cash",
    notes: i.notes,
    terms: i.terms,
    draft: i.status === "Draft",
  });
  const logo =
    business.logo &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(business.logo) &&
    business.logo.length < 7_000_000
      ? `<img class="logo" alt="Business logo" src="${business.logo}">`
      : "";
  const summary: [string, number, string][] = [
    ["Subtotal", i.subtotalMinor, ""],
    ["Tax", i.taxMinor, ""],
    ["Discount", -i.discountMinor, ""],
    ["Grand Total", i.totalMinor, "total"],
    ...(i.creditedMinor
      ? ([
          ["Credits", -i.creditedMinor, ""],
          [
            "Net Total",
            i.netTotalMinor ?? i.totalMinor - i.creditedMinor,
            "total",
          ],
        ] as [string, number, string][])
      : []),
    [
      i.creditedMinor ? "Allocated after credit" : "Amount Paid",
      i.paidMinor,
      "paid",
    ],
    [
      i.status === "Draft" ? "Projected Balance" : "Balance Due",
      i.balanceMinor,
      "balance",
    ],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
    <title>${escapeHtml(name)} ${escapeHtml(i.displayId || i.id)}</title><style>${fonts}${invoicePdfStyles(tokens)}</style></head><body>
    <header>${logo}<div>${details(business)}</div><div class="document-title"><h1>${name}</h1><strong>${escapeHtml(i.displayId || i.id)}</strong><p class="status">${escapeHtml(i.status)}</p></div></header>
    ${i.status === "Draft" ? '<p class="draft">DRAFT - Not issued. No amount is due from this draft.</p>' : ""}
    ${data.corrections?.length ? `<h2>Corrected document</h2><p>Current values include the following adjustments. Original revisions remain available in FinBot.</p><table><thead><tr><th>Date</th><th>Reason</th><th>Adjustment</th></tr></thead><tbody>${data.corrections.map((c) => `<tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.reason)}</td><td>${money(c.deltaMinor)}</td></tr>`).join("")}</tbody></table>` : ""}
    <div class="info"><section><h2>${name} Details</h2><dl>${[
      [`${name} Date`, i.date],
      ["Due Date", i.dueDate],
      ["Reference", i.reference || "-"],
      ["Payment Status", i.status],
    ]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join("")}</dl></section>
    <section><h2>${name === "Bill" ? "Supplier" : "Bill To"}</h2>${details(party)}</section></div>
    <table aria-label="${name} items"><colgroup><col style="width:35%"><col style="width:13%"><col style="width:18%"><col style="width:16%"><col style="width:18%"></colgroup><thead><tr>${["Description", "Qty / Unit", "Rate", "Tax", "Amount"].map((v) => `<th>${v}</th>`).join("")}</tr></thead><tbody>${calculated.items.map((l) => `<tr><td><strong dir="auto">${escapeHtml(l.item)}</strong>${l.description ? `<small dir="auto">${escapeHtml(l.description)}</small>` : ""}</td><td>${l.quantity}<small>${escapeHtml(l.unit)}</small></td><td>${money(l.rateMinor)}</td><td>${money(l.taxMinor)}<small>${l.taxPercent}%</small></td><td><strong>${money(l.baseMinor + l.taxMinor)}</strong></td></tr>`).join("")}</tbody></table>
    <section class="summary"><h2>${name} Summary</h2><dl>${summary.map(([k, v, c]) => `<div class="${c}"><dt>${k}</dt><dd>${money(v)}</dd></div>`).join("")}</dl></section>
    ${data.creditHistory?.length ? `<h2>Credit and Refund History</h2><table><thead><tr><th>Date</th><th>Event</th><th>Amount</th><th>Reason</th></tr></thead><tbody>${data.creditHistory.map((c) => `<tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.kind)}</td><td>${money(c.amountMinor)}</td><td>${escapeHtml(c.reason)}</td></tr>`).join("")}</tbody></table><p class="caption">Credits reduce the original document total. Original payment allocations below remain in history; the summary shows the current net allocation. Refunds affect party cash, not the original receipt amount.</p>` : ""}
    ${payments.length ? `<h2>Payment History</h2><p class="caption">Amounts allocated to this ${name.toLowerCase()} only; includes applied advances.</p><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>${payments.map((p) => `<tr><td>${escapeHtml(p.date)}</td><td>${money(p.amountMinor)}</td><td>${escapeHtml(p.method)}</td><td>${escapeHtml(p.reference || "-")}</td></tr>`).join("")}</tbody></table>` : ""}
    ${[
      ["Notes", i.notes],
      ["Terms & Conditions", i.terms],
    ]
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<section class="notes"><h2>${k}</h2><p dir="auto">${escapeHtml(v)}</p></section>`,
      )
      .join("")}
    <p class="caption end">Generated by FinBot · Currency: PKR · ${name === "Bill" ? "Supplier bill record" : "Customer invoice"}</p>
    </body></html>`;
}
