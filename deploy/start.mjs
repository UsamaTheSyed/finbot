import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildApp } from '../server-dist/server/app.js';
import { loadConfig } from '../server-dist/server/config.js';
import { createDatabase } from '../server-dist/server/db/client.js';
import { hashPassword } from '../server-dist/server/lib/password.js';
import { bootstrap, productionOptions } from './setup.mjs';
import { serveFrontend } from './frontend.mjs';
let stage='configuration';
try {
  const listen=productionOptions(process.env), config=loadConfig();
  const {pool}=createDatabase(config);
  stage='database connection or migration';
  try {
    const c=await pool.connect();
    try {
      await c.query("select pg_advisory_lock(hashtextextended('finbot:deploy',0))");
      await migrate(drizzle(c),{migrationsFolder:'server/db/migrations'});
      stage='initial owner setup';
      console.info(JSON.stringify({event:await bootstrap(c,process.env,hashPassword)}));
    } finally { c.release(true); } // closing this session releases its advisory lock
  } finally { await pool.end(); }
  stage='http startup';
  const app=await buildApp(config);
  try {
    await serveFrontend(app,resolve('dist'));
    await app.listen(listen);
    let closing=false;
    const close=async()=>{ if (!closing) { closing=true; await app.close(); } };
    process.once('SIGTERM',close); process.once('SIGINT',close);
  } catch (err) { await app.close(); throw err; }
} catch (err) {
  console.error(JSON.stringify({event:'deployment_failed',stage,code:typeof err?.code==='string' ? err.code : undefined}));
  process.exitCode=1;
}
