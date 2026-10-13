import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
// Explicit maintenance command, never deletes financial records.
const { pool } = createDatabase(loadConfig());
try {
  await pool.query("delete from bot_link_tokens where expires_at<now()");
  await pool.query("delete from bot_conversations where expires_at<now()");
  await pool.query("delete from bot_rate_limits where expires_at<now()");
  await pool.query(
    "delete from bot_receipts where created_at<now()-interval '7 days'",
  );
  await pool.query(
    "update bot_actions set status='expired' where status='pending' and expires_at<now()",
  );
  await pool.query(
    "delete from bot_actions where created_at<now()-interval '90 days' and status in ('executed','cancelled','expired','failed')",
  );
  console.info(
    "Expired bot metadata pruned. Financial ledger and audit retained.",
  );
} finally {
  await pool.end();
}
