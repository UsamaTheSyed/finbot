import assert from "node:assert/strict";
import test from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "../server/app";
import { createDatabase } from "../server/db/client";
import { seedDevelopment } from "../server/db/seed";
import type { AppConfig } from "../server/config";
import { allocateInvoiceNumber } from "../server/services/invoiceNumber";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const databaseUrl = process.env.TEST_DATABASE_URL;

test("authenticated API preserves workspace isolation and atomic finance invariants", { skip: !databaseUrl }, async () => {
  const config: AppConfig = {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl!,
    API_HOST: "127.0.0.1",
    API_PORT: 3001,
    SESSION_COOKIE_NAME: "finbot_test_session",
    SESSION_TTL_DAYS: 1,
    APP_DATE_OVERRIDE: "2026-11-28",
  };
  process.env.APP_DATE_OVERRIDE = config.APP_DATE_OVERRIDE;
  const setup = createDatabase(config);
  await migrate(setup.db, { migrationsFolder: "server/db/migrations" });
  await seedDevelopment(setup.pool);
  await setup.pool.query("delete from businesses where id = 'business-2'", );
  await setup.pool.query("insert into businesses (id,name) values ('business-2','Isolated Workspace')");
  await setup.pool.query("insert into parties (id,business_id,name,kind) values ('other-party','business-2','Private Party','Customer')");
  const app = await buildApp(config);
  try {
    const unauthenticated = await app.inject({ method: "GET", url: "/api/businesses/business-1/parties" });
    assert.equal(unauthenticated.statusCode, 401);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@alienterprise.pk", password: "finbot-demo" } });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers["set-cookie"]?.split(";")[0];
    assert.ok(cookie);
    const headers = { cookie };
    const isolated = await app.inject({ method: "GET", url: "/api/businesses/business-2/parties/other-party", headers });
    assert.equal(isolated.statusCode, 404);

    const party = await app.inject({
      method: "POST", url: "/api/businesses/business-1/parties", headers,
      payload: { kind: "Customer", name: "API Customer", phone: "03001234567", email: "api@example.com", ntn: "", address: "Karachi", paymentTerms: "Net 30" },
    });
    assert.equal(party.statusCode, 201);
    const partyId = party.json().id as string;
    const invoice = await app.inject({
      method: "POST", url: "/api/businesses/business-1/invoices", headers,
      payload: {
        partyId, date: "2026-11-28", dueDate: "2026-12-28", reference: "API-1",
        items: [
          { item: "Rice", description: "Bag", quantity: 2, unit: "Bag", rate: 1000, taxPercent: 5 },
          { item: "Oil", description: "Carton", quantity: 1, unit: "Carton", rate: 500, taxPercent: 0 },
        ],
        discount: 0, amountPaid: 0, method: "Cash", notes: "", terms: "", draft: false,
      },
    });
    assert.equal(invoice.statusCode, 201);
    const invoiceBody = invoice.json();
    assert.equal(invoiceBody.displayId, "INV-000020");
    assert.notEqual(invoiceBody.id, invoiceBody.displayId);
    assert.equal(invoiceBody.totalMinor, 260000);
    const partial = await app.inject({
      method: "POST", url: "/api/businesses/business-1/payments", headers,
      payload: { direction: "Received", partyId, invoiceId: invoiceBody.id, amount: 600, method: "Bank Transfer", date: "2026-11-28", reference: "P-1", notes: "" },
    });
    // console.log("PARTIAL PAYMENT RESPONSE:", {
    //   statusCode: partial.statusCode,
    //   body: partial.body,
    // });
    assert.equal(partial.statusCode, 201);
    assert.equal(partial.json().invoiceId, invoiceBody.id);
    assert.equal(partial.json().invoiceDisplayId, invoiceBody.displayId);
    const afterPartial = await app.inject({ method: "GET", url: `/api/businesses/business-1/invoices/${invoiceBody.id}`, headers });
    assert.equal(afterPartial.json().status, "Partial");
    assert.equal(afterPartial.json().balanceMinor, 200000);
    const beforeCount = await setup.pool.query("select count(*)::int count from payments where business_id='business-1'");
    const overpayment = await app.inject({
      method: "POST", url: "/api/businesses/business-1/payments", headers,
      payload: { direction: "Received", partyId, invoiceId: invoiceBody.id, amount: 2000.01, method: "Cash", date: "2026-11-28", reference: "P-2", notes: "" },
    });
    assert.equal(overpayment.statusCode, 409);
    const afterCount = await setup.pool.query("select count(*)::int count from payments where business_id='business-1'");
    assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count);
    const report = await app.inject({ method: "GET", url: "/api/businesses/business-1/reports/ar-aging?period=2026-11", headers });
    assert.equal(report.statusCode, 200);
    assert.ok(report.json().aging.at(-1).total > 0);
    // Concurrent creation must allocate distinct workspace numbers, keeping UUID routes.
    const draftInput = {
      partyId, date: "2026-11-28", dueDate: "2026-12-28", reference: "numbering",
      items: [{ item: "Test", description: "", quantity: 1, unit: "Each", rate: 100, taxPercent: 0 }],
      discount: 0, amountPaid: 0, method: "Cash", notes: "", terms: "", draft: true,
    };
    const created = await Promise.all(Array.from({ length: 4 }, () => app.inject({
      method: "POST", url: "/api/businesses/business-1/invoices", headers, payload: draftInput,
    })));
    for (const response of created) assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(created.map((r) => r.json().displayId).sort(), [
      "INV-000021", "INV-000022", "INV-000023", "INV-000024",
    ]);
    const draft = created[0].json();
    for (const isDraft of [true, false]) {
      const updated = await app.inject({ method: "PATCH",
        url: `/api/businesses/business-1/invoices/${draft.id}`, headers,
        payload: { ...draftInput, draft: isDraft },
      });
      assert.equal(updated.statusCode, 200, updated.body);
      assert.equal(updated.json().id, draft.id);
      assert.equal(updated.json().displayId, draft.displayId);
    }
    const list = await app.inject({ method: "GET", url: "/api/businesses/business-1/invoices", headers });
    assert.equal(list.json().find((i: { id: string }) => i.id === draft.id).displayId, draft.displayId);
    // Failure after allocation must roll back the counter as well as the invoice.
    const rejected = await app.inject({ method: "POST",
      url: "/api/businesses/business-1/invoices", headers,
      payload: { ...draftInput, partyId: "party-2" },
    });
    assert.equal(rejected.statusCode, 400, rejected.body);
    const next = await app.inject({ method: "POST",
      url: "/api/businesses/business-1/invoices", headers, payload: draftInput,
    });
    assert.equal(next.statusCode, 201, next.body);
    assert.equal(next.json().displayId, "INV-000025");
    // Committed numbers remain consumed even if the invoice is later deleted.
    await setup.pool.query("delete from invoices where id=$1", [next.json().id]);
    const afterDelete = await app.inject({ method: "POST",
      url: "/api/businesses/business-1/invoices", headers, payload: draftInput,
    });
    assert.equal(afterDelete.statusCode, 201, afterDelete.body);
    assert.equal(afterDelete.json().displayId, "INV-000026");
    const counterClient = await setup.pool.connect();
    try {
      await counterClient.query("begin");
      assert.equal(await allocateInvoiceNumber(counterClient, "business-2"), "INV-000001");
      await counterClient.query("rollback");
      await counterClient.query("begin");
      assert.equal(await allocateInvoiceNumber(counterClient, "business-2"), "INV-000001");
      await counterClient.query("commit");
    } finally {
      await counterClient.query("rollback");
      counterClient.release();
    }
  } finally {
    await app.close();
    await setup.pool.end();
  }
});
