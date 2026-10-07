# FinBot Phase 4 patch

This archive contains only Phase 4 additions and changed files. Extract it into
the FinBot project root and allow the listed existing files to be replaced.

## Existing files to replace

- `src/app/router/routes.tsx`
- `src/services/mock/data.ts`
- `src/services/notificationService.ts`
- `src/types/index.ts`

## New files

- `src/features/notifications/NotificationsPage.tsx`
- `src/features/team/TeamPage.tsx`
- `src/services/teamService.ts`
- `src/styles/phase-four.css`
- `tests/browser/phase-four.spec.ts`
- `tests/phase-four.test.ts`

## Verify

```bat
npm run build
npm run test:browser
```

The complete browser suite now contains 33 tests: the existing 27 plus two new
Phase 4 scenarios at 1440, 1280, and 1024 widths.
