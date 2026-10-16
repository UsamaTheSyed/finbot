# Telegram multi-item invoice and supplier bill patch

Baseline: commit 5a1e036. Copy only this ZIP's files into the existing finbot project, merging server/ and tests/. Stop API and bot processes before copying. No dependency install, migration or seed/reset is required by this patch.

## Behavior

- Up to 10 line items per Telegram customer sale or supplier purchase; the existing 2,000-character message limit remains.
- Each line has its own name, quantity, unit, rate and tax. Missing/invalid fields prompt for that numbered item only. Short answers preserve other items, including across engine restart.
- Preview shows every line's amount and tax, subtotal, total tax, invoice-wide discount, grand total and new cash payment.
- Paid 0 skips payment method. Positive paid asks for method. Existing invoice service handles Received/Sent, numbering and FIFO advance.
- Confirm is still required. Edit cancels the old confirmation. When editing item contents, provide the COMPLETE replacement list; an ambiguous partial item edit is rejected rather than dropping existing lines. Invoice-wide date/discount/paid corrections can be supplied separately.
- Single-item conversations and old persisted states remain supported. Existing web UI, financial services and database structure are unchanged.
- Oversized previews are rejected before a pending action is created; shorten item names or use the web form. No list is intentionally truncated.

## Apply and test (Windows CMD)

Open Docker Desktop. Run each command separately in D:\Usama\finbot-source\finbot:

```cmd
docker compose up -d db
```

```cmd
npm run build
```

```cmd
node --import tsx --test tests/bot-multi-item.test.ts
```

```cmd
node --import tsx --test tests/backend-integration.test.ts
```

```cmd
npm test
```

Integration tests seed fixtures. Keep TEST_DATABASE_URL pointed at the existing dedicated test database, not your business ledger. No manual reset or seed is needed. Ensure integration tests run and are not skipped.

## Run and manually verify

Start npm run dev:api and npm run dev:bot in separate terminals. Start npm run dev in another terminal to inspect saved records in the web app.

Use an existing Supplier in a test workspace. Substitute its exact name:

```text
Supplier Test se purchase bill banao:
1. Rice: 2 Bag, rate 1000 per Bag, tax 5%.
2. Oil: 1 Carton, rate 500 per Carton, tax 0%.
Discount 100 PKR, paid 0. Date 2026-10-16, due date 2026-11-16.
```

Expected preview: subtotal 2,500; tax 100; discount 100; grand total PKR 2,500. No payment method question. Nothing saved until Confirm. Cancel first if you only want to inspect the preview.

After intentional confirmation, verify both items appear in the bill and one Purchase transaction exists. Paid 0 must not create a new cash payment. Any existing advance may settle some/all of the bill; reconcile with the supplier's previous advance.

For customer sale, use a Customer and explicitly say sale instead of purchase. Repeat with paid 500 and no method: the bot must ask for a method. With no advance the resulting balance is PKR 2,000.

Omit item 2's rate in a fresh request: the bot should ask for Item 2's rate; reply 500. Try Edit: partial item correction should request the full replacement list. Send both lines with the corrected rate, check the new total, and verify the old Confirm cannot save anything.

## Verification performed here

- Frontend/server/Vite build passed.
- Lint passed.
- Full local tests: 64 passed, 0 failed, 1 skipped.
- Targeted bot tests: 31 passed (including 7 new multi-item tests).
- New tests and integration helper strict TypeScript check passed.
- Two database integration cases added (Customer and Supplier): restart recovery, full replacement edits, old confirmation rejection, duplicate confirmation, cancellation, line persistence and settlement/cash reconciliation.
- Database integration was not executed here because PostgreSQL/test credentials are unavailable. Live AI/Telegram and browser tests were not executed here. Run the local checks above before considering this patch verified in your environment.
