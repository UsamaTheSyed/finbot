import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ authenticatedDatabase: void }>({
  authenticatedDatabase: [
    async ({ page }, use) => {
      const reset = await page.request.post("/api/test/reset");
      expect(reset.ok()).toBe(true);
      const login = await page.request.post("/api/auth/login", {
        data: {
          email: "owner@alienterprise.pk",
          password: "finbot-demo",
        },
      });
      expect(login.ok()).toBe(true);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
