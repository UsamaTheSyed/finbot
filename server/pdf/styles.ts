import type { tokens } from "../../src/styles/tokens.js";
// A4-specific dimensions are print layout decisions. Brand styles reuse verified tokens.
export function invoicePdfStyles(t: typeof tokens) {
  const c = t.colors;
  return `@page { size: A4; margin: 14mm 12mm 18mm; }
  *{box-sizing:border-box} html{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  body{margin:0;color:${c.text};background:${c.surface};font:10.5px/1.4 Inter,Arial,sans-serif;overflow-wrap:anywhere}
  header{display:flex;gap:16px;align-items:flex-start;border-bottom:2px solid ${c.brand};padding-bottom:12px;margin-bottom:16px}
  header>div{flex:1;min-width:0} .document-title{text-align:right} h1{color:${c.brand};font-size:24px;margin:0} h2{font-size:14px;margin:0 0 12px;color:${c.brand};break-after:avoid}
  p{margin:2px 0;white-space:pre-wrap} .logo{width:48px;height:48px;object-fit:contain}
  .status{display:inline-block;padding:3px 8px;border:1px solid ${c.border};border-radius:${t.radius.small}px}
  .draft{background:${c.warningBg};padding:10px;margin-bottom:16px;font-weight:700}
  .info{display:flex;gap:16px;margin-bottom:16px;break-inside:avoid} section{border:1px solid ${c.border};border-radius:${t.radius.card}px;padding:12px}
  .info section{flex:1;min-width:0} dl{margin:0} dl>div{display:flex;gap:10px;justify-content:space-between;padding:4px 0} dt{color:${c.secondary}} dd{margin:0;text-align:right;font-weight:600;max-width:66%}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 16px} thead{display:table-header-group} tr{break-inside:avoid} th,td{padding:8px;border-bottom:1px solid ${c.border};text-align:right;vertical-align:top} th{background:${c.tableHeader};font-size:10px} td:first-child,th:first-child{text-align:left} tbody tr:nth-child(even){background:${c.canvas}} small{display:block;color:${c.secondary};font-size:10px}
  .summary{width:52%;margin:0 0 16px auto;break-inside:avoid} .total{border-top:1px solid ${c.border};font-weight:700} .paid{background:${c.successBg};color:${c.success};padding:6px!important;margin-top:6px} .balance{background:${c.dangerBg};color:${c.danger};padding:6px!important;margin-top:6px} .paid dt,.balance dt{color:inherit}
  .notes{margin:12px 0;white-space:normal} .caption{font-size:10px;color:${c.secondary};margin:0 0 8px}.end{margin-top:20px}
  `;
}
