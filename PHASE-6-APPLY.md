# FinBot Phase 6 patch

Extract this changed-files-only archive into the FinBot project root and allow
the listed existing files to be replaced.

## Implemented

- Figma Login screen with the supplied permanent background asset
- session-only mock login, protected app routes and sign out
- categorized Global Search for parties, invoices, transactions and payments
- Figma system-state component and updated route errors
- browser coverage at 1440, 1280 and 1024 widths

## Verify

```bat
npm run build
npm run test:browser
```

The full Playwright suite now contains 45 tests: the previous 36 plus three new
Phase 6 scenarios across all three desktop projects.

Real authentication, Google OAuth, password reset and backend sessions remain
deferred as required.
