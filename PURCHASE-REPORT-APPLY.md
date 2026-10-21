# Purchase Report — incremental patch

Baseline: `ee6cf04` (Sales Report + historical supplier payable aging).
Extract the ZIP contents into `D:\Usama\finbot-source\finbot` and replace the
matching files. Keep all other project files. No npm install, schema migration,
environment changes or new CSS are needed.

## Implemented

- Reports card and navigation tab open `/reports/purchases`.
- Existing Sales Report layout/components are reused with Supplier/Purchase labels.
- Reporting month filters posted Purchase transactions by transaction date.
- Draft bills, sales and supplier cash payments are excluded from purchase totals.
- Summary shows subtotal, discounts, tax and total including tax, calculated in
  integer paisa. One posted transaction is counted once regardless of payments/items.
- Document links use stable internal bill IDs, or transaction references for legacy
  purchases without linked bills. Visible document numbers remain human-readable.
- CSV exports the selected period with Supplier column and spreadsheet-safe strings.
- Browser print uses the existing control. Report PDF remains explicitly deferred
  through the existing message; invoice and statement PDF behavior is unchanged.
- Existing workspace authorization and finance query invalidation are preserved.
- This is a posted purchase report, not inventory valuation or cost-of-goods-sold.
- The prior phase-two statement row-count test fix is preserved and not overwritten.

## Verification here

- Frontend/server TypeScript and production build passed.
- Changed code passed ESLint.
- Full local unit/API-boundary suite: 99 passed, zero failed, 2 skipped
  (PostgreSQL integration and the separately configured PDF-renderer test).
- Controlled-response Chromium checks at 1440, 1280 and 1024 passed: overview link,
  month filter, bill link, CSV filename, empty/error/retry behavior, no page overflow.
- New real-database browser test is included, not executed against your PostgreSQL
  instance here. It creates an issued supplier bill and draft, verifies the report
  and CSV, records a payment, and confirms purchase totals do not change.

## Apply and test — run each command separately in CMD

Stop frontend/API processes before browser tests to avoid port conflicts.
Keep Docker Desktop running. The existing test fixture resets the TEST database;
keep the project's test/development database separation.

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
npx playwright test tests/browser/purchase-report.spec.ts --project=desktop-1440 --workers=1
```
Expected: 1 passed. Then all widths:

```bat
npx playwright test tests/browser/purchase-report.spec.ts --workers=1
```
Expected: 3 passed. Finally run the full suite:

```bat
npm run test:browser
```
If the previous suite contained 66 tests, it now contains 69.

## Manual use

Start `npm run dev:api` and `npm run dev` in separate terminals. Open Reports →
Purchase Report. Select a month containing issued supplier bills. Verify the
summary against the bill amounts, open a bill via its document link and export CSV.
A settled bill still belongs in purchases: payment affects cash and payables,
not the original purchase amount.
