import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

// PostgreSQL DATE must remain YYYY-MM-DD; converting it to a JavaScript Date
// shifts Pakistani midnight to the previous UTC date.
types.setTypeParser(1082, (value) => value);

export function createDatabase(config: AppConfig) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.NODE_ENV === "test" ? 4 : 12,
    ssl: config.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
  });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabasePool = ReturnType<typeof createDatabase>["pool"];
