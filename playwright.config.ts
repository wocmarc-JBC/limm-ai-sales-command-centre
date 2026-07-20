import { defineConfig, devices } from "@playwright/test";
import { existsSync, statSync } from "node:fs";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const fallbackChromium = "/tmp/chromium";
function isUsableChromium(path: string) {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 1_000_000;
  } catch {
    return false;
  }
}
const fallbackChromiumUsable = process.platform === "linux" && isUsableChromium(fallbackChromium);
const bundledChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
  || (fallbackChromiumUsable ? fallbackChromium : "");
const nextServerMode = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1" ? "start" : "dev";
const ci = process.env.CI === "true";
const chromiumArgs = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  ...(ci ? ["--disable-gpu"] : [])
];

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/playwright",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: {
      ...(bundledChromium ? { executablePath: bundledChromium } : {}),
      args: chromiumArgs
    }
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: /boss-ops-quotation-data-hygiene\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "tablet-chromium",
      testMatch: /v4-2-human-browser\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 900, height: 1180 },
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: "mobile-chromium",
      testMatch: /v4-2-human-browser\.spec\.ts/,
      use: { ...devices["Pixel 5"] }
    },
    {
      name: "boss-ops-chromium",
      testMatch: /boss-ops-quotation-data-hygiene\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1"
    ? undefined
    : {
        command: `${JSON.stringify(process.execPath)} node_modules/next/dist/bin/next ${nextServerMode} -H 127.0.0.1 -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
});
