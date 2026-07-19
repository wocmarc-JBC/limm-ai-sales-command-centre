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

  test("renders private WhatsApp images, documents, and honest unavailable states in chat", async ({ page }) => {
    const errors = captureErrors(page);
    const preview = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='720' height='420'%3E%3Crect width='100%25' height='100%25' fill='%23172028'/%3E%3Cpath d='M80 320l150-160 100 95 75-80 180 145' fill='none' stroke='%2329d17d' stroke-width='18'/%3E%3C/svg%3E";

    await page.route("**/api/inbox/conversations/*", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (!payload?.conversation?.lead?.id) {
        await route.fulfill({ response, json: payload });
        return;
      }
      const existingMessages = Array.isArray(payload.conversation.messages) ? payload.conversation.messages : [];
      const base = existingMessages.find((message: { direction?: string }) => message.direction === "inbound") ?? {
        id: "qa-media-base",
        leadId: payload.conversation.lead.id,
        direction: "inbound",
        channel: "whatsapp",
        body: "",
        safeToSend: false,
        whatsappStatus: "received",
        metadata: {},
        createdAt: "2099-01-01T00:00:00.000Z"
      };
      payload.conversation.messages = [
        ...existingMessages,
        {
          ...base,
          id: "qa-media-image",
          providerMessageId: "qa-media-image-provider",
          body: "[WhatsApp image received]",
          createdAt: "2099-01-01T00:03:00.000Z",
          metadata: { messageType: "image", mimeType: "image/jpeg" },
          attachments: [{
            id: "qa-image-file",
            kind: "image",
            fileName: "WhatsApp image.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 248000,
            fileCategory: "site_photos",
            availability: "ready",
            viewUrl: preview,
            downloadUrl: preview,
            retryable: false
          }]
        },
        {
          ...base,
          id: "qa-media-document",
          providerMessageId: "qa-media-document-provider",
          body: "[WhatsApp document received]",
          createdAt: "2099-01-01T00:02:00.000Z",
          metadata: { messageType: "document", mimeType: "application/pdf", filename: "Floor Plan.pdf" },
          attachments: [{
            id: "qa-document-file",
            kind: "document",
            fileName: "Floor Plan.pdf",
            mimeType: "application/pdf",
            fileSizeBytes: 860000,
            fileCategory: "floor_plan",
            availability: "ready",
            viewUrl: "/health",
            downloadUrl: "/health?download=1",
            retryable: false
          }]
        },
        {
          ...base,
          id: "qa-media-unavailable",
          providerMessageId: "qa-media-unavailable-provider",
          body: "[WhatsApp image received]",
          createdAt: "2099-01-01T00:01:00.000Z",
          metadata: { messageType: "image", mimeType: "image/jpeg" },
          attachments: [{
            id: "qa-unavailable-file",
            kind: "image",
            fileName: "WhatsApp image.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 0,
            fileCategory: "site_photos",
            availability: "unavailable",
            viewUrl: "",
            downloadUrl: "",
            retryable: false
          }]
        }
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    const rows = page.getByTestId("inbox-chat-row");
    await expect(rows.nth(1)).toBeVisible();
    await rows.nth(1).getByRole("link", { name: /Open conversation with/ }).click();
    await expect(page.getByTestId("inbox-image-attachment")).toBeVisible();
    await expect(page.getByTestId("inbox-document-attachment")).toContainText("Floor Plan.pdf");
    await expect(page.getByTestId("inbox-media-unavailable")).toContainText("file could not be retrieved");
    await expect(page.getByText("[WhatsApp image received]", { exact: true })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("inbox-image-attachment")).toBeVisible();
    await expect(page.getByTestId("inbox-document-attachment")).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
