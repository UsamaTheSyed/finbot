# Supplier bills — targeted desktop patch

Apply to the current FinBot project AFTER the FIFO allocation and bot recovery patches.

## Apply
1. Stop the website dev server (Ctrl+C). Keep a Git checkpoint of your current work.
2. Extract this ZIP into D:\Usama\finbot-source\finbot, merging src/ and tests/ and replacing ONLY included files. Do not replace the entire project folder.
3. No new dependencies, database reset, migration, seed, or bot prompt changes are needed.
4. Run each command separately:

```cmd
npm run build
```
```cmd
node --import tsx --test tests/supplier-bills.test.ts tests/finance.test.ts
```
```cmd
npx playwright test tests/browser/supplier-bills.spec.ts --project=desktop-1440 --workers=1
```

The browser fixture uses your EXISTING test database reset/login workflow. Keep its configured test database separate from development data. The test creates a dedicated supplier, previews and creates a bill, checks Purchase and Sent behavior, filters bills, then saves and issues a supplier draft. This patch does not change Playwright configuration.

## Use
- Invoices/Bills -> New Bill; select a supplier, enter items, dates and payment values -> Preview / Create Bill / Save Draft.
- Or Parties -> supplier detail -> Create Bill (supplier preselected).
- Existing /invoices/new?kind=Supplier route uses the same form and CSS as customer invoices.
- Document type filter separates supplier bills from customer invoices. Supplier filter metrics show payables; All retains customer receivables metrics with explicit customer captions.
- Supplier bill details use Bill Details / Supplier labels. Record Payment defaults to Sent.
- Existing invoice IDs, INV display numbering, API and shared query invalidation stay intact.
- Backend FIFO already applies available supplier advance when a bill is issued, not when merely saved as draft. No new payment is created by applying existing advance.
- Bill payment history shows the amount allocated to that bill when one payment spans several bills.

## Verification here
- Frontend/server build and lint passed.
- Finance/service tests: 10 passed, including supplier draft/issue/initial payment/full settlement.
- Existing route rendering and invoice numbering tests: see delivery summary.
- New browser test TypeScript checked. PostgreSQL is unavailable in this environment, so the database browser test has NOT been executed here; run it on your existing local test setup.

## Live FIFO check
Use a dedicated test supplier. Create unpaid bills for PKR 30,000 dated 2026-10-10 and PKR 50,000 dated 2026-10-12 (due dates on/after those dates). In Telegram propose a PKR 100,000 Sent payment for this supplier dated 2026-10-14, select Oldest first + carry forward advance. Preview must allocate 30,000 then 50,000 and leave 20,000 advance. Only confirm when intentionally writing to your test supplier. Refresh the app and verify both bills paid and a single 100,000 payment. Create/issue a later 15,000 bill; it should be paid from the advance, leaving 5,000 advance and no second cash payment.

Telegram purchase creation remains deferred. This patch adds desktop supplier bill creation only.
