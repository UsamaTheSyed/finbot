# Credit Notes and Refunds — integrated patch

Baseline: commit `1e62147` (financial corrections). This changed-files patch includes the earlier credit/refund foundation; do not apply that older ZIP separately. No new dependency is required.

## Apply on Windows CMD

Stop API, Vite and bot terminals using Ctrl+C. Keep Docker Desktop running. From `D:\Usama\finbot-source\finbot`:

```bat
docker compose up -d db
docker compose ps
```

Wait for `db` to be healthy, then back up the existing development database:

```bat
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-credit-refunds.dump
docker compose exec -T db pg_restore --list < ..\finbot-before-credit-refunds.dump
```

The second command must list archive contents without error. Keep the backup. Do not delete Docker volumes or reset development data.

Extract this ZIP into the existing `finbot` folder, preserving paths and replacing included files only. It does not include `.env`, dependencies or the whole project. Run each command separately; stop on an error:

```bat
npm run db:migrate
npm run build
node --import tsx --test tests/backend-integration.test.ts
npm test
npx playwright test tests/browser/credits.spec.ts --project=desktop-1440 --workers=1
```

Expected targeted browser result: **3 passed**. Backend integration includes customer/supplier credit conservation, historical balances, duplicate requests and simultaneous refunds.

Use the existing separate `TEST_DATABASE_URL`; never point tests at the development database. Browser fixtures reset test data. Do not run `db:seed` on development data for this patch.

Then verify all widths and regression tests:

```bat
npx playwright test tests/browser/credits.spec.ts --workers=1
npm run test:browser
```

The new file contributes **9 tests** across three widths. Stop manually running API/Vite processes before Playwright, which starts its own servers on 3001/5173. Connection refused on 5433 usually means Docker/database is stopped; check `docker compose ps` first.

## Run and check

After tests, start `npm run dev:api` and `npm run dev` in separate terminals. Open http://127.0.0.1:5173.

1. Open an issued customer invoice or supplier bill → More Actions → Record Credit Note.
2. Enter credited subtotal, tax and discount separately, plus a reason. Review the debt reduction, funded credit and net total; Confirm. Date is today's workspace date.
3. Open the party detail page → Credits and Refunds.
4. Record Refund records an actual refund sent to a customer or received from a supplier. It does not initiate a bank transfer.
5. Apply Credit selects another outstanding document for the same party and settles it without another cash payment.

Example: document PKR 1,000, already paid PKR 800, zero tax/discount. Credit PKR 500 clears the PKR 200 unpaid debt and creates PKR 300 available credit. Refund PKR 100, leaving PKR 200. Apply PKR 200 to a new PKR 500 document: its balance becomes PKR 300. Both customer and supplier flows use this rule.

Check Cancel creates nothing; an excessive refund is rejected; fully used credit cannot be reused. A credit on an entirely unpaid invoice reduces debt but creates no refundable money.

## Behavior and scope

- Migration `0005_credit_notes.sql` adds credit notes, credit uses and idempotent requests, and extends the shared dated ledger views.
- Original invoice/transaction amounts and payment allocations are retained. Summaries show credits, net amount, current allocation and balance.
- Credit reduces unpaid debt first. Only the portion backed by previous settlements becomes refundable/applicable credit.
- Refund creates one payment; credit application creates none. Existing FIFO advances remain separate and are not counted twice.
- Party/dashboard balances, sales/purchase reports, aging, statements and invoice PDFs consume the shared ledger. PDFs retain original payment history and add credit/refund history.
- Party locks, revision checks, request IDs, component limits and transaction rollback protect repeated/concurrent posting.
- Financial corrections and legacy transaction edit/delete reject documents with credit history. Other documents retain their existing correction workflow.
- Record Payment remains for customer receipts/supplier payments. Opposite-direction refunds use Record Refund and require funded credit.

Existing dialogs, confirmation, cards, tables and CSS are reused as authorized. The inspected existing Figma Invoice Detail frame is `782:1473`; no dedicated credit/refund frame was available. No styling/library migration was made.

New credit applications are explicit, not automatic FIFO. Posting uses today's workspace date. Credited tax and discount are explicit and bounded by the remaining source components.

Web workflow only: Telegram credit/refund commands, reversal of posted credits/refunds, dedicated statutory credit-note PDF numbering and payment-provider transfers are not included. Practice with test data because confirmed postings have no delete button.

## Verification

- Client/server typechecks and production build passed.
- ESLint passed for changed TypeScript/TSX files.
- Full local tests: 120 passed, 0 failed, 2 skipped (PostgreSQL integration and optional PDF renderer). The renderer then passed separately using the available Chromium executable.
- Actual UI with controlled API responses: customer and supplier review/cancel/confirm, refund validation, application, history and no horizontal overflow at 1440/1280/1024; six flows passed.
- PDF HTML test verifies original totals/history, credit summary and escaped reasons.
- PostgreSQL is unavailable here. Live migration and database integration/concurrency tests are included but must be run locally. Controlled-response UI checks do not replace live-database tests.
