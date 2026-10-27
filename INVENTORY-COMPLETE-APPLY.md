# FinBot — Inventory expansion

Baseline: commit 822af4e (`feat: add inventory tracking and customer Telegram reminders`). Merge this changed-file patch into the existing FinBot folder; do not replace the whole project or delete existing files. No new application dependency is required. Existing React/Vite, CSS, fonts, Query, PostgreSQL and service architecture are retained.

## Included

- Products/SKUs with category and variant descriptions, reorder threshold and archive status. Each independently stocked variant is its own SKU.
- Immutable alternate purchase/sale units (e.g. 1 Bag = 25 kg); exact three-decimal base quantities.
- Multiple warehouses, per-location available/reserved quantities and confirmed transfers.
- Immediate posting remains the default. Choose Deferred on a tracked invoice/bill to receive or dispatch partially later.
- Reservations/releases against issued sales; dispatch consumes its reservation atomically.
- Physical counts/damage adjustments with reason and stale-balance protection.
- Customer and supplier returns linked to the original fulfilled stock line; quantities cannot exceed actual received/dispatched goods. Financial credit/refund remains a separate explicit operation.
- Per-warehouse moving weighted average valuation, dispatch COGS less customer returns, date/location reports, movement CSV and operation audit.
- Setup, manual adjustments, counts and initial valuations require Owner/Admin. Other operations require active workspace membership. Request IDs prevent duplicate operations; product locks protect balances.
- Low-stock threshold notifications continue to use the existing notification system.

## Apply safely (Windows Command Prompt)

Stop the app/API/bot/reminder terminals with Ctrl+C first. Open Docker Desktop. In `D:\Usama\finbot-source\finbot`, run each command separately:

```bat
docker compose up -d db
docker compose ps
```

Wait until db is healthy. Back up the development database before copying files or migrating:

```bat
docker compose exec -T db pg_dump -U finbot -d finbot -Fc > ..\finbot-before-inventory-expansion.dump
```

Check that command succeeded and the backup is non-empty:

```bat
echo %ERRORLEVEL%
dir ..\finbot-before-inventory-expansion.dump
```

Expected exit code: 0. If your DATABASE_URL uses a different database, back up that database instead. Do not continue with an empty or failed backup.

Extract this ZIP into the project root, merging `server`, `src`, and `tests` and replacing only included files. Keep `.env` unchanged.

```bat
npm run db:migrate
npm run build
npm test
```

Do not run `db:seed` against your working database: it resets demo data. The existing test setup uses TEST_DATABASE_URL; ensure it points to the separate test database, never your working database.

Targeted browser check (stop anything already listening on 5173/3001):

```bat
npx playwright test tests/browser/inventory.spec.ts tests/browser/warehouse-inventory.spec.ts --project=desktop-1440 --workers=1
```

Expected: **3 passed**. All laptop widths:

```bat
npx playwright test tests/browser/inventory.spec.ts tests/browser/warehouse-inventory.spec.ts --workers=1
```

Expected: **9 passed**. Then run the entire suite:

```bat
npm run test:browser
```

Start the app in separate terminals:

```bat
npm run dev:api
```

```bat
npm run dev
```

Open the URL printed by Vite. Inventory has Products, Warehouses, Stock Operations and Stock Reports tabs. Reminder/bot processes are not required for ordinary inventory operations.

## Manual checks

1. Add Rice SKU with stock unit kg, opening 10, value PKR 1,000 and threshold 2. Blank opening value means unknown cost, not zero cost.
2. Open the product; add alternate unit Bag with factor 10. 1 Bag now consumes/receives 10 kg. Unit conversions cannot be edited after creation.
3. Add Shop warehouse. Stock Operations → Transfer: move 3 kg from Main to Shop. Overall stock remains 10 kg; both sides carry the same cost.
4. Count Shop as 2 kg with a damage reason. Aggregate stock becomes 9 kg. Additional counted stock requires its total additional cost. Count is an absolute physical count, not a quantity delta.
5. Create supplier bill with tracked Rice and choose Deferred. Invoice/financial balance posts, physical stock does not. Receive part of the issued line in Stock Operations; the remainder stays outstanding.
6. Create Deferred customer invoice. Reserve quantity, then Dispatch. Available stock excludes reservations; dispatch consumes that sale's reservation. Release returns a reservation to availability without moving stock.
7. Select Customer return or Supplier return and the original document line. Only actually fulfilled, not-yet-returned quantities are allowed. Use the existing credit-note/refund workflow separately for financial adjustments.
8. Stock Reports → filter dates/warehouse, inspect valuation and dispatch COGS, download movement CSV. Transfer must not create COGS or a payment.
9. For migrated stock with unknown value, Owner/Admin may use Valuation with verified total opening cost and current revision. It does not rewrite past costs or create cash entries.

## Migration/history behavior and boundaries

- Migration 0007 preserves existing stock in Main warehouse, verifies quantity reconciles with movement history, and does not reset invoices/payments.
- Existing nonzero stock has unknown cost unless a verified opening valuation is recorded. Historical reports remain unknown before that valuation. No retrospective cost is invented.
- Old invoices do not receive guessed fulfilment links. Document-linked returns apply to stock lines created after this migration. For legacy stock corrections, use an explicitly reasoned physical count; do not fabricate a new receipt.
- Stock dates cannot precede the latest movement for the product (across warehouses), preventing silent retroactive costing changes.
- Stock COGS is a dedicated inventory report. This patch does not replace the existing financial P&L or add general-ledger journals.
- Purchase stock value is net allocated discount, excluding tax; no freight/landed-cost allocation is included.
- Transfers complete immediately, not via an in-transit approval process. Tracked issued documents remain protected from destructive financial editing/deletion; correct stock via linked returns and financial amounts via credit notes.
- Categories/variants are product attributes, not a configurable variant matrix. Batches, expiry, serial numbers, manufacturing/BOM and warehouse-specific permissions remain outside this phase.
- Tax Report and WhatsApp delivery remain deferred. Existing Telegram reminder behavior is unchanged.

## Verification

Build and lint were checked locally. Unit suite: 153 tests, 151 passed, 2 environment-dependent skips (native PostgreSQL integration and PDF renderer). Embedded PostgreSQL QA applied migrations 0000–0007, checked a nonempty upgrade, exercised actual Fastify stock/invoice services and repeated seed cleanup. Nine inventory browser checks passed across 1440/1280/1024 using an embedded database and controlled authenticated QA session.

The embedded database serializes QA connections. Native PostgreSQL locking/concurrency, real authentication and the full existing browser suite must also pass on your Windows test database before committing. New integration scenarios are wired into the existing backend integration test, including concurrent transfers, returns, reservations, valuation and idempotency. No QA-only dependency or harness is included in this patch.

After verification:

```bat
git status --short
git add server src tests INVENTORY-COMPLETE-APPLY.md inventory-complete-manifest.json
git diff --cached --stat
git commit -m "feat: expand inventory with warehouses, fulfilment and stock valuation"
```

Keep the backup. If migration fails, retain the exact error and stop; do not delete volumes, reset the database, or manually modify the migration journal.
