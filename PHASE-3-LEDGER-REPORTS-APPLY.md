# FinBot Phase 3 ledger-report correction

Extract this changed-files-only archive into the FinBot project root and allow
matching files to be replaced.

Then delete the obsolete fixture file:

```bat
del src\services\mock\financialReports.ts
```

The report UI is unchanged. Daily Summary, A/R Aging, Profit & Loss and Cash
Flow now derive from the shared session ledger and use report-period query
keys. Finance and transaction mutations invalidate those report queries.

Verify:

```bat
npm run build
npm run lint
npm test
npm run test:browser
```

Expected non-browser result: 26 tests passing. The browser suite still contains
45 tests; existing Phase 3 assertions now validate ledger-derived amounts.
