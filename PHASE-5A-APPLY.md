# FinBot Phase 5A patch

This archive contains only the verified Figma Empty States implementation.
Extract it into the project root and replace the listed existing files.

## Existing files to replace

- `src/components/feedback/States.tsx`
- `src/styles/global.css`
- `src/features/search/GlobalSearch.tsx`
- `src/features/finance/components.tsx`
- `src/features/parties/PartiesPage.tsx`
- `src/features/invoices/InvoicesPage.tsx`
- `src/features/payments/PaymentsPage.tsx`

## New files

- `tests/phase-five.test.tsx`
- `tests/browser/phase-five.spec.ts`

## Verification

```bat
npm run build
npm run test:browser
```

The full browser suite now contains 36 tests: the previous 33 plus one new
empty-state scenario at 1440, 1280, and 1024 widths.

Login, Global Search visual refinement, and System States are intentionally not
included because Figma did not return their design context after its Starter-plan
MCP limit was reached.
