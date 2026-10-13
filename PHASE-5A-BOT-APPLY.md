# FinBot Phase 5A — changed-files patch

Baseline: `e1c9d83` (workspace-scoped invoice numbering). This archive contains only new/changed files, not the full application. It does not contain `.env`, credentials, dependencies, generated builds or a database.

Implementation is ready for local verification. **Phase completion is not yet certified:** PostgreSQL integration, browser regression and live Telegram checks could not run in the delivery environment. See `docs/phase-5a-bot-report.md` for verified results and limitations.

## 1. Apply

Close running development servers. From `D:\Usama\finbot-source\finbot`, run each command separately:

```cmd
git status --short
```

Keep any uncommitted changes safe before replacing files. Extract this patch into the existing `finbot` directory, preserving paths. Do not replace the whole folder. `docs/phase-5a-file-manifest.json` lists every changed file and its baseline/new SHA-256 hash.

No dependency was added. `package.json` only adds bot commands. Keep the existing `node_modules` and lockfile.

## 2. Database

```cmd
docker compose up -d db
```

```cmd
docker compose ps
```

Confirm the database is healthy. Preserve your existing database host/port in `.env`; do not change it back if you previously resolved a local PostgreSQL port conflict.

Optional checkpoint backup of the Docker development database:

```cmd
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-phase5a.dump
```

Run the additive bot migration:

```cmd
npm run db:migrate
```

Do **not** run `db:seed` on a populated development database: the existing seed script replaces its demo workspace ledger. The bot migration does not need reseeding.

## 3. Verify before enabling Telegram

Ensure `TEST_DATABASE_URL` points to a separate disposable database (normally `finbot_test`), not the development database. Tests reseed that database. Keep `TELEGRAM_MODE=off` while running regression tests.

```cmd
npm run build
```

```cmd
npm run lint
```

```cmd
npm run db:test:prepare
```

```cmd
npm test
```

The integration parent must run, not show SKIP. It includes 13 new bot/API subtests. Current discovery is 41 top-level tests; successful database execution adds those nested subtests.

```cmd
npm run test:browser
```

Expected discovery: 48 browser cases (existing 45 plus 3 Telegram Settings UI cases). The Settings tests use fake bot responses and do not send Telegram messages.

If a check fails, retain the full error and test context. Do not weaken assertions or replace database invariants to make it pass.

## 4. Configure local Telegram

In Telegram, use the official verified `@BotFather` account to create a bot. Keep the token private. Get an OpenAI API key from your own OpenAI project. Add these entries to your local `.env` only:

```dotenv
TELEGRAM_MODE=polling
TELEGRAM_BOT_TOKEN=your_actual_bot_token
TELEGRAM_BOT_USERNAME=your_bot_username_without_at_sign
OPENAI_API_KEY=your_actual_openai_key
OPENAI_MODEL=gpt-4.1-mini-2025-04-14
BOT_ACTION_TTL_MINUTES=15
TELEGRAM_WEBHOOK_SECRET=
```

Do not paste credentials into chat, screenshots or Git. The model receives the message you send plus minimal intent/date context, not your ledger history. Avoid putting secrets in bot messages.

Start three terminals in the project folder:

Terminal 1:
```cmd
npm run dev:api
```

Terminal 2:
```cmd
npm run dev
```

Terminal 3:
```cmd
npm run dev:bot
```

Open `http://127.0.0.1:5173`, log in with your existing account, and choose the intended workspace. Settings → Bot Integration → Telegram Bot → Connect → Open Telegram. Press Start in Telegram. The five-minute one-time link authorizes only that workspace. Return to Settings and click Check status.

One Telegram account is linked to one workspace at a time. Disconnect before switching the bot to another workspace. Do not run both polling and webhook delivery simultaneously.

## 5. Required local smoke test

1. Ask `Aaj ki sales kitni hain?` Compare with FinBot Daily Summary for the same workspace/date.
2. Ask `Ahmed ka balance kya hai?` Select the correct party if multiple matches appear. Compare with Party Detail.
3. Send `Ahmed ne 1000 diye`. Supply a method, absolute payment date and invoice allocation when asked. If using seeded future-dated invoices, choose a date on or after the invoice date; do not disable date validation.
4. Before Confirm, verify Payments and the invoice paid amount are unchanged.
5. Confirm. Verify the payment exists, invoice paid/balance/status changes, and party balance/report values reconcile. Reload/refocus web pages to fetch persisted data; this phase adds no live push channel.
6. Click the same Confirm button again. Verify there is still only one payment.
7. Prepare another payment, Edit the amount, verify the old button cannot execute, then Cancel the new proposal.
8. Prepare a proposal and let its TTL expire; confirm must be rejected.
9. Restart the API and bot. Verify recorded payment persists and new conversations still work.
10. Test a sale with item description, quantity, unit, rate, tax, discount, paid amount, method, invoice date and due date. Confirm and compare its invoice in FinBot.
11. Try a purchase command: expect an explicit unsupported message, not a successful mutation.
12. Disconnect in Settings or send `/unlink`. Financial queries must then require relinking. Financial records remain.

## 6. Maintenance / later deployment

`npm run bot:prune` deletes expired linking/conversation/rate metadata, seven-day receipts and ninety-day terminal action payloads. It keeps the financial ledger and audit events. Run deliberately as maintenance; no background scheduler was added.

Webhook adapter exists behind `TELEGRAM_MODE=webhook` with a mandatory random `TELEGRAM_WEBHOOK_SECRET` (32+ URL-safe characters). Endpoint: `/api/bot/telegram/webhook`. Production deployment, HTTPS hosting and Telegram `setWebhook` registration are intentionally not performed. Use polling for this local phase.

When build, lint, database tests, 48 browser cases and the live smoke test pass, commit the reviewed patch. Do not start Phase 5B yet.
