# Trial Balance — baseline 657795f

## Apply
1. Stop frontend/API terminals with Ctrl+C.
2. Extract this ZIP into D:\Usama\finbot-source\finbot, merging folders and replacing included files.
3. No npm install, migration, seed, or database reset is needed. Keep your .env and date overrides unchanged.
4. Run:

```cmd
npm run build
node --import tsx --test tests/accounting.test.ts tests/trial-balance.test.ts
docker compose up -d db
npx playwright test tests/browser/trial-balance.spec.ts --workers=1
```

Expected targeted domain result: 9 passed. Expected browser result: 3 passed (one per desktop width). Playwright uses the existing TEST database reset fixture; ensure TEST_DATABASE_URL points to your dedicated test database.

Then run npm test and npm run test:browser before committing.

## Manual verification
Start API and frontend in separate terminals using npm run dev:api and npm run dev.
Open Reports > Trial Balance, or Settings > Accounting & General Ledger > Open Trial Balance.
Choose the accounting activation date or a later date (your demo cutover was 2026-12-28).
Compare every account with General Ledger closing balances for the same cutoff. Positive balances go to Debit; negative balances go to Credit.
TOTAL debit and credit must match for balanced journals. A mismatch remains visible; no balancing plug is inserted.
Export CSV and check the date, account balances and totals.
Choose a date before activation: report/export must be unavailable rather than display a fake zero balance.

## Implementation
- Existing authenticated, workspace-scoped accounting API and query invalidation reused; no new data source.
- Net cumulative account balances including verified opening, through selected date.
- Zero accounts retained; no automatic year-end closing. Pending supplier-credit valuation warnings preserved.
- Existing fonts, CSS, components and report navigation reused. Figma report table reference 655:2216 inspected; no dedicated Trial Balance frame was identified in available screen map.
- Trial Balance is arithmetic verification, not proof that transactions/classification are complete.
- No Tax Report, WhatsApp, PDF export or database changes.

## Verification in this environment
Build and targeted domain/access tests passed. Chromium UI checks passed at 1440/1280/1024 with controlled API responses (table, CSV, cutoff guard, overflow and no page errors).
Real PostgreSQL end-to-end test is included for local execution; it was not run against your database here.

## Files
- src/domain/trialBalance.ts
- src/utils/trialBalanceExport.ts
- src/app/router/routes.tsx
- src/components/navigation/Header.tsx
- src/features/accounting/TrialBalancePage.tsx
- src/features/accounting/AccountingPage.tsx
- src/features/reports/ReportControls.tsx
- src/features/reports/reportCatalog.ts
- tests/trial-balance.test.ts
- tests/browser/trial-balance.spec.ts
- TRIAL-BALANCE-APPLY.md
