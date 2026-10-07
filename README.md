# FinBot

FinBot is a React/Vite desktop accounting application with a Fastify/PostgreSQL backend. Financial records are workspace-scoped and persisted in PostgreSQL. The browser application communicates only through `/api`; the original in-memory ledger is retained solely as deterministic Node-test fixture infrastructure.

## Requirements

- Node.js 22.13+
- PostgreSQL 16+ or Docker Desktop with Compose

## Local setup

```sh
npm ci
copy .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
```

Start the API and frontend in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev
```

Open `http://127.0.0.1:5173` and sign in with:

- Email: `owner@alienterprise.pk`
- Password: `finbot-demo`

These credentials are development data only.

## Database workflow

Version-controlled SQL migrations are stored in `server/db/migrations`.

```sh
npm run db:migrate
npm run db:seed
```

`db:seed` resets only the deterministic `business-1` and `user-1` development records. Never run it against production.

## Testing

Static and fixture-backed tests do not need PostgreSQL:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Database integration and Playwright tests require `TEST_DATABASE_URL` from `.env`. The browser runner migrates and resets only that dedicated test database.

```sh
npm run test:browser
```

Playwright uses one worker because every case starts from a deterministic database reset. This prevents cross-test mutations and protects the development database.

## Architecture

```text
React UI
  -> TanStack Query and mutations
  -> frontend domain services
  -> same-origin HTTP API
  -> Fastify routes and server validation
  -> PostgreSQL transactions via Drizzle/pg
```

```text
server/
  db/             schema, migrations, seed, test preparation
  domain/         server validation and integer-paisa calculations
  lib/            authentication, errors, password hashing
  routes/         REST API boundaries
  services/       ledger mapping and atomic payment operations
src/services/     API-facing frontend abstractions
src/services/mock Node-test fixture infrastructure only
tests/browser/    API-integrated Playwright flows
```

## Security and tenancy

- Opaque session token in an `HttpOnly`, `SameSite=Lax` cookie
- Only a SHA-256 session-token digest stored in PostgreSQL
- Salted Node `scrypt` password hashes
- Authentication, active membership and record workspace checks on server routes
- Server-side relationship and overpayment validation
- Database transactions and row locks for financial mutations
- Structured API errors without stack traces or database details

## Phase 4 limits

Not implemented: WhatsApp, Telegram, AI agents, n8n, subscription billing, production email, production PDFs, bank APIs, Easypaisa/JazzCash APIs, production tax rules, mobile apps, or production deployment.
