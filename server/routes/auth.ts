import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Auth } from "../lib/auth.js";
import type { Database } from "../db/client.js";
import { businesses, memberships, users } from "../db/schema.js";
import { ApiError } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";

const loginInput = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});

async function sessionPayload(db: Database, userId: string) {
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Session is no longer valid.");
  const workspaces = await db
    .select({ id: businesses.id, name: businesses.name, currency: businesses.currency, city: businesses.city, role: memberships.role })
    .from(memberships)
    .innerJoin(businesses, eq(businesses.id, memberships.businessId))
    .where(sql`${memberships.userId} = ${userId} AND ${memberships.status} = 'Active'`);
  return { user: { ...user, role: workspaces[0]?.role || "Staff" }, businesses: workspaces };
}

export async function authRoutes(app: FastifyInstance, db: Database, auth: Auth) {
  app.post("/api/auth/login", async (request, reply) => {
    const input = loginInput.parse(request.body);
    const [account] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${input.email})`).limit(1);
    if (!account || !(await verifyPassword(input.password, account.passwordHash)))
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    await auth.createSession(reply, account.id);
    return sessionPayload(db, account.id);
  });
  app.post("/api/auth/logout", async (request, reply) => {
    await auth.destroySession(request, reply);
    return reply.status(204).send();
  });
  app.get("/api/session", async (request) => {
    const user = auth.requireUser(request);
    return sessionPayload(db, user.id);
  });
}
