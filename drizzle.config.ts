import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://finbot:finbot@127.0.0.1:5432/finbot",
  },
  strict: true,
  verbose: true,
});
