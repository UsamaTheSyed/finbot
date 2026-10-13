# FinBot FIFO allocation patch

Based on the uploaded finbot-current.zip. Copy only the files in this patch into your existing project, preserving their relative paths. No dependencies or CSS architecture changed.

## Implemented behavior

- Telegram payment allocation includes **Oldest first + carry forward advance**.
- Customers: Received payments settle Sale transactions. Suppliers: Sent payments settle Purchase transactions.
- Allocation order: transaction/invoice date, creation timestamp, immutable ID. Already applied allocations are not retrospectively moved when a backdated invoice is added.
- Each receipt/payment is recorded once. Allocations are separate; applying advance does not create another cash movement.
- Remaining FIFO credit automatically applies when an invoice/bill is issued through the shared invoice service. Drafts do not consume credit.
- Original payment date remains unchanged. Allocation effective date is the later of payment date and document date.
- Bot confirmation shows allocations and remaining advance. If the proposed allocation changes before confirmation, execution is rejected and a fresh confirmation is required.
- Explicit single-invoice payments still reject overpayments. Existing manual on-account payments are NOT silently converted into automatic FIFO credit.
- Payments > View shows the full allocation breakdown and remaining advance using existing components.
- Transaction totals, invoice totals, party balances and dashboard settlement totals account for split payments. Cash reports count each receipt once. A/R aging excludes settlement dates after the report cutoff.
- Transactions with FIFO allocations cannot be deleted through the old destructive deletion flow. The API returns a clear conflict instead of deleting shared receipts. Allocation reversal is not included in this patch.

## Supplier support boundary

The shared invoice creation API/service now accepts Supplier parties and creates Purchase bills, with Sent initial payments and automatic advance consumption. The existing desktop Create Invoice form remains customer-only, and the bot's separate Record Purchase intent remains deferred. This patch adds no new supplier-bill screen. Existing supplier purchase records can receive FIFO allocations immediately.

## Apply on Windows CMD

1. Stop API, bot and Vite terminals using Ctrl+C.
2. Start Docker Desktop. From your project directory:

```cmd
docker compose up -d db
```

3. Back up the development database (use a fresh filename if this backup already exists):

```cmd
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-fifo.dump
```

Check that the command succeeded and the dump is non-empty before proceeding. Use your configured development database name if it differs from finbot.

4. Copy the patch's server/, src/ and tests/ contents into the project. Merge folders; replace only included files. Do not delete the existing directories. Your .env is not in this patch.
5. Run each command separately:

```cmd
npm run db:migrate
```

```cmd
npm run build
```

```cmd
npm run lint
```

6. Ensure TEST_DATABASE_URL points to your disposable test database, not the development database. The existing integration/browser setup reseeds test data.

```cmd
npm run db:test:prepare
```

```cmd
npm test
```

```cmd
npm run test:browser
```

Do not run db:seed against your live working data to apply this patch. Migration 0003 adds allocation structures and fills missing invoice allocation mirrors for historical transaction-linked payments; it does not reset the database or change cash amounts.

7. After verification, start the usual three terminals:

```cmd
npm run dev:api
```

```cmd
npm run dev
```

```cmd
npm run dev:bot
```

## Live Telegram verification

Use a dedicated test party so existing invoices do not change the expected allocation.

- Customer with issued invoices 40,000 dated 10-Oct and 30,000 dated 20-Oct: record Received 50,000, choose FIFO, review and Confirm. Expect 40,000 + 10,000 allocated, second invoice balance 20,000.
- Customer with only a 40,000 invoice: Received 50,000 leaves 10,000 advance. Create an unpaid later 7,000 invoice: expect it Paid and advance 3,000; original payment count stays one.
- Supplier with an 80,000 bill: Sent 100,000 leaves 20,000 advance. A later issued 30,000 supplier bill consumes 20,000 and remains Partial with 10,000 due.
- Click the same confirmation again: no second payment should be created.
- Verify Payments > View, Party Detail, invoices and dashboard after refreshing the web app. This patch does not add cross-process push updates.

New API FIFO input is the existing payment payload plus `allocationMode: "fifo"` and `invoiceId: ""`. Supplying FIFO with a specific invoice/transaction is rejected. The web Record Payment dialog retains its existing manual mode; the new option is exposed in Telegram and the API.

## Validation and limits

New tests cover pure paisa allocation and eight PostgreSQL integration flows (customer/supplier, future credit, isolation, manual payment compatibility, changed bot preview, historical aging, concurrent payments). The existing bot ambiguity test now expects the additional FIFO button.

Local production build, lint and non-database tests are checked separately in the delivery message. PostgreSQL integration and live Telegram checks need to run on your machine; this environment has no PostgreSQL server. No new supplier UI or conversational pronoun/context fix is included.

The migration and code must be deployed together. Do not roll back only the code after creating FIFO payments: older code does not understand split allocations. Preserve the backup and use a coordinated rollback if required.
