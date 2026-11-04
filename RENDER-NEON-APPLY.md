# FinBot: private demo on Render + Neon

1. Start with your clean master checkout. Extract this ZIP directly into the folder containing package.json. No existing source files or package dependencies are replaced.
2. From Windows CMD in that folder run:
   - npm ci
   - node --import tsx --test tests/deployment.test.ts
   - npm run build
   - docker build -t finbot-render .
   Stop on failure. Docker Desktop must be running for the last command.
3. Run git status --short, then stage only the supplied files:
   git add Dockerfile .dockerignore render.yaml deploy tests/deployment.test.ts RENDER-NEON-APPLY.md
   git commit -m "build: prepare FinBot demo for Render and Neon"
   git push origin master
4. In Render Dashboard choose New > Blueprint and connect the GitHub repository UsamaTheSyed/finbot, branch master. Allow repository access if GitHub asks. Review the plan: one Free Docker Web Service. No second database, static site or worker is needed. Use a unique service name if finbot is taken.
5. Fill in the five requested environment variables BEFORE first deploy:
   - DATABASE_URL: from Neon Connect, select the intended fresh database and role; switch connection pooling OFF, copy the PostgreSQL connection string including its TLS options. Use the URI alone, not a psql command. Do not share it in chat, GitHub or a VITE_ variable.
   - BOOTSTRAP_OWNER_EMAIL: your private FinBot login email.
   - BOOTSTRAP_OWNER_PASSWORD: generate a unique 16–200 character password and save it in your password manager.
   - BOOTSTRAP_OWNER_NAME: your display name.
   - BOOTSTRAP_BUSINESS_NAME: your workspace name.
   Do not point your local test database URL at Neon. Never run db:seed or db:test:prepare against this hosted database.
6. Deploy. Startup migrates the database under a session lock, creates one owner and an empty PKR workspace only on a fresh DB, and starts the same-origin web app/API. Later deploys do not change passwords or reset balances.
7. Verify: open the assigned HTTPS URL plus /api/health; expect HTTP 200. Log in with the owner credentials, add a test party, refresh the detail URL, download a PDF for a test invoice, then redeploy and confirm the party still exists. After verified login you can remove the BOOTSTRAP_OWNER_PASSWORD environment variable; it is not needed to start against the initialized database. Leave DATABASE_URL set.
8. Keep Telegram off for this demo. There is no scheduled reminder worker in this deployment. The free service sleeps when idle. The old local database and its users do not transfer automatically.

If deploy fails: database connection or migration stage means inspect the Neon endpoint, role, database and TLS options. Initial owner setup means check the four bootstrap fields. HTTP startup means inspect the build output and port configuration. Do not post credentials or full environment dumps.
