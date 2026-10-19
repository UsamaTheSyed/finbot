# Record Sales wiring — baseline e27941b

Only two existing UI files change. No new screen, styles, dependency, database migration or calculation logic.

## Behavior
- Dashboard + Sale opens the existing customer invoice form.
- Customer detail Record Sale opens the same form with that customer selected.
- Create Invoice posts the sale using the existing service. Save Draft retains existing unposted behavior.
- Existing finance mutations invalidate invoices, transactions, party balances and dashboard reports.
- Supplier Record Sale does not create a customer sale; it explains that Create Bill records a supplier purchase.
- Dashboard Purchase, statements, and reports remain outside this patch.

Existing architecture and visual components are preserved. No Figma-defined screen was added or visually changed, so this patch does not claim a new Figma visual audit.

## Apply
1. Stop frontend/API terminals.
2. Merge the ZIP contents into D:\Usama\finbot-source\finbot. Replace matching files only; do not delete folders.
3. Run separately:

```cmd
npm run build
```

```cmd
docker compose up -d db
```

With manually started frontend/API stopped:

```cmd
npx playwright test tests/browser/record-sales.spec.ts --workers=1
```

The existing browser fixture resets the dedicated test database. Keep TEST_DATABASE_URL pointed at your test database, never live business data.

## Manual check
Start API and frontend as usual. Dashboard > + Sale should open New Invoice. Select a customer, enter two units at PKR 500, then Create Invoice. Check the invoice total PKR 1,000, Sale transaction, party balance and dashboard data. Repeat the entry step from that customer's Record Sale button: the customer must already be selected. Saving a draft must remain unposted.

## Verification
Production build and ESLint passed. Existing finance and route-render tests passed. Actual browser navigation from both entry points passed at 1440, 1280 and 1024 using controlled API fixtures. Added one database-backed sale creation/regression flow per desktop width; it has not been run here because local PostgreSQL credentials are unavailable. Run the command above before committing.
