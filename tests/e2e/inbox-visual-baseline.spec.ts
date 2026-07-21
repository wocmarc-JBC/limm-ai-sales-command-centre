import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";
const evidenceRoot = path.join(
  process.env.V4_2_SCREENSHOT_DIR ?? path.join(process.cwd(), "screenshots", "inbox-visual-evidence"),
  "inbox-visual-baseline"
);

const viewports = [
  { name: "mobile-320-queue", width: 320, height: 740, state: "queue" },
  { name: "mobile-390-actions", width: 390, height: 844, state: "actions" },
  { name: "tablet-900-chat", width: 900, height: 1180, state: "chat" },
  { name: "desktop-1440-details", width: 1440, height: 1000, state: "details" }
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 4);
}

async function settleVisualState(page: Page) {
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

test.describe("operator inbox responsive visual baseline", () => {
  test.skip(!qaE2EMode, "QA_E2E_MODE provides deterministic mock inbox data.");

  test("captures stable queue, action, chat, and details states", async ({ page }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(evidenceRoot, { recursive: true });

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("inbox-layout")).toBeVisible();
      await expect(page.getByTestId("inbox-chat-row").first()).toBeVisible();

      if (viewport.state !== "queue" && viewport.width < 1024) {
        await page.getByTestId("inbox-chat-row").first().getByRole("link", { name: /Open conversation with/ }).click();
        await expect(page.getByTestId("inbox-layout")).toHaveAttribute("data-mobile-pane", "chat");
      }
      if (viewport.state === "actions") {
        await page.getByRole("button", { name: "Conversation actions" }).click();
        await expect(page.getByTestId("inbox-mobile-actions")).toBeVisible();
      }
      if (viewport.state === "details") {
        await page.getByRole("button", { name: "Details", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Conversation details" })).toBeVisible();
      }

      await expectNoHorizontalScroll(page);
      await settleVisualState(page);
      const target = path.join(evidenceRoot, `${viewport.name}.png`);
      await page.screenshot({
        path: target,
        fullPage: false,
        animations: "disabled",
        caret: "hide",
        mask: [page.locator("time"), page.getByTestId("inbox-queue-sync-health"), page.locator('[data-testid="inbox-sla"]')],
        maskColor: "#18202a"
      });
      expect(fs.statSync(target).size, `${viewport.name} must contain meaningful visual evidence.`).toBeGreaterThan(20_000);
    }
  });
});
