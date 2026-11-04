import { randomUUID } from 'node:crypto';
export function productionOptions(env) {
  if (env.NODE_ENV !== 'production' || env.FINBOT_TEST_MODE === 'true' || env.APP_DATE_OVERRIDE || env.VITE_APP_DATE_OVERRIDE) throw Error('Invalid production environment: disable test settings.');
  const port=Number(env.PORT || 10000);
  if (!Number.isInteger(port) || port<1 || port>65535) throw Error('Invalid PORT');
  const db=new URL(env.DATABASE_URL);
  if (!['postgres:','postgresql:'].includes(db.protocol) || db.hostname.includes('-pooler') || !['require','verify-full'].includes(db.searchParams.get('sslmode'))) throw Error('Use a direct PostgreSQL connection with TLS.');
  return {port,host:'0.0.0.0'};
}
export async function bootstrap(client, env, hashPassword) {
  await client.query('begin');
  try {
    await client.query('lock table users,businesses in share row exclusive mode');
    const {rows:[state]}=await client.query('select exists(select 1 from users) or exists(select 1 from businesses) as initialized');
    if (state.initialized) { await client.query('commit'); return 'existing-database'; }
    const email=env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase(), pw=env.BOOTSTRAP_OWNER_PASSWORD,
      owner=env.BOOTSTRAP_OWNER_NAME?.trim(), business=env.BOOTSTRAP_BUSINESS_NAME?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>200 || !pw || pw.length<16 || pw.length>200 || !owner || !business) throw Error('Invalid or missing bootstrap credentials');
    const u=randomUUID(), b=randomUUID();
    await client.query('insert into users(id,email,name,password_hash) values($1,$2,$3,$4)',[u,email,owner,await hashPassword(pw)]);
    await client.query('insert into businesses(id,name) values($1,$2)',[b,business]);
    await client.query("insert into workspace_memberships(user_id,business_id,role,status,permissions) values($1,$2,'Owner','Active',$3)",[u,b,JSON.stringify(['all'])]);
    await client.query('insert into business_settings(business_id,payment_methods) values($1,$2)',[b,JSON.stringify(['Cash','Bank Transfer','Easypaisa','JazzCash','Cheque'])]);
    await client.query("insert into warehouses(id,business_id,name) values($1,$2,'Main warehouse')",['main:'+b,b]);
    await client.query('commit');
    return 'owner-created';
  } catch (error) { await client.query('rollback'); throw error; }
}
