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
    expect((await page.getByPlaceholder("Search").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await page.getByTestId("inbox-chat-row").first().getByTestId("inbox-mark-spam").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.getByTestId("inbox-chat-row").first().getByRole("link", { name: /Open conversation with/ }).click();
    await expect(page.getByTestId("inbox-layout")).toHaveAttribute("data-mobile-pane", "chat");
    await expect(page.getByRole("button", { name: "Back to conversations" })).toBeVisible();
    const mobileActionsTrigger = page.getByRole("button", { name: "Conversation actions" });
    await expect(mobileActionsTrigger).toBeVisible();
    expect((await mobileActionsTrigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await mobileActionsTrigger.click();
    const mobileActions = page.getByTestId("inbox-mobile-actions");
    await expect(mobileActions.getByRole("button", { name: "Conversation details" })).toBeVisible();
    await expect(mobileActions.getByRole("link", { name: "Open full lead" })).toBeVisible();
    await expect(page.getByTestId("inbox-mobile-automation-control")).toBeVisible();
    await mobileActions.getByRole("button", { name: "Conversation details" }).click();
    await expect(page.getByRole("dialog", { name: "Conversation details" })).toBeVisible();
    await page.getByRole("button", { name: "Close conversation details" }).click();
    await expect(mobileActionsTrigger).toBeFocused();
    const mobileTeamButtons = page.getByTestId("inbox-team-workspace").getByRole("button");
    const mobileTeamButtonHeights = await mobileTeamButtons.evaluateAll((buttons) => buttons
      .filter((button) => window.getComputedStyle(button).display !== "none")
      .map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...mobileTeamButtonHeights)).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(mobileActionsTrigger).toBeVisible();
    const narrowTeamWidth = await page.getByTestId("inbox-team-workspace").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(narrowTeamWidth.scrollWidth).toBeLessThanOrEqual(narrowTeamWidth.clientWidth + 1);
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
    let hydrationFetchCount = 0;

    await page.route("**/api/inbox/conversations/*", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (!payload?.conversation?.lead?.id) {
        await route.fulfill({ response, json: payload });
        return;
      }
      hydrationFetchCount += 1;
      const hydrated = hydrationFetchCount > 2;
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
          id: "qa-media-hydration",
          providerMessageId: "qa-media-hydration-provider",
          body: "[WhatsApp image received]",
          createdAt: "2099-01-01T00:05:00.000Z",
          metadata: { messageType: "image", mimeType: "image/jpeg" },
          attachments: [{
            id: hydrated ? "qa-hydrated-image-file" : "missing-qa-media-hydration",
            kind: "image",
            fileName: hydrated ? "Hydrated site photo.jpg" : "WhatsApp image.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: hydrated ? 193000 : 0,
            fileCategory: "site_photos",
            availability: hydrated ? "ready" : "unavailable",
            viewUrl: hydrated ? preview : "",
            downloadUrl: hydrated ? preview : "",
            retryable: false
          }]
        },
        {
          ...base,
          id: "qa-mobile-readable-client-text",
          providerMessageId: "qa-mobile-readable-client-text-provider",
          body: "Client mobile readability check: I need help reviewing the kitchen scope and floor plan.",
          createdAt: "2099-01-01T00:04:00.000Z",
          metadata: { messageType: "text" },
          attachments: []
        },
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
    await expect.poll(() => hydrationFetchCount, { timeout: 8_000 }).toBeGreaterThanOrEqual(3);
    await expect(page.getByText("Hydrated site photo.jpg")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("inbox-image-attachment")).toHaveCount(2);
    await expect(page.getByTestId("inbox-document-attachment")).toContainText("Floor Plan.pdf");
    await expect(page.getByTestId("inbox-media-unavailable")).toContainText("no retrievable file is available");
    await expect(page.getByText("[WhatsApp image received]", { exact: true })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("inbox-image-attachment").first()).toBeVisible();
    await expect(page.getByTestId("inbox-document-attachment")).toBeVisible();
    const messagePane = page.getByTestId("inbox-message-pane");
    await messagePane.evaluate((element) => element.scrollTo({ top: 0, behavior: "auto" }));
    const readableClientText = page.getByText("Client mobile readability check: I need help reviewing the kitchen scope and floor plan.", { exact: true });
    await expect(readableClientText).toBeVisible();
    const mobileReadability = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>("[data-testid='inbox-message-pane']");
      const chat = document.querySelector<HTMLElement>("[data-testid='inbox-active-chat']");
      const team = document.querySelector<HTMLElement>("[data-testid='inbox-team-workspace']");
      const brief = document.querySelector<HTMLElement>("[data-testid='inbox-operator-brief']");
      const composer = document.querySelector<HTMLElement>("[data-testid='inbox-sticky-composer']");
      const clientBody = Array.from(document.querySelectorAll<HTMLElement>("[data-message-direction='inbound'] p"))
        .find((element) => element.textContent?.startsWith("Client mobile readability check:"));
      const style = clientBody ? window.getComputedStyle(clientBody) : null;
      return {
        paneHeight: pane?.getBoundingClientRect().height ?? 0,
        chatHeight: chat?.getBoundingClientRect().height ?? 0,
        teamHeight: team?.getBoundingClientRect().height ?? 0,
        briefHeight: brief?.getBoundingClientRect().height ?? 0,
        composerHeight: composer?.getBoundingClientRect().height ?? 0,
        clientFontSize: style ? Number.parseFloat(style.fontSize) : 0,
        clientLineHeight: style ? Number.parseFloat(style.lineHeight) : 0
      };
    });
    expect(mobileReadability.paneHeight).toBeGreaterThanOrEqual(300);
    expect(mobileReadability.paneHeight / mobileReadability.chatHeight).toBeGreaterThanOrEqual(0.45);
    expect(mobileReadability.teamHeight).toBeLessThanOrEqual(56);
    expect(mobileReadability.briefHeight).toBeLessThanOrEqual(50);
    expect(mobileReadability.composerHeight).toBeLessThanOrEqual(112);
    expect(mobileReadability.clientFontSize).toBeGreaterThanOrEqual(16);
    expect(mobileReadability.clientLineHeight).toBeGreaterThanOrEqual(26);
    await messagePane.evaluate((element) => element.scrollTo({ top: Math.min(500, element.scrollHeight), behavior: "auto" }));
    const jumpToLatest = page.getByTestId("inbox-jump-to-latest");
    await expect(jumpToLatest).toBeVisible();
    expect((await jumpToLatest.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await jumpToLatest.click();
    await expect.poll(() => messagePane.evaluate((element) => element.scrollTop)).toBeLessThan(10);
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test("blocks closed-window free-form sends and records Marcus AI review without messaging the client", async ({ page }) => {
    const errors = captureErrors(page);
    let qualityPayload: Record<string, unknown> | null = null;
    let inboxSendRequests = 0;

    await page.route("**/api/inbox/send", async (route) => {
      inboxSendRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
    });
    await page.route("**/api/inbox/team/*", async (route) => {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        if (payload.action === "quality_feedback") {
          qualityPayload = payload;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, decision: payload.decision }) });
          return;
        }
      }
      await route.continue();
    });
    await page.route("**/api/inbox/conversations/*", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const conversation = payload?.conversation;
      if (!conversation?.lead?.id) {
        await route.fulfill({ response, json: payload });
        return;
      }
      conversation.serviceWindow = {
        status: "closed",
        canSendFreeform: false,
        providerOpenedAt: "2026-07-18T00:00:00.000Z",
        expiresAt: "2026-07-19T00:00:00.000Z",
        remainingSeconds: 0,
        reason: "expired"
      };
      conversation.messages = [
        ...(Array.isArray(conversation.messages) ? conversation.messages : []),
        {
          id: "11111111-1111-4111-8111-111111111111",
          leadId: conversation.lead.id,
          direction: "outbound",
          channel: "whatsapp",
          body: "Thanks for sharing. Could you send the floor plan when convenient?",
          safeToSend: true,
          providerMessageId: "wamid.qa.ai-review",
          providerTimestamp: null,
          whatsappStatus: "sent",
          metadata: {
            aiGeneratedReply: true,
            aiQualityEventId: "22222222-2222-4222-8222-222222222222"
          },
          createdAt: "2099-01-01T00:00:00.000Z"
        }
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    const rows = page.getByTestId("inbox-chat-row");
    await expect(rows.nth(1)).toBeVisible();
    await rows.nth(1).getByRole("link", { name: /Open conversation with/ }).click();

    const windowStatus = page.getByTestId("whatsapp-service-window-status");
    await expect(windowStatus).toHaveAttribute("data-window-status", "closed");
    await expect(windowStatus).toContainText("24-hour reply window is closed");
    await expect(page.locator("#manual_reply_body")).toBeDisabled();

    await page.getByRole("button", { name: "Review AI" }).click();
    const review = page.getByTestId("inbox-ai-reply-review");
    await expect(review.getByRole("button", { name: "Good" })).toBeVisible();
    await expect(review.getByRole("button", { name: "Wrong" })).toBeVisible();
    await expect(review.getByRole("button", { name: "Edited" })).toBeVisible();
    await review.getByRole("button", { name: "Good" }).click();
    await expect(page.getByTestId("inbox-team-workspace")).toContainText("Nothing was sent to the client");

    expect(qualityPayload).toMatchObject({
      action: "quality_feedback",
      decision: "accepted",
      messageId: "11111111-1111-4111-8111-111111111111",
      qualityEventId: "22222222-2222-4222-8222-222222222222"
    });
    expect(inboxSendRequests).toBe(0);
    expect(errors).toEqual([]);
  });
});
