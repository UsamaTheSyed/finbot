process.env.FINBOT_TEST_MODE = "true";
await import("./migrate.js");
const { createDatabase } = await import("./client.js");
const { loadConfig } = await import("../config.js");
const { seedDevelopment } = await import("./seed.js");
const { pool } = createDatabase(loadConfig());
try {
  await seedDevelopment(pool);
} finally {
  await pool.end();
}
