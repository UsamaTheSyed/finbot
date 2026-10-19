# Invoice / Supplier Bill PDF patch

Baseline: commit `6ded97f`. This archive contains changed/new files only. It does not contain your database, secrets, node_modules, or generated build output.

## Apply on Windows

1. Stop the API, frontend and bot terminals with Ctrl+C.
2. Extract this ZIP into a temporary folder. Copy its contents into `D:\Usama\finbot-source\finbot`, merging folders and replacing matching files. Do not delete existing folders. Do not overwrite your `.env`; only `.env.example` is included.
3. Open CMD in the project folder and run each command separately:

```cmd
npm install
```

```cmd
npm run pdf:install
```

This installs Chromium for the existing Playwright version. Run it as the same Windows account that runs the API. A browser download/network failure must be resolved before PDF tests can pass. If your administrator already provides a compatible Chromium executable, the optional `PDF_CHROMIUM_EXECUTABLE_PATH` environment variable can point to it. Normally leave it unset.

```cmd
docker compose up -d db
```

```cmd
npm run build
```

```cmd
npm test
```

Ensure TEST_DATABASE_URL points to your dedicated test database: the existing integration suite seeds test data. This feature requires no schema migration and no development database reset.

With manual frontend/API processes stopped, run:

```cmd
npx playwright test tests/browser/invoice-pdf.spec.ts --workers=1
```

There is one new browser flow for each desktop width: 1440, 1280, 1024.

Then run the full browser regression:

```cmd
npm run test:browser
```

## Run and manually check

In separate terminals run `npm run dev:api` and `npm run dev`. Open the Vite URL and sign in using your existing account.

- Open a customer invoice and click Download PDF. The filename uses its display number, not the internal UUID.
- Check business/party details, all items, taxes, discount, total, paid amount and outstanding balance.
- Repeat for a supplier bill. It must say Bill and Supplier.
- Download a draft. It must show DRAFT, no amount due, and Projected Balance.
- Record a valid payment, then download again. Paid/balance and allocated payment history must reflect the latest saved state.
- Download must not create a payment, issue a draft, or change any ledger data.
- A server generation failure displays an error and re-enables the button for retry.

After verification, review `git diff --stat` and `git status --short` before committing.

## Implementation

The existing Invoice Detail Download PDF button now calls an authenticated, workspace-scoped server endpoint. A read-only consistent database snapshot supplies invoice totals and allocated payment history. The template escapes supplied text, embeds Inter, permits only inline PNG/JPEG logos, and prevents external resource fetching. The browser renderer has bounded concurrency and cleanup. Client download errors preserve existing API behavior.

Existing Playwright 1.63.0 is now an explicit production dependency; no alternate PDF framework or version upgrade was introduced. Chromium must also be installed in any deployment environment under the API service account. Linux hosts additionally need Chromium OS dependencies. PDFs are rendered on demand and are not stored on the server.

The Figma Invoice Detail frame (file 3jjUDQgHWXPqD3L6yy6thh, node 782:1473) informed typography, bronze accent, information groups and table treatment. A4 dimensions, page breaks and footer numbering are print-specific. Figma's sample line totals and summary are inconsistent; the PDF uses authoritative persisted financial values. English/Roman Urdu text was verified; additional scripts require suitable installed fallback fonts.

Only Invoice/Bill PDF download is implemented. Statement PDFs, reminders, the app's separate Print action and Transaction Detail download remain deferred.

## Verification completed here

- Frontend and server production build passed.
- ESLint passed.
- Full local test run: 84 passed, 0 failed, 1 skipped. The skipped test is the PostgreSQL integration suite because no TEST_DATABASE_URL was available here.
- Actual Chromium PDF rendering passed; invoice and draft bill visually checked on one page, plus a 100-item stress bill on 18 pages with repeated table headings and numbered footers.
- Real frontend download/error/retry checks passed at all three widths using controlled API responses and actual generated PDF bytes.
- Added database-backed PDF access/no-mutation assertions and browser tests. These still require the commands above on your local PostgreSQL setup; local controlled-response checks are not a substitute for those tests.

The standard browser download was unavailable in the build environment, so rendering QA used an isolated compatible Chromium executable. No QA-only browser package is included in this patch.
