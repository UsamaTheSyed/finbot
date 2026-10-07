import { createHash, randomBytes } from "node:crypto";
import "@fastify/cookie";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { businesses, memberships, sessions, users } from "../db/schema.js";
import { ApiError } from "./errors.js";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function auth(config: AppConfig, db: Database) {
  const cookie = config.SESSION_COOKIE_NAME;
  async function restore(request: FastifyRequest) {
    request.sessionUser = null;
    const token = request.cookies[cookie];
    if (!token) return;
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name, avatar: users.avatar })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    request.sessionUser = row || null;
  }
  function requireUser(request: FastifyRequest): SessionUser {
    if (!request.sessionUser) throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required.");
    return request.sessionUser;
  }
  async function requireMembership(request: FastifyRequest, businessId: string) {
    const user = requireUser(request);
    const [membership] = await db
      .select({ role: memberships.role, status: memberships.status })
      .from(memberships)
      .innerJoin(businesses, eq(businesses.id, memberships.businessId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.businessId, businessId), eq(memberships.status, "Active")))
      .limit(1);
    if (!membership) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    return { user, ...membership };
  }
  async function createSession(reply: FastifyReply, userId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);
    await db.insert(sessions).values({ userId, tokenHash: digest(token), expiresAt });
    reply.setCookie(cookie, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
  }
  async function destroySession(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[cookie];
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
    reply.clearCookie(cookie, { path: "/" });
  }
  return { restore, requireUser, requireMembership, createSession, destroySession };
}

export type Auth = ReturnType<typeof auth>;
