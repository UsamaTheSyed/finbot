import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [1440, 1280, 1024].map((width) => ({
    name: `desktop-${width}`,
    use: { viewport: { width, height: 1000 } },
  })),
  webServer: [
    {
      command: "npm run db:test:prepare && npm run dev:api",
      stdout: "pipe",
      stderr: "pipe",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      env: {
        FINBOT_TEST_MODE: "true",
        APP_DATE_OVERRIDE: "2026-11-28",
      },
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      stdout: "pipe",
      stderr: "pipe",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        VITE_APP_DATE_OVERRIDE: "2026-11-28",
      },
    },
  ],
});
