import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";
import { loadConfig } from "../config.js";

const { db, pool } = createDatabase(loadConfig());
try {
  await migrate(db, { migrationsFolder: "server/db/migrations" });
  console.info(JSON.stringify({ level: "info", event: "database_migrated" }));
} finally {
  await pool.end();
}
