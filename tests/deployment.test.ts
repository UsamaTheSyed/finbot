import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionOptions, bootstrap } from "../deploy/setup.mjs";
import { serveFrontend } from "../deploy/frontend.mjs";

const env={NODE_ENV:"production", DATABASE_URL:"postgresql://owner@example.test/db?sslmode=require"};
test("production uses Render port and rejects test or pooled connections",()=>{
  assert.deepEqual(productionOptions({...env,PORT:"3009"}),{host:"0.0.0.0",port:3009});
  for (const options of [{PORT:"99999"},{FINBOT_TEST_MODE:"true"},{APP_DATE_OVERRIDE:"2026-01-01"},{DATABASE_URL:"postgresql://example-pooler.test/db?sslmode=require"}]) assert.throws(()=>productionOptions({...env,...options}));
});
test("deep links return HTML, missing API and asset routes stay 404",async()=>{
 const root=await mkdtemp(join(tmpdir(),"finbot-deploy-")), app=Fastify();
 try {
  await mkdir(join(root,"assets")); await writeFile(join(root,"index.html"),"FinBot test"); await writeFile(join(root,"assets","app.js"),"console.log(1)"); await writeFile(join(root,".env"),"private");
  app.get("/api/health",async()=>({ok:true})); await serveFrontend(app,root);
  for(const url of ["/","/dashboard","/invoices/INV-example"]) { const r=await app.inject({url,headers:{accept:"text/html"}}); assert.equal(r.body,"FinBot test"); }
  for(const url of ["/api/missing","/assets/missing.js","/.env"]) assert.equal((await app.inject({url,headers:{accept:"text/html"}})).statusCode,404);
  assert.equal((await app.inject("/api/health")).json().ok,true);
  assert.match(String((await app.inject("/assets/app.js")).headers["content-type"]),/javascript/);
 } finally {await app.close(); await rm(root,{recursive:true,force:true});}
});
function stub(initialized:boolean, fail=false) {
 const calls:{sql:string;args:unknown[]}[]=[];
 return {calls, async query(sql:string,args:unknown[]=[]) { calls.push({sql,args}); if(fail && sql.startsWith("insert into businesses")) throw Error("test failure"); return {rows:[{initialized}]}; }};
}
const owner={BOOTSTRAP_OWNER_EMAIL:"user@example.com",BOOTSTRAP_OWNER_NAME:"Owner",BOOTSTRAP_BUSINESS_NAME:"Private Demo",BOOTSTRAP_OWNER_PASSWORD:"long-enough-test-password"};
test("fresh workspace inserts only owner, membership, settings and warehouse",async()=>{
 const c=stub(false); assert.equal(await bootstrap(c,owner,async()=>"hashed"),"owner-created");
 assert.equal(c.calls.filter(q=>q.sql.startsWith("insert")).length,5);
 assert.equal(c.calls.find(q=>q.sql.startsWith("insert into users"))?.args[3],"hashed");
 assert.equal(c.calls.at(-1)?.sql,"commit");
});
test("redeploy without credentials leaves existing rows untouched",async()=>{
 const c=stub(true); assert.equal(await bootstrap(c,{},()=>{throw Error("must not rehash");}),"existing-database");
 assert.ok(!c.calls.some(q=>/insert|update|delete/.test(q.sql)));
});
test("invalid credentials or failed insert rolls back the bootstrap",async()=>{
 for(const [c,input] of [[stub(false),{}],[stub(false,true),owner]] as const) { await assert.rejects(bootstrap(c,input,async()=>"hash")); assert.equal(c.calls.at(-1)?.sql,"rollback"); }
});
