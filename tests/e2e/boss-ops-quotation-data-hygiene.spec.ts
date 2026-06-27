import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";
const qaRunId = process.env.QA_RUN_ID || process.env.QA_E2E_RUN_ID || `QA_RUN_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = path.join(process.cwd(), "artifacts");
const report = {
  qaRunId,
  routesTested: [] as string[],
  buttonsTested: [] as string[],
  workflows: [] as Array<{ name: string; status: "PASS" | "FAIL"; notes: string[] }>,
  safetyChecks: [] as string[],
  dirtyDataChecks: [] as string[],
  screenshots: [] as string[],
  knownTodos: [] as string[]
};

const isBenignNextDevConsoleError = (text: string) =>
  /Failed to fetch RSC payload/i.test(text) ||
  /Fast Refresh had to perform a full reload/i.test(text);

test.describe("boss ops quotation workflow and data hygiene QA", () => {
  test.skip(!qaE2EMode, "Set QA_E2E_MODE=1 to run safe mock-data workflow E2E tests.");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.afterAll(async () => {
    fs.mkdirSync(artifactDir, { recursive: true });
    const jsonPath = path.join(artifactDir, "e2e-test-report.json");
    const mdPath = path.join(artifactDir, "e2e-test-report.md");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    fs.writeFileSync(
      mdPath,
      [
        `# E2E Test Report`,
        ``,
        `QA run: ${qaRunId}`,
        ``,
        `## Routes Tested`,
        ...report.routesTested.map((item) => `- ${item}`),
        ``,
        `## Buttons Tested`,
        ...report.buttonsTested.map((item) => `- ${item}`),
        ``,
        `## Workflows`,
        ...report.workflows.map((item) => `- ${item.status}: ${item.name}${item.notes.length ? ` (${item.notes.join("; ")})` : ""}`),
        ``,
        `## External Action Safety`,
        ...report.safetyChecks.map((item) => `- ${item}`),
        ``,
        `## Dirty Data Checks`,
        ...report.dirtyDataChecks.map((item) => `- ${item}`),
        ``,
        `## Known TODOs`,
        ...(report.knownTodos.length ? report.knownTodos : ["- None from this QA pass."])
      ].join("\n"),
      "utf8"
    );
  });

  test("route smoke, mobile nav, PWA manifest, and safety posture", async ({ page, request }, testInfo) => {
    const routes = [
      "/",
      "/command-core",
      "/inbox",
      "/followups",
      "/appointments",
      "/sales-pipeline",
      "/leads",
      "/quotation-readiness",
      "/quotations",
      "/approvals",
      "/delivery",
      "/client-files",
      "/sales-collection",
      "/targets",
      "/reports",
      "/settings",
      "/install",
      "/audit-log",
      "/data-hygiene"
    ];

    for (const route of routes) {
      const consoleErrors: string[] = [];
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !/favicon/i.test(text) && !isBenignNextDevConsoleError(text)) {
          consoleErrors.push(text);
        }
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 200, route).toBeLessThan(500);
      await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error|NEXT_NOT_FOUND/i);
      await expect(page.locator("body")).not.toContainText(/quote range|rough estimate|price estimate|free consultation/i);
      expect(consoleErrors, route).toEqual([]);
      report.routesTested.push(route);
    }

    await page.goto("/");
    await expect(page.locator("body")).toContainText("Boss Daily Brief");
    await expect(page.getByTestId("qa-e2e-banner")).toContainText("QA / staging dry-run");
    report.safetyChecks.push("QA/STAGING banner visible in QA_E2E_MODE.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("navigation").last()).toContainText("Today");
    await expect(page.getByRole("navigation").last()).toContainText("Pipeline");
    report.routesTested.push("mobile responsive bottom nav");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect(await manifest.text()).toContain("LIMM Works");
    report.routesTested.push("/manifest.webmanifest");

    const health = await request.get("/api/whatsapp/health");
    expect(health.status()).toBe(200);
    const healthJson = await health.json();
    expect(healthJson.publicAutoReplyRecommended).toBe(false);
    expect(healthJson.calendarAutoBookingEnabled).toBe(false);
    expect(healthJson.priceGuideAutomationEnabled).toBe(false);
    report.routesTested.push("/api/whatsapp/health");
    report.safetyChecks.push("WhatsApp health confirms no public auto-reply recommendation, no calendar auto-booking, and no price-guide automation.");

    await page.screenshot({ path: path.join("screenshots", `${testInfo.project.name}-boss-ops-mobile.png`), fullPage: true });
  });

  test("quotation package workflow creates project, payment schedule, collection, and start gate", async ({ page }) => {
    const quoteFile = {
      name: "QA-LIMM-CONDO-v2.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% QA quotation dry-run\n")
    };

    await page.goto("/leads/qa-lead-condo", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("QA_TEST_LIMM_CONDO");
    await page.locator('input[name="quotation_number"]').fill(`QA-Q-${qaRunId}`);
    await page.locator('input[name="quotation_amount"]').fill("75000");
    await page.locator('textarea[name="scope_summary"]').fill("QA condo renovation with MCST, protection, carpentry, wet works, and delivery start checks.");
    await page.locator('textarea[name="boss_notes"]').fill(`QA_RUN_ID ${qaRunId}. Dry-run quotation package.`);
    await page.locator('input[name="file"]').setInputFiles(quoteFile);
    await page.getByTestId("create-quotation-package").click();
    await page.waitForURL(/\/quotations\/.+created=1/);
    report.buttonsTested.push("Create Quotation Package", "Upload Draft Quotation");

    await expect(page.locator("body")).toContainText("Quotation package created");
    await page.getByTestId("submit-quotation-review").click();
    await expect(page.locator("body")).toContainText("Submitted for Boss Review");
    report.buttonsTested.push("Submit Quotation for Boss Review");

    await page.getByTestId("quotation-action-approve_quote").click();
    await expect(page.locator("body")).toContainText("Boss Approved");
    report.buttonsTested.push("Approve Quote");

    await page.getByTestId("mark-quotation-sent").click();
    await expect(page.locator("body")).toContainText("Sent to Client");
    report.buttonsTested.push("Mark Quotation Sent");

    await page.getByTestId("mark-quote-accepted").click();
    await expect(page.locator("body")).toContainText("Accepted");
    report.buttonsTested.push("Mark Quote Accepted");

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Collection Queue");
    await expect(page.locator("body")).toContainText("Deposit");
    await expect(page.locator("body")).toContainText("Overdue days");
    report.workflows.push({ name: "Normal renovation quotation accepted creates collection queue milestone", status: "PASS", notes: ["Project/payment schedule appears after manual acceptance."] });

    const depositButton = page.getByRole("button", { name: /Record deposit Received/i }).first();
    if (await depositButton.count()) {
      await depositButton.click();
      report.buttonsTested.push("Record Deposit Received");
    }

    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Do Not Start Gate");
    await expect(page.locator("body")).toContainText(/Cannot Start|Can Start/);
    await expect(page.locator("body")).toContainText(/Boss-approved start missing|Scope not confirmed|Condo\/MCST approval missing|Protection not arranged/);
    report.workflows.push({ name: "Do Not Start Gate shows blockers clearly", status: "PASS", notes: ["Start blockers are visible after quote acceptance."] });
  });

  test("boss review negative gates and data hygiene dirty record cleanup", async ({ page }) => {
    await page.goto("/quotations/quote-qa-condo-v1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mark-quotation-sent")).toBeDisabled();
    await expect(page.locator("body")).toContainText("latest active quotation version is not Boss Approved");
    report.workflows.push({ name: "Cannot mark quote sent before boss approval", status: "PASS", notes: [] });

    await page.goto("/data-hygiene", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("QA_TEST_miamamun52582");
    await expect(page.locator("body")).toContainText("QA_TEST_semon");
    await expect(page.locator("body")).toContainText("QA_TEST_Test_approval");
    report.dirtyDataChecks.push("Dirty QA records are visible in Data Hygiene preview.");

    const selector = page.getByTestId("data-hygiene-select-lead-qa-lead-miamamun");
    await selector.check();
    await page.getByTestId("data-hygiene-soft-archive").click();
    await expect(page.locator("body")).toContainText("Data hygiene action recorded");
    report.buttonsTested.push("Data Hygiene preview suspected records", "Soft archive QA/test records");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("QA_TEST_miamamun52582");
    await expect(page.locator("body")).not.toContainText("QA_TEST_semon");
    report.dirtyDataChecks.push("Dirty QA records remain hidden from Boss Daily Brief by default.");

    await page.goto("/audit-log", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/lead_marked_test|lead_archived|data_hygiene/i);
    report.dirtyDataChecks.push("Cleanup action appears in audit log.");
    report.safetyChecks.push("No hard delete action was used during data hygiene cleanup.");
  });
});
