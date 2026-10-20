# Sales Report + A/P Aging

Baseline: FinBot commit `85e6397` (party statements and PDF downloads).
This ZIP contains changed/new files only. Extract its contents into your existing
`D:\Usama\finbot-source\finbot` folder and allow these files to replace the old versions.
Do not replace the whole project or delete other files. No dependencies, environment
variables or database migrations are added.

## Behavior

- Reports → Sales Report → `/reports/sales`: month filter, posted sales table,
  subtotal/discount/tax/total summary, invoice/transaction links, CSV and browser print.
  Sales are counted from posted Sale transactions once; drafts, purchases and cash
  receipts are excluded. Totals include tax and are labelled accordingly. This is
  a transaction-level report, not product profitability or tax filing.
- Reports → A/P Aging → `/reports/ap-aging`: month-end supplier bill balances,
  grouped by supplier ID (equal supplier names are kept separate). Buckets:
  current/not overdue, 1–30, 31–60, 61+ days overdue. CSV and browser print work.
- A/P balances use completed manual/FIFO settlements effective on/before month-end.
  Later payments do not rewrite earlier periods. Unallocated advances do not reduce
  individual bill balances until allocated. Draft bills are excluded.
- Existing finance mutation query invalidation refreshes both reports.
- Same report shell, controls, tables, tokens and CSS; no styling conversion.
  Dedicated Sales/AP detail frames were absent in both supplied Figma files;
  existing report layouts were reused with your explicit approval.
- Report PDF export retains the existing deferred-action message. Invoice/bill PDF
  and party statement PDF features are unchanged. Telegram PDFs remain deferred.
- Purchase Report, Trial Balance and Tax Report remain outside this patch.

## Run commands separately in CMD

Stop running frontend/API test servers with Ctrl+C before browser tests to avoid
port collisions. Docker Desktop must be running.

```bat
cd /d D:\Usama\finbot-source\finbot
```
```bat
docker compose up -d db
```
```bat
npm run build
```
```bat
npm test
```
```bat
npx playwright test tests/browser/sales-ap.spec.ts --project=desktop-1440 --workers=1
```
Expected targeted result: 2 passed. Then all three widths:

```bat
npx playwright test tests/browser/sales-ap.spec.ts --workers=1
```
Expected: 6 passed. Finally:

```bat
npm run test:browser
```
The existing browser fixture resets and seeds its configured TEST database.
Keep your existing test/development database separation.

## Manual check

1. Run `npm run dev:api` and `npm run dev` in separate terminals.
2. Open Reports → Sales Report, select a month with issued sales. Click a document;
   it must open that invoice/transaction. Download CSV and compare summary amounts.
3. Open Reports → A/P Aging, select a month with issued supplier bills.
4. Record a supplier payment dated in a later month; the earlier month's aging
   should stay unchanged, while the later month's outstanding reduces.
5. Confirm empty months show an empty state and disable CSV export.

## Verification performed here

- Frontend strict TypeScript, server TypeScript and production build passed.
- Changed files passed ESLint.
- Local npm test: 95 passed, 0 failed, 2 skipped (PostgreSQL integration and
  Chromium PDF renderer prerequisites not configured for that run).
- Controlled-response Chromium checks passed at 1440/1280/1024: navigation,
  period changes, CSV downloads, empty states, error/retry, no page overflow.
- Real PostgreSQL browser tests are included in `tests/browser/sales-ap.spec.ts`;
  they have NOT been executed against your database here. Run the commands above.
