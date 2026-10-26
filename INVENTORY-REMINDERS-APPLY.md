# Inventory and Customer Telegram Reminders

Base: `913dece` — financial safety fixes. This ZIP contains only changed/new files. Merge its contents into `D:\Usama\finbot-source\finbot`; do not replace the entire project folder. No new npm dependencies or credentials are included. Existing fonts, CSS tokens, colours and shared components are preserved.

## Apply and verify (Windows CMD)

Stop the dev/API/bot/reminder processes before replacing files. Start Docker Desktop, then run each command separately from the project root:

```bat
docker compose up -d db
docker compose ps
npm run db:migrate
npm run build
npm test
npx playwright test tests/browser/inventory.spec.ts tests/browser/reminders.spec.ts --project=desktop-1440 --workers=1
npm run test:browser
```

The targeted browser command contains two tests: expected **2 passed** on desktop-1440. The full suite runs them at all three configured widths.

Keep the existing DATABASE_URL and TEST_DATABASE_URL configuration, including your Docker host port (previously 5433). Do not run `db:seed` against your populated development database: it resets demo data. Browser tests use the existing test database/reset fixture. Do not run the reminder worker against the test database.

The new migration `0006_inventory_reminders.sql` creates products, stock movements, customer recipients and reminder jobs, and adds nullable invoice product links. Existing invoices remain untracked. Do not edit already-applied migration files or drop database volumes.

## Run locally

Keep Docker running. Use separate terminals in the project directory:

```bat
npm run dev:api
```

```bat
npm run dev
```

For the existing Telegram polling configuration:

```bat
npm run dev:bot
```

New delivery worker:

```bat
npm run dev:reminders
```

Open http://127.0.0.1:5173. Existing Telegram settings/token/username are reused. Webhook installations use their existing webhook receiver instead of running the polling bot. Never run polling and a webhook receiver for the same token simultaneously.

The API queues reminders. The reminder worker actually delivers them. If the worker is stopped, status stays Queued; a toast never claims delivery. Production worker command: `npm run start:reminders` after building.

## Inventory flows

1. Inventory → Add Product: SKU, product name, stock unit, opening quantity, low-stock threshold and opening date.
2. Open product: view stock history, edit its name/threshold/active status, or review and confirm a physical adjustment/return.
3. New Invoice / New Bill: select Product on each line. Name and stock unit are populated; enter quantity and rate.
4. Save Draft: no stock movement. Issue customer invoice: stock decreases. Issue supplier bill: stock increases. Insufficient stock rolls back the whole document operation.
5. A repeated stock-adjustment request cannot count twice. Simultaneous sales lock stock rows. SKU and unit remain fixed after creation.
6. Low-stock status is shown when on-hand quantity is at or below the threshold.

Single warehouse; quantities support up to three decimals. No negative stock, automatic unit conversion, inventory valuation/COGS or multi-warehouse transfers. Stock movements cannot precede the latest stock movement for that product or be future-dated. Opening stock and manual movements affect quantities only, not accounting balances.

Old free-text invoices and Telegram-created free-text lines do not automatically acquire product links. Stock tracking requires explicit product selection in the web invoice/bill form. No guessed name matching or reconstruction of historical stock.

Credit notes/refunds remain financial operations. Record physical returns separately in Inventory, with a reason and document reference. Stock-linked issued documents cannot be rewritten/deleted; use a credit note for money and an explicit physical stock movement for goods. Drafts remain editable.

## Customer reminder setup

1. Open Reminders → Customer connections → Create Link for the intended customer. Confirm that replacing an existing connection is intended.
2. Share that private link with that customer. It expires after 30 minutes.
3. Customer opens it in Telegram and presses Start. This opts them in; it does not give business-account access.
4. Customer sees their Telegram chat ID. Verify that ID directly with them, then approve the pending connection in FinBot.
5. Select an outstanding customer invoice and a template → Preview Reminder → check the actual message → Queue Reminder.
6. The delivery worker sends it. Delivery history updates, and a workspace notification identifies the customer/invoice and outcome.
7. Customer may send `/stop` to stop reminders. You can also disconnect them in FinBot.

Invoice Details and invoice-list actions now open this flow. Drafts, paid invoices and supplier bills are not eligible for customer payment reminders.

## Delivery rules and boundaries

- Two fixed templates: polite reminder and payment follow-up. Both include invoice, due date, outstanding PKR balance and opt-out instructions.
- Manual send with explicit preview/confirmation; recurring schedules/custom template editing are not included.
- One reminder per invoice per 24 hours, except definitively failed/cancelled attempts.
- Queued and retrying reminders can be cancelled.
- Before sending, the worker checks active workspace membership, customer connection/version and current invoice balance. Changed data cancels the queued message instead of sending stale amounts.
- Telegram rate-limit rejection (429) retries after the supplied delay, up to four total attempts.
- Definitive request/access failures are Failed. Timeouts, malformed responses and ambiguous server failures are Unknown and are not blindly retried. Check with the customer before submitting a later new reminder.
- Sent means Telegram accepted the message; it does not prove the customer read it.
- Crash recovery marks abandoned Sending jobs Unknown. The system does not claim impossible exactly-once external delivery.
- Owner notification appears in the existing FinBot workspace notification feed. It is not an additional owner Telegram message.
- This implementation does not send invoice PDFs through Telegram.

## Verification performed here

- TypeScript client/server checks and production build: passed.
- ESLint: passed.
- Local unit/contract suite: 145 passed, 2 skipped. This includes one pre-existing local-only regression test; your repository's reported count may differ.
- Controlled-response Chromium checks passed at 1440, 1280 and 1024: product creation, adjustment confirmation, invoice product selection, reminder preview/queue and no page overflow.
- No real customer messages were sent.
- PostgreSQL was unavailable in the implementation environment. Actual migration execution, stock concurrency/rollback and end-to-end database flows are **not claimed verified here**. Added integration cases run through `npm test` when TEST_DATABASE_URL is configured. Run the commands above before committing.

## Manual acceptance

- Opening 10 kg → customer sale 2 kg → 8 kg. Supplier bill 3 kg → 11 kg. Draft 5 kg → still 11 kg. Sale 12 kg → rejected with unchanged stock and ledger.
- Stock adjustment/return appears once, with date, reason and actor.
- Customer invitation requires customer Start and owner verification; an owner bot connection alone is not a customer connection.
- Preview does not send. Queue while worker stopped remains Queued. Start worker → Sent and workspace notification, or an honest failure/unknown state.
- Pay the invoice or disconnect the recipient before processing → queued reminder cancelled.

After local tests pass, inspect `git diff` and commit the changed files. Do not commit `.env` or tokens.
