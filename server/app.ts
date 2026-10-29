import { accountingRoutes } from "./routes/accounting.js";
import { warehouseRoutes } from "./routes/warehouses.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { reminderRoutes } from "./routes/reminders.js";
import { creditRoutes } from "./routes/credits.js";
import { correctionRoutes } from "./routes/corrections.js";
import { statementRoutes } from "./routes/statements.js";
import { invoicePdfRoutes } from "./routes/invoicePdf.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { auth } from "./lib/auth.js";
import { errorHandler } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { partyRoutes } from "./routes/parties.js";
import { transactionRoutes } from "./routes/transactions.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { paymentRoutes } from "./routes/payments.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { reportRoutes } from "./routes/reports.js";
import { seedDevelopment } from "./db/seed.js";
import { botRoutes } from "./routes/bot.js";
import { botConfig, type BotConfig } from "./bot/config.js";

export async function buildApp(
  config: AppConfig,
  options: { bot?: BotConfig } = {},
) {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "error" : "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-telegram-bot-api-secret-token"]',
        `req.cookies.${config.SESSION_COOKIE_NAME}`,
        "req.body.password",
      ],
    },
    trustProxy: config.NODE_ENV === "production",
  });
  await app.register(cookie);
  const { db, pool } = createDatabase(config);
  const security = auth(config, db);
  app.decorateRequest("sessionUser", null);
  app.addHook("onRequest", security.restore);
  app.setErrorHandler(errorHandler);
  app.get("/api/health", async () => {
    await pool.query("select 1");
    return { status: "ok" };
  });
  if (config.NODE_ENV === "test")
    app.post("/api/test/reset", async () => {
      await seedDevelopment(pool);
      return { status: "reset" };
    });
  await authRoutes(app, db, security);
  await partyRoutes(app, pool, security);
  await statementRoutes(app, pool, security);
  await transactionRoutes(app, pool, security);
  await invoiceRoutes(app, pool, security);
  await correctionRoutes(app, pool, security);
  await creditRoutes(app, pool, security);
  await invoicePdfRoutes(app, pool, security);
  await paymentRoutes(app, pool, security);
  await workspaceRoutes(app, pool, security);
  await reportRoutes(app, pool, security);
  await accountingRoutes(app, pool, security);
  await botRoutes(app, pool, security, options.bot ?? botConfig());
  await inventoryRoutes(app, pool, security);
  await warehouseRoutes(app, pool, security);
  await reminderRoutes(app, pool, security, options.bot ?? botConfig());
  app.addHook("onClose", async () => pool.end());
  return app;
}
