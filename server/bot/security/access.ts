import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { Queryable } from "../../services/ledger.js";
import { ApiError } from "../../lib/errors.js";
import type { Identity, InboundMessage } from "../types.js";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function membership(
  client: Queryable,
  userId: string,
  businessId: string,
) {
  const row = await client.query(
    "select b.timezone from workspace_memberships m join businesses b on b.id=m.business_id where m.user_id=$1 and m.business_id=$2 and m.status='Active' for share of m",
    [userId, businessId],
  );
  if (!row.rows[0])
    throw new ApiError(
      403,
      "BOT_UNAUTHORIZED",
      "Workspace access revoked. FinBot se dobara link karein.",
    );
  return row.rows[0].timezone as string;
}
export async function resolveIdentity(
  client: Queryable,
  m: InboundMessage,
): Promise<Identity | undefined> {
  const result = await client.query(
    "select * from bot_identities where channel=$1 and external_user_id=$2 and external_chat_id=$3 for update",
    [m.channel, m.externalUserId, m.externalChatId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    ...row,
    timezone: await membership(client, row.user_id, row.business_id),
  };
}
export async function rateLimit(
  client: Queryable,
  key: string,
  maximum: number,
  seconds = 60,
) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const result = await client.query(
    `insert into bot_rate_limits (key,count,expires_at) values ($1,1,now()+($2 * interval '1 second')) on conflict (key) do update set count=bot_rate_limits.count+1 returning count`,
    [digest(`${key}:${bucket}`), seconds * 2],
  );
  return result.rows[0].count <= maximum;
}
export async function issueLink(
  client: PoolClient,
  userId: string,
  businessId: string,
) {
  await membership(client, userId, businessId);
  await client.query(
    "delete from bot_link_tokens where user_id=$1 and business_id=$2",
    [userId, businessId],
  );
  const token = randomBytes(32).toString("base64url");
  await client.query(
    "insert into bot_link_tokens (hash,user_id,business_id,expires_at) values ($1,$2,$3,now()+interval '5 minutes')",
    [digest(token), userId, businessId],
  );
  return token;
}
export async function consumeLink(
  client: PoolClient,
  m: InboundMessage,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(
      400,
      "LINK_INVALID",
      "Link invalid ya expired hai. FinBot se naya link banayein.",
    );
  const result = await client.query(
    "select * from bot_link_tokens where hash=$1 and used_at is null and expires_at>now() for update",
    [digest(token)],
  );
  const row = result.rows[0];
  if (!row)
    throw new ApiError(
      400,
      "LINK_INVALID",
      "Link invalid ya expired hai. FinBot se naya link banayein.",
    );
  await membership(client, row.user_id, row.business_id);
  const exists = await client.query(
    "select 1 from bot_identities where channel=$1 and external_user_id=$2 and external_chat_id=$3",
    [m.channel, m.externalUserId, m.externalChatId],
  );
  if (exists.rowCount)
    throw new ApiError(
      409,
      "ALREADY_LINKED",
      "Pehle /unlink karein, phir naya account link karein.",
    );
  await client.query(
    "insert into bot_identities (channel,external_user_id,external_chat_id,user_id,business_id) values ($1,$2,$3,$4,$5)",
    [
      m.channel,
      m.externalUserId,
      m.externalChatId,
      row.user_id,
      row.business_id,
    ],
  );
  await client.query("update bot_link_tokens set used_at=now() where hash=$1", [
    digest(token),
  ]);
}
