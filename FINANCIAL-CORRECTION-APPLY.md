# Financial correction workflow — changed files only

Baseline: ad47533, invoice/supplier bill draft editing. Merge this ZIP into the existing finbot root. Do not replace the entire project. No new dependency is required. Keep your .env file.

## Implemented

Issued invoice/bill → More Actions → Correct Document → edit items/rates/tax/discount/reference/notes/terms → reason → Review Correction → Confirm Correction.

- Same internal ID, display number, party, document date, due date and existing payments.
- Reason and today's workspace date required. Original and subsequent financial snapshots retained in Correction History; View Revision shows before/after.
- Party lock, document lock and revision check prevent concurrent stale saves and payment races. Any rejected save rolls back.
- Current balances use corrected totals; dated adjustment movements preserve original Sales/Purchase/P&L periods, statements and historical A/R–A/P aging.
- Current PDF includes correction date/reason/adjustment history. Existing PDF renderer reused.
- Allocation event history preserves dates when a later FIFO advance increment applies to the same transaction. Existing allocations are backfilled by migration, with no cash changes.
- Legacy transaction edit/delete is blocked for a corrected document so it cannot silently erase its revision history.
- Existing UI and CSS reused. Figma Create Invoice frame 782:1661 inspected; no new visual system.

## Deliberate boundaries

- New total must be at least the amount already allocated. Below-paid corrections require a future refund/credit workflow and are rejected.
- No cash, payment, party, original date or due-date changes in this form.
- Effective date is today in the workspace, not arbitrary backdating. Documents with future activity are blocked.
- Existing advances are not automatically applied on correction save. A subsequent FIFO allocation can settle the new balance using the correction date as its earliest effective date.
- Web correction only. Telegram correction editing, credit notes, refunds and accounting period closing are not included.
- Audit snapshots preserve financial values; revision rendering uses the party's current contact details. This is application revision history, not a claim of tamper-proof database storage or statutory accounting compliance.

## Apply on Windows CMD

Stop the API, frontend and bot terminals with Ctrl+C before copying changed files. Docker database should remain running.

1. From the existing project directory, start the database:

```bat
cd /d D:\Usama\finbot-source\finbot
docker compose up -d db
docker compose ps
```

2. Back up the development database before migration (run in CMD, as shown). This uses the existing `finbot` database; if your DATABASE_URL points to a different database, back up that database instead.

```bat
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-corrections.dump
```

Check that the command succeeded. Verify the archive is readable:

```bat
docker compose exec -T db pg_restore -l < ..\finbot-before-corrections.dump
```

3. Extract/merge the patch into the project root, replacing only included files. Ensure the new migration is `server\db\migrations\0004_invoice_corrections.sql`, alongside existing 0000–0003 migrations. Do not run this journal over an independently created 0004 migration; that would need a migration merge.

4. Run one command at a time:

```bat
npm run db:migrate
```

```bat
npm run build
```

```bat
node --import tsx --test tests/backend-integration.test.ts
```

```bat
npm test
```

The integration test uses TEST_DATABASE_URL and resets its demo fixture. Keep TEST_DATABASE_URL pointed at your separate test database, never your real working database. No development `db:seed` command is needed.

5. With manual frontend/API/bot terminals stopped, run the targeted browser tests:

```bat
npx playwright test tests/browser/corrections.spec.ts --project=desktop-1440 --workers=1
```

Expected: 3 passed. Then all widths:

```bat
npx playwright test tests/browser/corrections.spec.ts --workers=1
```

Expected: 9 passed. Finally:

```bat
npm run test:browser
```

The baseline had 78 browser tests; this patch adds 9, so expect 87 if your local suite has no additional tests. Keep existing assertion timeouts; do not hide failures by increasing them globally.

## Run the application

After tests finish, open separate CMD terminals in the project folder:

```bat
npm run dev:api
```

```bat
npm run dev
```

Open http://127.0.0.1:5173. Telegram is optional for this feature; start `npm run dev:bot` in a third terminal only if needed.

## Manual verification example

Use a test customer invoice or supplier bill of PKR 1,000 with PKR 200 paid.

1. More Actions → Correct Document.
2. Change rate so total becomes PKR 1,500. Enter a reason.
3. Review: Before 1,000; After 1,500; Adjustment +500; Paid 200; Balance 1,300.
4. Cancel: original values remain.
5. Review again and confirm: same document number, paid remains 200, new balance 1,300.
6. View Revision: original and corrected items/totals visible.
7. Download PDF: correction notice/history visible.
8. Attempt total PKR 100: blocked because PKR 200 is already allocated.
9. Open the correction in two tabs: save one, then try the other. Second save must reject as stale.
10. Repeat for supplier bill; it remains a Purchase and payments remain Sent.

## Verification performed here

- Client/server TypeScript and Vite production build passed.
- Changed TypeScript files passed ESLint.
- Unit/access/render suite: 108 passed, 0 failed, 2 skipped (PostgreSQL integration and optional PDF runtime test).
- Controlled-response browser verification passed six cases: customer and supplier at 1440/1280/1024, checking preview, below-paid validation, cancel, confirm, revision history, stale conflict and no horizontal page overflow.
- Added real PostgreSQL integration coverage for customer/supplier corrections, concurrent saves, unchanged cash/allocations, historical periods, FIFO event dates and negative correction movements.
- PostgreSQL/Docker were unavailable in this execution environment. Real database migration/integration and full API-backed browser suite must run on your machine before committing. Controlled-response browser checks do not replace those tests.
