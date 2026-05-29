import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

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
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  },
  projects: [
    {
      name: "desktop-chromium",
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
    }
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1"
    ? undefined
    : {
        command: `${JSON.stringify(process.execPath)} node_modules/next/dist/bin/next dev -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
});
