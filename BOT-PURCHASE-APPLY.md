# Telegram supplier bills patch

Baseline: b97cba6. Merge only the included files into your existing finbot folder. Keep your .env and other files. Stop the API and bot terminals with Ctrl+C before copying.

## Behavior

- Telegram can prepare a single-item supplier purchase bill using the existing invoice service and numbering.
- Preview does not create a bill. Confirm creates it; Cancel and duplicate-confirm protection remain in place.
- Existing supplier FIFO advance applies when the bill is issued, without recording cash twice.
- Zero-paid sales and purchases no longer ask for a payment method. A positive initial payment asks for a method and records Sent for suppliers, Received for customers.
- Party type is checked again at confirmation.

No dependency installation, database migration, or database reset is required by this patch. No visual screens were changed.

## Verify locally

Run each command separately from D:\Usama\finbot-source\finbot. Start Docker Desktop first.

```cmd
docker compose up -d db
```

```cmd
npm run build
```

```cmd
npm test
```

The integration test seeds fixtures: TEST_DATABASE_URL must point to your existing dedicated test database, not your live/development ledger.

```cmd
node --import tsx --test tests/backend-integration.test.ts
```

Check that integration tests actually execute, rather than being skipped. New cases cover supplier advance, positive initial payment, duplicate confirmation, cancellation and party revalidation.

## Run

In one terminal:

```cmd
npm run dev:api
```

In a second terminal:

```cmd
npm run dev:bot
```

For the web app, use a third terminal with npm run dev.

## Manual Telegram check

Use a dedicated test workspace and an existing Supplier party, replacing the name below:

> Supplier Test se 10 kg dates khareedi hain, rate 350/kg, tax 0%, discount 0, paid 0. Bill date 2026-10-15 aur due date 2026-11-15.

Expected: total PKR 3,500, no payment-method question, and a confirmation preview. Cancel should create nothing. Repeat and Confirm only when you intend to save the test bill. With no advance the balance is PKR 3,500; existing advance reduces it through the shared allocation service. No new cash payment should appear for paid 0.

Repeat with paid 1000 and no method: the bot should request the payment method before preview. Also verify a customer sale with paid 0 skips that question.

## Verification performed

- Build: passed (frontend, server and Vite).
- Lint: passed.
- Full local test run: 57 passed, 0 failed, 1 skipped.
- New focused offline tests: 5 passed.
- Integration helper strict TypeScript check: passed.
- Database integration was skipped here because no test database was available. Live Telegram/AI checks were not run here; run the commands and manual checks above on your machine.

This extends the existing single-item bot flow; it does not add multi-item conversational entry.
