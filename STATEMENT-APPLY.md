# Customer / Party Statement and PDF — baseline 6c122d8

This patch contains only changed/new files. No dependency, schema migration, seed, or database reset is required to run the feature. Existing invoice PDF installation is reused.

## Apply
Stop the API/frontend terminals. Extract this ZIP to a temporary folder, then merge its contents into `D:\Usama\finbot-source\finbot`, replacing matching files. Do not delete existing directories.

Run each command separately:

```cmd
npm run build
```

```cmd
docker compose up -d db
```

```cmd
npm test
```

With manually started API/frontend processes stopped:

```cmd
npx playwright test tests/browser/statements.spec.ts --workers=1
```

Expected new browser suite: 3 passed (one flow at each desktop width). The existing browser fixture resets its configured test database. Ensure TEST_DATABASE_URL points to the dedicated test database, never live business data.

Then run the complete browser suite:

```cmd
npm run test:browser
```

If Chromium is missing, use the existing `npm run pdf:install` command under the account that runs the API.

## Use
1. Reports > Customer Statement now opens the existing Parties page on Customers.
2. Open a customer; its Statement tab is selected and the report month is carried into the date range.
3. Alternatively open any party directly, then choose Statement.
4. Set Statement start/end dates; blank bounds are open-ended. All dates removes both bounds.
5. Use the existing Download Statement button in the party header. It exports the currently selected statement range. From a direct party page without a selected range it exports all recorded dates.
6. Invalid/reversed dates show validation and disable the download. A PDF failure shows an error and allows retry.

## Financial behavior
- Integer paisa arithmetic is shared by the statement API and existing mock statement adapter. JSON and PDF use the same snapshot loader/calculation.
- Opening balance includes all recorded movements strictly before the start date. Both date bounds are inclusive for visible movements.
- Closing balance = opening + increases - decreases, including empty periods.
- Sale increases balance; Purchase decreases it. Completed Received payments decrease balance; completed Sent payments increase it. Refunds follow their actual direction.
- Positive balance means the party owes the business. Negative means the business owes the party. For suppliers, an unpaid bill therefore has a negative balance; supplier advance has a positive balance.
- FIFO advances count once on their payment date. Applying an advance to a later invoice does not create another statement movement.
- Drafts have no posted transactions, so they do not affect the statement. Future-dated entries are excluded when beyond the end date.
- Existing invoice display numbers are used when available; links retain internal IDs. Payments show their entered reference, falling back to display/internal ID.
- Equal-day rows sort by stable entry ID; running balances within that day are deterministic, not an assertion about intraday posting time.
- Statements reflect the currently recorded ledger using business dates, not historical database snapshots before later edits/deletions. No opening balance outside recorded history is fabricated.

## Architecture and visual scope
No new screen, styling framework, Zustand store or duplicated ledger is introduced. Existing Party Statement table, date controls, cards, report links, query invalidation and authenticated PDF renderer are reused. Reads are scoped to workspace/party and use a read-only repeatable-read database transaction; downloads do not mutate financial data.

Figma Party Detail frame 782:1159 in file 3jjUDQgHWXPqD3L6yy6thh was inspected with its screenshot. It confirms Statement tab and Download Statement placement. It shows the Overview state, not a separate detailed Statement state. The existing repository Statement table was preserved and extended with existing form controls; exact Figma matching for a dedicated statement-detail layout is not claimed. Existing shell/avatar/icon differences were left untouched. PDF uses the established invoice print tokens and A4 pagination.

Sales/A-P/Trial Balance/Tax reports and reminders remain separate work.

## Verification performed
- Frontend/server production build and ESLint passed.
- Full local suite: 91 passed, 0 failed, 1 skipped (PostgreSQL integration: no local TEST_DATABASE_URL).
- Covered advance/opening balance, inclusive ranges, supplier signs, refunds, empty periods, invalid dates, exact paisa, HTML escaping, authorization before data access, scoped snapshot reads and rollback cleanup.
- Real Chromium browser checks with controlled API fixtures passed at 1440/1280/1024: report entry, customer selection, date validation, carried balance, download, error retry, no page overflow.
- Actual one-page statement and 100-entry/four-page PDF rendered and visually inspected, including repeated headers and page numbering.
- Added database-backed browser test for real FIFO payment and invoice writes, carried balances and PDF download. It still needs your local execution; controlled-response browser checks do not substitute for it.

After local validation, review `git status --short` before committing.
