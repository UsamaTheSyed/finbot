# Financial history and action fixes

Baseline: `bc30b35` (credit notes/refunds, including the invoice-list revision fix).
This ZIP contains only changed/new files. Preserve the folder paths and replace these files in the existing FinBot folder. No database migration or dependency installation is needed.

## Fixed

1. Paid transaction deletion now returns 409 for manual payment history as well as existing FIFO/credit/correction guards. The route no longer deletes payments or their allocations. Unpaid, unprotected transactions can still be deleted with confirmation.
2. Party updates lock the party row inside a database transaction before checking linked records and changing type. Financial posting uses that same row lock. A type change waiting behind a financial writer rechecks the committed records before updating.
3. Invoice detail disables Correct Document for both credit-note source invoices and invoices receiving applied credit. The reason is visible. Direct correction URLs show the reason instead of the edit form. Backend checks remain authoritative.
4. Locked edit/delete/correction errors no longer recommend an unavailable correction action.
5. Supplier detail no longer shows Record Sale. Create Bill remains available; customer sale actions remain.
6. Invoice Print and Send Reminder are disabled and labelled coming later. Invoice-list reminder action is also disabled. This patch does not implement printing or reminder delivery; existing PDF download still works.

## Validate on Windows

Stop manually running API/Vite/bot terminals before browser tests. Keep Docker Desktop and PostgreSQL running:

```bat
docker compose up -d db
npm run build
node --import tsx --test tests/financial-safety.test.ts
node --import tsx --test tests/backend-integration.test.ts
npm test
npx playwright test tests/browser/credits.spec.ts --project=desktop-1440 --workers=1
npx playwright test tests/browser/finbot.spec.ts --project=desktop-1440 --workers=1 --grep "edit, validate payment"
npm run test:browser
```

Run commands separately and stop on a failure. The focused financial-safety test has 7 cases. Credits has 3 cases on desktop-1440; the targeted transaction case has 1. Its name now says protect paid history instead of confirm deletion because paid deletion is deliberately prohibited.

Use the existing separate TEST_DATABASE_URL. Integration/browser fixtures seed/reset test data; do not point them at your development database. No development seeding is required.

Manual checks: paid transaction deletion must preserve its payment and cash; Supplier has Create Bill but no Record Sale; credit-note source and credit-application target both block correction, including a direct /correct URL; Print/Reminder show their deferred state and cannot trigger success messages.

## Verification here

- Production build and changed-file ESLint passed.
- Full local suite: 128 passed, 0 failed, 2 skipped (PostgreSQL integration and optional PDF renderer).
- Six controlled-response UI flows verified customer/supplier credit locks, direct correction route guard, deferred actions and supplier action visibility at 1440/1280/1024.
- Added live PostgreSQL tests verify paid deletion preserves records and party editing blocks behind a financial writer, then rejects a type change after invoice creation commits. PostgreSQL is not available here, so these live tests must be run locally; they are not claimed as passed.

No financial data is deleted or rewritten by applying this patch. Existing manually paid transactions that were already deleted before the fix cannot be reconstructed by it.
