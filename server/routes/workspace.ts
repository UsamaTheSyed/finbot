import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabasePool } from "../db/client.js";
import type { Auth } from "../lib/auth.js";
import { id, profileInput, teamInviteInput } from "../domain/validation.js";
import { ApiError } from "../lib/errors.js";

type Params = { businessId: string; id?: string };
const canManage = (role: string) => role === "Owner" || role === "Admin";

export async function workspaceRoutes(app: FastifyInstance, pool: DatabasePool, auth: Auth) {
  app.get<{ Params: Params }>("/api/businesses/:businessId/settings", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const result = await pool.query(
      `select b.*,u.name owner from businesses b
       left join workspace_memberships m on m.business_id=b.id and m.role='Owner'
       left join users u on u.id=m.user_id where b.id=$1`, [businessId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    return { name: row.name, owner: row.owner || "", phone: row.phone, email: row.email, address: row.address, ntn: row.ntn, currency: row.currency, logo: row.logo };
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/settings", async (request) => {
    const businessId = id.parse(request.params.businessId);
    const membership = await auth.requireMembership(request, businessId);
    if (!canManage(membership.role)) throw new ApiError(403, "FORBIDDEN", "Your role cannot update business settings.");
    const value = profileInput.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        `update businesses set name=$2,phone=$3,email=$4,address=$5,ntn=$6,currency=$7,logo=$8,updated_at=now()
         where id=$1 returning id`,
        [businessId, value.name, value.phone, value.email, value.address, value.ntn, value.currency, value.logo],
      );
      if (!updated.rows[0]) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      await client.query(
        `update users set name=$2,updated_at=now() where id in
         (select user_id from workspace_memberships where business_id=$1 and role='Owner')`,
        [businessId, value.owner],
      );
      await client.query("commit");
      return value;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  });

  app.get<{ Params: Params }>("/api/businesses/:businessId/team", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const result = await pool.query(
      `select u.id,u.name,u.email,m.role,m.status,m.permissions,m.last_active_at
       from workspace_memberships m join users u on u.id=m.user_id
       where m.business_id=$1 order by case m.role when 'Owner' then 0 else 1 end,m.created_at`,
      [businessId],
    );
    return result.rows.map((row) => ({
      id: row.id, businessId, name: row.name, email: row.email, role: row.role,
      status: row.status, permissions: row.permissions,
      lastActive: row.last_active_at ? new Date(row.last_active_at).toISOString() : "—",
    }));
  });
  app.post<{ Params: Params }>("/api/businesses/:businessId/team", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    const membership = await auth.requireMembership(request, businessId);
    if (!canManage(membership.role)) throw new ApiError(403, "FORBIDDEN", "Your role cannot invite members.");
    const value = teamInviteInput.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query("select id,name,email from users where lower(email)=lower($1)", [value.email]);
      const userId = existing.rows[0]?.id || `user-${randomUUID()}`;
      if (!existing.rows[0])
        await client.query("insert into users (id,email,name,password_hash) values ($1,$2,$3,$4)", [userId, value.email, value.name, `invited:${randomUUID()}`]);
      const duplicate = await client.query("select 1 from workspace_memberships where business_id=$1 and user_id=$2", [businessId, userId]);
      if (duplicate.rows[0]) throw new ApiError(409, "MEMBER_EXISTS", "A member with this email already exists.");
      await client.query(
        `insert into workspace_memberships (user_id,business_id,role,status,permissions,invited_email)
         values ($1,$2,$3,'Invited',$4,$5)`,
        [userId, businessId, value.role, JSON.stringify(value.permissions), value.email],
      );
      await client.query("commit");
      return reply.status(201).send({ id: userId, businessId, ...value, status: "Invited", lastActive: "—" });
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  });
  app.delete<{ Params: Params }>("/api/businesses/:businessId/team/:id", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    const membership = await auth.requireMembership(request, businessId);
    if (!canManage(membership.role)) throw new ApiError(403, "FORBIDDEN", "Your role cannot remove members.");
    const userId = id.parse(request.params.id);
    const target = await pool.query("select role from workspace_memberships where business_id=$1 and user_id=$2", [businessId, userId]);
    if (!target.rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Team member not found.");
    if (target.rows[0].role === "Owner") throw new ApiError(400, "OWNER_PROTECTED", "The workspace owner cannot be removed.");
    await pool.query("delete from workspace_memberships where business_id=$1 and user_id=$2", [businessId, userId]);
    return reply.status(204).send();
  });

  app.get<{ Params: Params }>("/api/businesses/:businessId/notifications", async (request) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const result = await pool.query("select * from notifications where business_id=$1 order by event_date desc,created_at desc", [businessId]);
    return result.rows.map((row) => ({ id: row.id, businessId, title: row.title, description: row.description, read: row.read, href: row.href, date: row.event_date }));
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/notifications", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    await pool.query("update notifications set read=true where business_id=$1", [businessId]);
    return reply.status(204).send();
  });
  app.patch<{ Params: Params }>("/api/businesses/:businessId/notifications/:id", async (request, reply) => {
    const businessId = id.parse(request.params.businessId);
    await auth.requireMembership(request, businessId);
    const result = await pool.query("update notifications set read=true where business_id=$1 and id=$2 returning id", [businessId, id.parse(request.params.id)]);
    if (!result.rows[0]) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    return reply.status(204).send();
  });
}
