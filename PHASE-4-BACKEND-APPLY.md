# Phase 4 backend patch

1. Extract the changed-file patch into the FinBot project root.
2. Copy `.env.example` to `.env` and keep its PostgreSQL URLs local.
3. Run `npm install` to install the locked backend dependencies.
4. Start PostgreSQL with `docker compose up -d db`, or create the two databases manually.
5. Run `npm run db:migrate` and `npm run db:seed`.
6. Start `npm run dev:api` and `npm run dev` in separate terminals.
7. Run `npm run test:browser`; it uses `TEST_DATABASE_URL`, never `DATABASE_URL`.

Do not run the development seed against production. The browser suite intentionally uses one worker and resets its dedicated test database before every case.
