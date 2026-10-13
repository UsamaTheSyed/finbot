import type { PoolClient } from "pg";
import type { Conversation, Identity, OutgoingMessage } from "../types.js";
import { executeWrite } from "../tools/write.js";
import { membership } from "../security/access.js";
import { ApiError } from "../../lib/errors.js";
import { logBotFailure } from "../security/diagnostics.js";

export async function action(
  client: PoolClient,
  identity: Identity,
  state: Conversation,
  verb: string,
  id: string,
): Promise<OutgoingMessage> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id))
    return { text: "Invalid button. Request dobara shuru karein." };
  const { rows } = await client.query(
    "select *, expires_at<=now() as expired from bot_actions where id=$1 and identity_id=$2 and user_id=$3 and business_id=$4 for update",
    [id, identity.id, identity.user_id, identity.business_id],
  );
  const pending = rows[0];
  if (!pending) return { text: "Action not found for this account." };
  if (pending.status !== "pending")
    return {
      text: `Action already ${pending.status}. No new financial change.${pending.status === "executed" && typeof pending.result?.text === "string" ? "\n" + pending.result.text : ""}`,
    };
  if (pending.expired) {
    await client.query("update bot_actions set status='expired' where id=$1", [
      id,
    ]);
    return { text: "Confirmation expired. Nayi request banayein." };
  }
  if (verb === "cancel" || verb === "edit") {
    await client.query(
      "update bot_actions set status='cancelled' where id=$1",
      [id],
    );
    delete state.pendingId;
    if (verb === "edit") {
      state.editing = true;
      if (state.extraction.intent !== pending.intent)
        return {
          text: "Old conversation expired. Cancelled; request dobara likhein.",
        };
      return {
        text: "Purani confirmation cancelled. Correction likhein, misal ‘amount 12k karo’. Nayi confirmation required hogi.",
      };
    }
    return { text: "Cancelled. Koi financial change nahi hua." };
  }
  if (verb !== "confirm") return { text: "Unknown action." };
  await membership(client, identity.user_id, identity.business_id);
  await client.query("savepoint financial_write");
  try {
    await client.query(
      "update bot_actions set status='confirmed',confirmed_at=now() where id=$1",
      [id],
    );
    const result = await executeWrite(client, identity, pending.payload);
    await client.query(
      "update bot_actions set status='executed',executed_at=now(),result=$2 where id=$1",
      [id, result],
    );
    delete state.pendingId;
    return { text: result.text };
  } catch (error) {
    if(!(error instanceof ApiError)) logBotFailure(error,"execution");
    await client.query("rollback to savepoint financial_write");
    await client.query(
      "update bot_actions set status='failed',result=$2 where id=$1",
      [id, { code: error instanceof ApiError ? error.code : "WRITE_FAILED" }],
    );
    delete state.pendingId;
    return {
      text:
        error instanceof ApiError && error.status < 500
          ? `${error.message} No financial change. Nayi request banayein.`
          : "Financial action failed; no change saved. FinBot mein check karke nayi request banayein.",
    };
  }
}
