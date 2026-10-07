import { z } from "zod";

const environment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3001),
  SESSION_COOKIE_NAME: z.string().min(1).default("finbot_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
  APP_DATE_OVERRIDE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AppConfig = z.infer<typeof environment>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  try {
    process.loadEnvFile?.(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const testMode = source.FINBOT_TEST_MODE === "true";
  const result = environment.safeParse({
    ...source,
    NODE_ENV: testMode ? "test" : source.NODE_ENV,
    DATABASE_URL: testMode ? source.TEST_DATABASE_URL : source.DATABASE_URL,
    APP_DATE_OVERRIDE: source.APP_DATE_OVERRIDE || undefined,
  });
  if (!result.success) {
    throw new Error(`Invalid server environment: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`);
  }
  return result.data;
}
