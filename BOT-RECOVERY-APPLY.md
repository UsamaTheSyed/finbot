# FinBot bot conversation/recovery patch

Apply AFTER the FIFO allocation patch. Only files included in this ZIP should be replaced. No dependency install, migration or database reseed is required to run the app.

## Changes

- Extractor prompt defines payment direction from the BUSINESS viewpoint: customer sent us money = Received; we paid supplier = Sent. Explicit refunds retain the opposite direction. Ambiguity stays unset.
- A direction conflicting with the normal party flow now asks Received/Sent confirmation instead of silently changing it. Manual refunds remain possible; FIFO still only supports customer receipts and supplier payments.
- After a verified party read/selection, pronoun follow-ups (isne/usne/he/she/same party) offer that workspace-scoped party for explicit confirmation. A Different party button asks for another name. The bot does NOT silently apply a new payment to remembered context. Context uses the existing 30-minute conversation expiry; /cancel clears it.
- A new balance/payment/invoice query while waiting for a party or a choice is interpreted as a new request. Pending financial proposals still require Confirm/Edit/Cancel; language extraction never authorizes a write.
- Party labels such as Ahmed Khan (Customer) are searched by name and checked against kind.
- Unit-qualified rates such as 350/kg and 350 per kilogram are accepted only when the stored unit matches. No implicit unit conversion.
- Invalid rate, payment amount, discount, initial paid amount, dates, quantities and schema tax errors request the affected field while preserving other details.
- Relative transaction dates become an absolute date during validation, so later corrections do not shift a previously validated transaction date.
- Party summaries and bot invoice reads now use sequential database queries on transaction clients, addressing the pg overlapping-query warning.

## Apply (Windows)

1. Stop npm run dev:bot and npm run dev:api using Ctrl+C.
2. Extract this ZIP and merge its server/ and tests/ folders into D:\Usama\finbot-source\finbot. Replace only included files. Existing folders and .env remain in place.
3. This version of flow.ts includes the earlier rate-recovery correction. Do not paste the earlier temporary snippet a second time.
4. Run these commands separately from the project folder:

```cmd
npm run build
```

```cmd
npm run lint
```

```cmd
node --import tsx --test tests/bot-recovery.test.ts
```

```cmd
node --import tsx --test tests/backend-integration.test.ts
```

The integration test uses TEST_DATABASE_URL and the project's existing seed/reset behavior. It must point to the disposable test database, never the development database. Keep your already-applied missing-party-for-rollback / expected 404 correction in backend-integration.test.ts: this ZIP does not overwrite that file.

5. Restart API and bot in separate terminals:

```cmd
npm run dev:api
```

```cmd
npm run dev:bot
```

## Live checks

- Ask Ahmed Khan's balance, then “Acha isne 20000 PKR jama karwaye hain”. Expect a party confirmation button; verify the name before proceeding. There is no write until final Confirm.
- “Customer Ahmed Khan ne 400000 send kiye”: preview must show Received, or ask direction if the model supplied conflicting data. Do not confirm an incorrect direction.
- Supplier payment: explicitly say “Humne supplier [name] ko 100000 PKR diye”. Select FIFO and verify the allocation/advance breakdown against actual outstanding purchase records.
- Single-item sale with 350/kg and unit kg should reach a valid preview without failing amount parsing. Mismatched units should ask for a replacement rate.
- Enter a due date before invoice date: expect a specific date error, then supply a valid due date. It should continue without /cancel and without forgetting quantity/rate/party.
- While waiting for party name, ask a complete balance query. It should switch to that read request.

## Verification boundaries

Seven standalone recovery tests are included. Four PostgreSQL bot integration cases are added to the existing botIntegration helper, invoked by your existing integration parent. Local build/lint and non-database tests were run; real PostgreSQL and live Telegram/AI remain local verification steps. No new visual screens or supplier purchase-creation bot intent are introduced.
