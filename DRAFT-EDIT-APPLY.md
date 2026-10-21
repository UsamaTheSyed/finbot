# Draft invoice / supplier bill editing

Base: 4917b69 — supplier purchase report. This ZIP contains changed/new files only.
Copy its contents into your existing finbot project root, preserving src/, server/ and tests/ paths, and replace the matching files. No dependency installation or database migration is needed.

## Implemented

- Open a draft invoice or supplier bill → More Actions → Edit Draft.
- Reuses the existing create form, item editor, preview, calculations and CSS.
- Edit the party within the same customer/supplier kind, dates, reference, items, discount, notes and terms.
- Save Changes retains the internal ID and invoice number. The document remains Draft, with no ledger transaction, payment or advance allocation.
- Preview shows the existing invoice number and new totals. Cancel leaves persisted data unchanged.
- Another tab's save rejects the stale revision. Your typed values remain visible; Cancel returns to the refreshed details. Reopen Edit Draft to work from current values.
- Issued documents cannot be edited through this form/API. Existing Issue Draft and payment flows remain available.
- The new UI sends the draft revision when issuing too, preventing an old detail page from overwriting newer edits.

## Apply and test (Windows CMD)

Stop dev frontend/API processes with Ctrl+C in their own terminals before browser tests. Do not run integration tests and browser tests concurrently: both use seeded test data.

Run each command separately from D:\Usama\finbot-source\finbot:

```cmd
docker compose up -d db
```

```cmd
npm run build
```

```cmd
npm test
```

```cmd
npx playwright test tests/browser/draft-edit.spec.ts --project=desktop-1440 --workers=1
```

Expected targeted browser result: **3 passed**.

Then run the regression suite:

```cmd
npm run test:browser
```

If PostgreSQL connection is refused, verify `docker compose ps` is healthy and TEST_DATABASE_URL uses the published Docker port. Do not seed your development database to fix a test connection issue.

## Manual verification

1. Create a customer invoice using Save Draft. Record its invoice number.
2. Open More Actions → Edit Draft. Change an item rate, add an item, adjust discount and notes.
3. Preview: verify number and total. Save Changes: same number, still Draft, Record Payment disabled, no party ledger/payment entry.
4. Reopen edit, change a value, Cancel: saved value stays unchanged.
5. Repeat for a supplier bill.
6. Open the same draft in two tabs. Save tab A, then save tab B: tab B must show a conflict and retain its typed values. Cancel and reopen to load tab A's save.
7. Issue the saved draft: correct updated total is posted once as Sale/Purchase. Edit Draft is disabled; direct /invoices/:id/edit shows the issued-document notice.

## Validation performed here

- Client and server TypeScript checks and production build passed.
- Local Node suite: 102 passed, 0 failed, 2 skipped (PostgreSQL integration and PDF browser runtime).
- Controlled-response Chromium checks passed for customer and supplier editing at 1440, 1280 and 1024: edit entry, populated fields, preview, saved totals, stale conflict, Cancel, issued guard and page width.
- Changed files lint passed.
- Real PostgreSQL integration and full database-backed browser tests require your local Docker setup; they were not run here. The integration suite now includes two draft-edit subtests covering concurrency, identity, scopes, invalid input, no premature posting and issuance.

## Implementation boundary

Draft saves update the invoice in place and replace its lines in one database transaction. PostgreSQL xmin is used as an opaque optimistic-concurrency token, so no schema migration is introduced. Existing legacy PATCH callers remain compatible; the new dedicated draft endpoint requires a revision. Issuance retains the existing implementation. No issued/paid financial editing, new styles, PDF changes, report changes or Telegram edits are included.
