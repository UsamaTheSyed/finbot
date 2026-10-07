# FinBot phase 3 patch — 28 September 2026

This archive contains only new or changed files. It is not a replacement project.

## Apply

1. Stop Vite and back up your working project.
2. Extract this archive into `D:\Usama\finbot-source\finbot`, the folder containing `package.json`. Merge its `src`, `tests`, and `docs` directories.
3. Replace the two existing files included: `src/app/router/routes.tsx` and `src/styles/tokens.ts`. If you edited these independently, merge those edits first.
4. No dependency changes or reinstall are required.
5. Run `npm run build`, `npm run lint`, `npm test`, then `npm run test:browser`.

The browser suite now lists 27 cases: the existing 18 plus nine phase-three cases (three scenarios at 1440, 1280 and 1024 pixels). To run only this phase: `npx playwright test tests/browser/phase-three.spec.ts`. It writes screenshots of the six new pages to the Playwright results directory for local visual review.

## Implemented

- `/reports`: ten Figma report cards, reporting period selection, links to four implemented report details. Other cards show honest deferred-feature feedback.
- `/reports/daily`: daily cash/sales snapshot, previous/next day and date control, empty period handling, browser print.
- `/reports/ar-aging`: six-column aging table and total row, CSV export.
- `/reports/profit-loss`: statement, Recharts comparison chart, month selection, CSV and browser print.
- `/reports/cash-flow`: four metrics, Recharts cash trend, ledger table, month selection, CSV and browser print.
- `/settings`: Business Profile, React Hook Form/Zod validation, PNG/JPEG logo preview with size/type/decode checks, service-backed session-only saving, workspace-name query invalidation. Integration controls show deferred feedback.

Reports use explicitly labelled presentation snapshots, independent of transaction/invoice/payment edits. They are not real accounting calculations. Only November 2026 is populated; other dates show an empty state. Existing Dashboard calculations and services were not changed. Settings reset on refresh, consistent with the existing mock data layer. PDF generation, messaging connections, backend persistence, team permissions and tax compliance remain deferred.

## Help and missing designs

The supplied root frame contains 23 desktop/modal/component frames, but no Help screen. `/help` therefore retains the existing placeholder. Supply a Help frame link to implement it without inventing a design.

Sales, Purchase, A/P Aging, Trial Balance, Tax Report and Customer Statement cards have no corresponding detail frames in that group. Settings shows sub-navigation for Invoice Settings, Payment Methods, Tax Settings, Security and Subscription, but only Business Profile and the integration cards are designed. These destinations are not silently presented as completed features.

## Figma evidence and decisions

File: `3jjUDQgHWXPqD3L6yy6thh`, root `4001:902`.

| Screen | Node |
|---|---|
| Overview | 782:1862 |
| Daily Summary | 655:2031 |
| A/R Aging | 655:2146 |
| Profit & Loss | 783:2089 |
| Cash Flow | 783:2264 |
| Settings | 783:2446 |

All six design contexts and screenshots were inspected. Figma uses 24px overview padding, 32px detail/settings padding, 16px report-grid gaps, 20px report-card padding, 8px card radii, a 600px daily card, 480px P&L chart column and 240px settings sub-navigation. These are represented through existing or added tokens. Laptop adjustments wrap controls and permit table scrolling.

Inconsistencies and deliberate differences:

- Daily/Aging sidebar labels differ from Overview/P&L. The established application shell remains consistent; the new pages do not replace the global shell.
- Figma alternates Ali Enterprise and Kashif Trading. Settings uses the active existing Ali Enterprise workspace and Haris Munir profile.
- Daily shows November 2024; other reports show November 2026. Demo dates are normalized to November 2026.
- The overview says Current Fiscal Year without defining boundaries. The functional selector explicitly selects demo months instead.
- Figma's P&L legend uses green/red while bars use bronze/grey. The functional legend uses the actual series colours.
- Chart bars/lines in Figma are decorative geometry, with no numeric axis; chart history values are illustrative fixtures, not extracted financial results. Recharts renders the dynamic chart, and the November P&L values match the statement.
- Cash Flow is labelled Accrual Basis in Figma; the implementation says Cash movements. The visible eight ledger rows are only a sample and do not reconcile to the full-month summary alone.
- Aging's Export Excel becomes an accurately labelled CSV export, without adding a spreadsheet dependency.
- Figma's WhatsApp Connected badge is changed to Not Connected because no backend integration exists.
- Functional date/month inputs, Overview/Cash Flow navigation, accessible feedback and demo notices add controls/copy beyond the static layouts.

Original icons were exported read-only from Figma and saved in `src/assets/phase-three`. URL downloads returned HTML errors; those invalid downloads were replaced with real SVG exports. Root sizes: report icons 18×18, arrow 10×10, action icons 16×16, logo placeholder 64×64, integration markers 24×24. No temporary asset URLs are used in code.

## Validation

- TypeScript/production build: passed.
- ESLint: passed.
- Unit/service/render tests: 19 passed.
- Browser test discovery: 27 cases listed.
- New browser execution: blocked before launching Chromium because the executable is unavailable. Installation returned invalid download archives. No application assertions ran in this environment.
- Rendered Figma comparison, runtime asset geometry and the new browser cases still require local verification. This patch is not claimed to be pixel-perfect or browser-verified.
- The prior 18/18 result was reported by you before this patch; it is not a fresh regression result for these changes.

Review after applying: all six routes, all four report links, period/empty-state recovery, CSV downloads, profile validation/save/navigation retention, logo preview, horizontal overflow, and screenshots at all three widths. The included tests cover the primary interactions.
