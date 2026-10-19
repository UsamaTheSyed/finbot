import { chromium, type Browser } from "playwright";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ApiError } from "../lib/errors.js";
const require = createRequire(import.meta.url);
let fontCache: Promise<string> | undefined;
export function embeddedFonts() {
  return (fontCache ??= Promise.all(
    [400, 600, 700].map(async (weight) => {
      const file = require.resolve(
        `@fontsource/inter/files/inter-latin-${weight}-normal.woff2`,
      );
      return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${(await readFile(file)).toString("base64")}) format('woff2');}`;
    }),
  ).then((rows) => rows.join("")));
}
export function createPdfRenderer() {
  let browser: Promise<Browser> | undefined;
  let active = 0;
  async function render(html: string): Promise<Buffer> {
    if (active >= 2)
      throw new ApiError(
        503,
        "PDF_BUSY",
        "PDF service is busy. Please try again shortly.",
      );
    active++;
    let context;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      browser ??= chromium
        .launch({
          headless: true,
          timeout: 15_000,
          executablePath: process.env.PDF_CHROMIUM_EXECUTABLE_PATH || undefined,
        })
        .then((b) => {
          b.on("disconnected", () => {
            browser = undefined;
          });
          return b;
        })
        .catch((error) => {
          browser = undefined;
          throw error;
        });
      context = await (
        await browser
      ).newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
      const renderContext = context;
      deadline = setTimeout(() => {
        void renderContext.close().catch(() => undefined);
      }, 30_000);
      // Never fetch user-supplied URLs, filesystem resources, or app sessions.
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      return await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font:9px Arial;color:#70706e;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      });
    } finally {
      clearTimeout(deadline);
      try {
        await context?.close();
      } finally {
        active--;
      }
    }
  }
  return {
    render,
    async close() {
      const current = browser;
      browser = undefined;
      if (current) await (await current.catch(() => undefined))?.close();
    },
  };
}
