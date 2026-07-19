import { expect, test, type Page } from "@playwright/test";

const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoHorizontalScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 4);
}

test.describe("v11.1 world-class operator flow", () => {
  test.skip(!qaE2EMode, "QA_E2E_MODE is required so collaboration mutations remain local and never touch production.");

  test("latest-first team inbox, collaboration, safe spam controls, operations, and revenue", async ({ page }) => {
    const errors = captureErrors(page);

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "WhatsApp Inbox" })).toBeVisible();
    await expect(page.getByText("Latest chat first · view remembered")).toBeVisible();

    const rows = page.getByTestId("inbox-chat-row");
    await expect(rows.first()).toBeVisible();
    const activityTimes = await rows.evaluateAll((items) => items.map((item) => Date.parse(item.getAttribute("data-last-activity-at") || "")));
    expect(activityTimes.length).toBeGreaterThan(1);
    for (let index = 1; index < activityTimes.length; index += 1) {
      expect(activityTimes[index - 1], `Queue row ${index} must not be older than the row above it.`).toBeGreaterThanOrEqual(activityTimes[index]);
    }

    const team = page.getByTestId("inbox-team-workspace");
    await expect(team).toContainText("Local team mode");
    const existingRelease = team.getByRole("button", { name: "Release", exact: true });
    if (await existingRelease.isVisible().catch(() => false)) {
      await existingRelease.click();
      await expect(team).toContainText("Unassigned team queue");
    }
    await expect(team).toContainText("Assignment only · does not pause bot");
    await team.getByRole("button", { name: "Assign to me" }).click();
    await expect(team).toContainText("Owned by you");
    await expect(team).toContainText("Bot state unchanged");
    await expect(page.getByTestId("inbox-header-automation-control")).toBeVisible();

    await team.getByRole("button", { name: /^Notes/ }).click();
    const note = "QA collaboration note @QA Admin";
    await team.getByPlaceholder("Internal note — use @name to mention…").fill(note);
    await team.getByRole("button", { name: "Add note" }).click();
    await expect(team).toContainText(note);
    await expect(team).toContainText("Internal note added. It was not sent to WhatsApp.");
    await team.getByRole("button", { name: "Release", exact: true }).click();
    await expect(team).toContainText("Unassigned team queue");

    await page.getByRole("button", { name: "Select", exact: true }).click();
    const bulkToolbar = page.getByTestId("inbox-bulk-spam-toolbar");
    await expect(bulkToolbar).toBeVisible();
    await bulkToolbar.getByRole("button", { name: "Select all" }).click();
    await expect(bulkToolbar).toContainText(/\d+ selected/);
    await expect(bulkToolbar.getByRole("button", { name: "Remove spam" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("inbox-layout")).toHaveAttribute("data-mobile-pane", "queue");
    await page.getByTestId("inbox-chat-row").first().getByRole("link", { name: /Open conversation with/ }).click();
    await expect(page.getByTestId("inbox-layout")).toHaveAttribute("data-mobile-pane", "chat");
    await expect(page.getByRole("button", { name: "Back to conversations" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/revenue-intelligence", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Revenue Intelligence" })).toBeVisible();
    await expect(page.getByText("Source → response → appointment → quote → won")).toBeVisible();
    await expect(page.getByText("Conversion funnel")).toBeVisible();
    await expect(page.getByText("Response-time impact")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "World-Class Operations" })).toBeVisible();
    await expect(page.getByText("Production guardrails")).toBeVisible();
    await expect(page.getByText("Safe planner canary")).toBeVisible();

    const canary = await page.request.get("/api/operations/canary");
    expect([200, 503]).toContain(canary.status());
    const canaryBody = await canary.json();
    expect(canaryBody.canary.externalSendAttempted).toBe(false);
    expect(canaryBody.canary.intentEligible).toBe(true);
    expect(canaryBody.canary.safetyPassed).toBe(true);

    expect(errors).toEqual([]);
  });
});
