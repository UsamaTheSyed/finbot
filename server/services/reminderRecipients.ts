import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { InboundMessage, OutgoingMessage } from "../bot/types.js";
import { digest } from "../bot/security/access.js";
// Customer identities never enter bot_identities and never grant workspace access.
export async function customerReminderCommand(
  pool: Pool,
  m: InboundMessage,
): Promise<OutgoingMessage | undefined> {
  if (m.text.trim() === "/stop") {
    await pool.query(
      "update reminder_recipients set state='Disconnected',version=$2,token_hash=null where chat_id=$1",
      [m.externalChatId, randomUUID()],
    );
    return {
      text: "Payment reminders stopped. This does not change your financial account.",
    };
  }
  const match = /^\/start\s+r_([A-Za-z0-9_-]{43})$/.exec(m.text.trim());
  if (!match) return;
  const c = await pool.connect();
  try {
    await c.query("begin");
    const result = await c.query(
      "select * from reminder_recipients where token_hash=$1 and expires_at>now() for update",
      [digest(match[1])],
    );
    if (!result.rows[0]) {
      await c.query("rollback");
      return {
        text: "This reminder link is invalid or expired. Ask the business for a new link.",
      };
    }
    const r = result.rows[0];
    await c.query(
      "update reminder_recipients set chat_id=$2,state='Pending approval',token_hash=null,consented_at=now(),version=$3 where party_id=$1",
      [r.party_id, m.externalChatId, randomUUID()],
    );
    await c.query("commit");
    return {
      text: `Payment reminder opt-in received. Ask the business to verify your Telegram chat ID ${m.externalChatId} before approving. Send /stop at any time. This link does not provide access to the business account.`,
    };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
