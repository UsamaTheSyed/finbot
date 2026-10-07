# Figma verification update

> Historical Phase 1 record. Current implementation and verification status are in `phase-2-summary.md`. Phase 2 replaces the static KPI/illustrative invoice behavior described below.

Reference supplied by the user: https://www.figma.com/design/3jjUDQgHWXPqD3L6yy6thh/Brand-web--Copy---Copy-?node-id=4001-902

Both target frames returned full design context and a screenshot:

- Dashboard: `655:1018`, 1440 × 1200.
- Transaction Detail: `782:1341`, 1440 × 1000.

## Confirmed corrections

| Area               | Verified value / implemented correction                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Dashboard canvas   | #f1efe8                                                                                                                       |
| Dashboard header   | Workspace next to bronze logo, centered SaaS / Dashboard breadcrumb, 200 × 36 search, compact user menu                       |
| Detail header      | Left breadcrumb; brand moved into sidebar; name-only user menu                                                                |
| Sidebar            | 44 px rows, 2 px gaps; Dashboard starts 16 px below header; Detail has separate brand block                                   |
| KPI values         | 24 px, bold; receivable #3b6d11, payable #a32d2d                                                                              |
| Cards              | 8 px radius; Dashboard metric shadow 0 4 6 / 3%, table shadow 0 4 12 / 3%; inside strokes                                     |
| Dashboard tables   | 51 px title, 38 px header, 48 px rows; explicit date/amount/status widths; blue links #185fa5                                 |
| Dashboard statuses | Borderless 4 px radius, 11 px text; Partial #d97706; Completed background rgba(59,109,17,.08)                                 |
| Quick actions      | Three bronze buttons, 240 × 48, 24 px gap; source plus icon and plus label retained                                           |
| Detail heading     | 20 px bold, bordered red Partial badge, 14 px action labels and red delete outline                                            |
| Metadata           | Uppercase muted labels, semibold values, short month with year, linked bronze party name                                      |
| Item table         | 100 px quantity, 120 px unit rate, 140 px amount content; right-aligned prices and bold line totals                           |
| Payment breakdown  | 420 px panel, 20 px padding, 16 px heading gap, 12 px row gaps, 8 px bottom padding and dividers; discount red and paid green |

These are source-to-code corrections, not a claim of rendered pixel identity.

## Deliberate differences and unresolved assets

- Keep the same demo user (Haris Munir) across routes. Figma switches to Mike Pence on Detail.
- Keep the linked Ahmed Khan transaction at PKR 42,000 total, PKR 25,000 paid, PKR 17,000 outstanding. Dashboard shows PKR 25,000 as its amount in the design, conflicting with Detail.
- Retain en-PK thousands grouping throughout; Figma Dashboard uses Indian grouping while Detail uses international grouping.
- Align the items header to the full table body. The Figma header is only 513 px wide and overlaps Qty with Description; its body is 708 px.
- Dashboard Parties has a hover-like beige fill in the reference although Dashboard is active. The app applies that fill on hover and preserves the actual active route.
- The Figma avatar download failed with a network approval cancellation. The initials fallback remains. Existing Lucide icons have not been verified against the exact exported SVG bytes, so icon fidelity remains pending.
- Small viewport reflow is an engineering interpretation. Only the 1440 px Figma target frames were supplied.
- KPI and invoice fixtures remain illustrative; this phase does not implement accounting/report calculations.

## Interaction review

Code review found and corrected two edge cases:

1. A deep-linked payment dialog cannot open when the transaction balance is already zero.
2. Arrow Down on an empty search result cannot set the selected result index below zero.

The metadata party name now links to its reserved Party Detail route.

## Checks actually completed

- Full Figma context and screenshot inspection for both target screens.
- Strict TypeScript / production build.
- Five domain tests: partial payment, full settlement, overpayment/invalid money, real calendar dates, and combined filters.
- Playwright test discovery: nine cases across three viewport projects.

## Browser blocker and reproducible checks

The supported cloud browser initialized successfully. Opening
`http://127.0.0.1:5173` returned `net::ERR_BLOCKED_BY_CLIENT` before the app
loaded. No click, payment, keyboard, layout screenshot or pixel comparison
was completed through that browser. The block was not bypassed.

`tests/browser/finbot.spec.ts` and `playwright.config.ts` are ready for local
execution. Three scenarios run at each of 1440, 1280 and 1024 px:

- Dashboard, table filtering, pagination, detail navigation, overflow and screenshots.
- Date/notes dialog, overpayment prevention, full settlement, disabled payment, cancel/delete confirmation.
- Keyboard search after empty results, notifications, workspace, sidebar toggle and missing record.

Run `npx playwright install chromium` then `npm run test:browser` after installing
project dependencies. These test cases remain unexecuted, so selector/behavior
issues may still need adjustment. Visual comparison is still required before
calling this implementation an exact Figma match.
