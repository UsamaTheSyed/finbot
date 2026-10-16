# Telegram specific-item edit patch

Baseline: commit 0eb190f. Only the included files change. Existing styling, database schema and dependencies are preserved.

## Apply on Windows
1. Stop dev:api and dev:bot with Ctrl+C.
2. Extract this ZIP to a temporary folder. Copy its server and tests folders into D:\Usama\finbot-source\finbot, merging folders and replacing matching files. Keep all unrelated files. Copy this guide and manifest if desired.
3. No npm install, migration or database reset is required.
4. Run each command separately from the project folder:

```cmd
docker compose up -d db
```

```cmd
npm run build
```

```cmd
node --import tsx --test tests/bot-item-edit.test.ts
```

```cmd
node --import tsx --test tests/backend-integration.test.ts
```

```cmd
npm test
```

Integration tests seed data: TEST_DATABASE_URL must point to the dedicated test database, never your live/business database. Do not run tests concurrently with other database tests.

After checks, start each in a separate terminal:

```cmd
npm run dev:api
```

```cmd
npm run dev:bot
```

Frontend, if needed, in another terminal:

```cmd
npm run dev
```

## Behavior and manual verification
- Create an unsaved two-item customer invoice or supplier bill preview, then click Edit.
- Send `item 2 ka rate 600 karo`. Only that item's rate changes. The bot recomputes totals and produces a new confirmation.
- A unique exact item name also works: `Oil ki quantity 3 karo`.
- `rate 600 karo` asks which item; reply `2`. Duplicate names also require selection. No item is guessed.
- Invalid quantities, tax or unit-qualified rates request correction for the selected line.
- Old Confirm buttons cannot save the edited preview. Use the new Confirm once; repeating it cannot create another invoice.
- Cancel during selection saves nothing.
- Example: Rice quantity 2 at 1000 with 5% tax, Oil quantity 1 at 500 with 0% tax, discount 100 gives PKR 2500. Changing only Oil's rate to 600 gives PKR 2600.

Scope: one selected item per edit message; multiple fields of that item may change. For changes to several items, send the full replacement list. Global invoice changes should be separate messages. Saved invoices/bills, item removal/reordering and relative changes such as 'double it' are outside this patch.

## Verification completed
- Production build: passed.
- ESLint: passed.
- Strict TypeScript check of changed tests/helpers: passed.
- Full npm test: 77 passed, 0 failed, 1 skipped (database integration unavailable in this environment).
- Focused item-edit tests after test-only typing correction: 13 passed.
- Two database integration scenarios were added, covering customer and supplier edits, stale confirmations, cancellation, amounts and supplier advances. Run these locally using the integration command above.
- Live Telegram/OpenAI and browser tests were not run here.
