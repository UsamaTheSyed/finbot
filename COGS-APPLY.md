# FinBot — Inventory COGS and general ledger

Baseline: `8415950` — inventory, warehouses, fulfilment and valuation.
This is a changed-file patch. Keep the existing project; merge these files into its root.
No dependency or CSS framework replacement is required.

## 1. Stop development processes and back up

Close the API, Vite, Telegram poller and reminder worker with Ctrl+C in their terminals.
Run each command separately in Windows CMD from `D:\Usama\finbot-source\finbot`.

```bat
git status --short
git archive --format=zip --output=../finbot-before-cogs-source.zip HEAD
docker compose up -d db
docker compose ps
```

Wait for `db` to be healthy. Back up your DEVELOPMENT database (the database you actually use in the app):

```bat
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-cogs.dump
```

If your development database name is different, use that name. A failed dump can leave an empty file; check that the command succeeds before proceeding. Do not delete the Docker volume or run the development seed against business data.

## 2. Apply the files and migrate

Extract this ZIP into the project root, merging `server`, `src` and `tests`. Keep `.env` and your existing dependencies.
The patch adds migration `0008_accounting_cutover.sql` and its Drizzle metadata. Migrations 0000–0007 must already exist.

```bat
npm run db:migrate
npm run build
npm run lint
```

Migration creates the accounting tables and posting functions. It does **not** activate accounting or rewrite historical documents. Before activation, existing workflows continue using their existing report basis.

## 3. Test against the TEST database

`TEST_DATABASE_URL` must point to the separate test database, never the database containing your real business records. These tests seed/reset test data.

```bat
npm run db:test:prepare
npm test
npx playwright test tests/browser/accounting.spec.ts --workers=1
npm run test:browser
```

The targeted browser command runs one flow at each desktop width: expected **3 passed**.

If you get `ECONNREFUSED 127.0.0.1:5433`, first check that Docker Desktop is running and `docker compose ps` shows the database healthy with the expected port mapping.
If port 5173 or 3001 is already in use, stop the development terminal using that port before browser tests. Do not enable reuse of an unrelated running server to hide the problem.

## 4. Run the app

Keep the database running. Use two separate CMD terminals in the project folder:

```bat
npm run dev:api
```

```bat
npm run dev
```

Open the local URL printed by Vite. The Telegram poller can be started separately with `npm run dev:bot` when needed; it is not required to activate accounting.

## 5. Verify and activate accounting

1. Sign in as the workspace **Owner**.
2. Open **Settings → Accounting & General Ledger**, or **Reports → General Ledger**.
3. Select the current business date and click **Load Opening Preview**.
4. Review individual party balances and stock by warehouse.
5. Enter the verified cash, customer control, supplier control and inventory balances. They must match the preview.
6. Enter verified input/output tax control balances. Enter zero only if zero is correct.
7. Check the verification checkbox, then **Review Accounting Activation → Confirm Activation**.

Customer control: a positive balance is customer debt; a negative balance is a customer advance/credit.
Supplier control: a negative balance is money owed to suppliers; a positive balance is a supplier advance/credit.
Opening equity balances the verified opening journal. It is not reported as profit.

Activation is blocked when positive stock has unknown cost, receipts/dispatches are unfinished, future-dated financial records exist, or the preview changed while you were reviewing it. Resolve these conditions and reload the preview. Do not enter invented numbers merely to pass verification.

Activation freezes the current snapshot, including records already entered earlier that day. It is **not** a midnight backfill. In the cutover month, P&L clearly shows post-activation activity only. Months wholly before the cutover retain the legacy report.

## 6. Check the flow with a small example

Use a disposable/test workspace for this example, not real business records.

Before activation:
- Add 10 units of a tracked product with total verified stock cost PKR 10,000.
- Complete the opening verification and activation.

After activation:
- Issue and dispatch 4 units at PKR 1,500 each, without tax or discount.
- P&L should show revenue PKR 6,000, COGS PKR 4,000 and profit PKR 2,000.
- Inventory should retain PKR 6,000 of value.
- Record the customer payment. Cash and customer control change; revenue/COGS do not repeat.
- Open General Ledger to inspect balanced entries and export the selected period as CSV.

For a deferred sale, the invoice posts customer control and deferred revenue. Each dispatch recognizes its share of revenue and actual stock cost. Dispatching next month affects next month's P&L, not last month's.

## Supplier credits and physical returns

A physical supplier return removes stock and creates purchasing clearing. The supplier credit note reduces the supplier balance. These are separate operations; recording only one does not complete the other.

For a tracked supplier credit, General Ledger displays **Allocate Credit Cost**. The Owner must split the net credit between:
- cost reduction of goods still held, by product and warehouse;
- cost reduction of goods already sold (COGS);
- physically returned-goods clearing;
- untracked purchase expenses, where relevant.

The split must equal the net credit. Returned-goods clearing cannot exceed unallocated physical return cost. A negative COGS reduction is allowed for the difference when returned stock cost exceeds the supplier credit. Inventory cannot be reduced below zero. Allocation requires review and explicit confirmation; retrying cannot allocate the same credit twice.

P&L is marked provisional while supplier cost credits remain unallocated. Keep the supporting reason and documents for each allocation. There is no edit/delete screen for posted cost allocations in this patch; verify the split carefully before confirming.

## Implemented accounting policies and limits

- Reuses the existing moving weighted-average inventory values; payment FIFO is a separate feature and is unchanged.
- Tracked purchase cost goes to purchasing clearing, then Inventory on receipt. It is not expensed again as a purchase.
- Tracked sales recognize net revenue and COGS on physical dispatch. Untracked sales recognize revenue when issued. Untracked purchases remain expenses; select a product for goods that need inventory costing.
- Whole-invoice customer credit notes are allocated proportionally across original net item values, including delivered and undelivered portions. This is an invoice-level allowance policy, not item-specific return pricing. Record physical returns separately.
- Taxes are held separately in input/output tax control accounts under the existing net-of-tax stock-cost basis. Non-recoverable tax capitalization, tax filing, landed-cost allocation, NRV write-down workflows and a general-purpose manual journal editor are not added by this patch. Verify that this basis fits your business before activation; the module does not certify tax recoverability or IFRS compliance.
- Warehouse transfers move cost without creating profit or cash. Customer returns restore recorded dispatch cost. Supplier credits require the verified allocation described above.
- New postings must be on/after the cutover and the latest journal date. Future-dated invoices/payments are blocked after activation; future invoices may remain drafts. Use current-dated corrections/credits for historical mistakes.
- Journals are balanced, source-linked and immutable through the application. Posting failures roll back the underlying mutation. Cash and Inventory journal totals are checked against the payment and stock records at commit.
- Customer/Supplier controls are net control accounts including advances. The existing party ledgers and statements retain the individual detail.
- These are operational accounting integration and ledger views, not a complete statutory accounting package or a performance-certified large-volume ERP.

Accounting reference used for the matching principle and weighted-average cost terminology: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/

## Validation evidence

- Frontend typecheck, server compilation and Vite production build passed.
- ESLint passed.
- Final Node test run with Chromium enabled: 157 passed, 0 failed, 1 skipped (native PostgreSQL integration). The PDF renderer test passed in this run.
- Actual migration 0000–0008 and accounting service tests on the PostgreSQL engine embedded by PGlite: 12 passed, including credit/return allocation, rollback, exact reconciliation, duplicate protection and cross-month dispatch.
- Browser checks against those actual accounting routes/services passed at 1440, 1280 and 1024px: opening activation, dispatched COGS/P&L, journal balances, CSV download and no page overflow.
- The native PostgreSQL integration helper includes a concurrent-posting check. Native multi-connection PostgreSQL and your complete browser suite must still be run locally with the commands above. The local QA environment could not start PostgreSQL under an unprivileged OS user; PGlite results are not a concurrency-test claim.

## Commit after your checks pass

```bat
git status --short
git add server src tests COGS-APPLY.md cogs-manifest.json
git commit -m "feat: integrate inventory COGS with verified accounting cutover and general ledger"
git status --short
```
