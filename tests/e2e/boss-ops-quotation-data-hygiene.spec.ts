import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const qaE2EMode = process.env.QA_E2E_MODE === "true" || process.env.QA_E2E_MODE === "1";
const qaRunId = process.env.QA_RUN_ID || process.env.QA_E2E_RUN_ID || `QA_RUN_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = path.join(process.cwd(), "artifacts");
const quoteFile = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% ${name} QA quotation dry-run\n`)
});
const report = {
  qaRunId,
  runTarget: process.env.PLAYWRIGHT_BASE_URL ? `Preview or remote: ${process.env.PLAYWRIGHT_BASE_URL}` : "Local Next.js dev server",
  dataMode: qaE2EMode ? "QA_E2E_MODE mock data / dry-run external actions" : "Not QA mode",
  routesTested: [] as string[],
  buttonsTested: [] as string[],
  workflows: [] as Array<{ name: string; status: "PASS" | "FAIL"; notes: string[] }>,
  roleTests: [] as Array<{ role: string; status: "PASS" | "FAIL"; notes: string[] }>,
  migrationReadiness: [] as string[],
  safetyChecks: [] as string[],
  dirtyDataChecks: [] as string[],
  skippedTests: [
    "Authenticated live Supabase write/browser specs are skipped unless SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are provided.",
    "Live/staging quotation_packages DB verification is skipped unless SUPABASE_DB_URL or STAGING_SUPABASE_DB_URL is provided to npm run verify:quotation-migration."
  ],
  screenshots: [] as string[],
  knownTodos: [
    "QA Project persona uses viewer-level permissions in QA_E2E_MODE until a dedicated production project role is added to Supabase role constraints.",
    "This Playwright suite runs against mock/QA mode by default; staging Supabase schema readiness is covered by npm run verify:quotation-migration when DB URL is supplied."
  ]
};

const isBenignNextDevConsoleError = (text: string) =>
  /Failed to fetch RSC payload/i.test(text) ||
  /Fast Refresh had to perform a full reload/i.test(text);

async function setQaRole(page: Page, role: "boss" | "admin" | "sales" | "project", showTestDemo = true) {
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "qa_e2e_role", value: role, domain: "localhost", path: "/" },
    { name: "limm_show_test_demo_records", value: showTestDemo ? "1" : "0", domain: "localhost", path: "/" }
  ]);
}

async function createQuoteFromLead(page: Page, leadId: string, quotationNumber: string, amount: string, scope: string) {
  await setQaRole(page, "boss");
  await page.goto(`/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="quotation_number"]').fill(quotationNumber);
  await page.locator('input[name="quotation_amount"]').fill(amount);
  await page.locator('textarea[name="scope_summary"]').fill(scope);
  await page.locator('textarea[name="boss_notes"]').fill(`QA_RUN_ID ${qaRunId}. Dry-run quotation package.`);
  await page.locator('input[name="file"]').setInputFiles(quoteFile(`${quotationNumber}.pdf`));
  await page.getByTestId("create-quotation-package").click();
  await page.waitForURL(/\/quotations\/.+created=1/);
  report.buttonsTested.push("Create Quotation Package", "Upload Draft Quotation");
}

async function uploadRevisedQuote(page: Page, quotationNumber: string, fileName: string) {
  await page.locator('input[name="quotation_number"]').fill(quotationNumber);
  await page.locator('input[name="file"]').setInputFiles(quoteFile(fileName));
  await page.getByTestId("upload-draft-quotation").click();
  await page.waitForTimeout(1000);
  const revisedLink = page.getByRole("link", { name: new RegExp(quotationNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
  await expect(revisedLink).toBeVisible();
  await revisedLink.click();
  await expect(page.locator("body")).toContainText(quotationNumber);
  report.buttonsTested.push("Upload revised quotation v2");
}

async function submitApproveAndSend(page: Page) {
  await page.getByTestId("submit-quotation-review").click();
  await expect(page.locator("body")).toContainText("Submitted for Boss Review");
  report.buttonsTested.push("Submit Quotation for Boss Review");
  await page.getByTestId("quotation-action-approve_quote").click();
  await expect(page.locator("body")).toContainText(/Version \d+ \/ Boss Approved/);
  report.buttonsTested.push("Approve Quote");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("mark-quotation-sent")).toBeEnabled();
  await page.getByTestId("mark-quotation-sent").click();
  await expect(page.locator("body")).toContainText("Sent to Client");
  report.buttonsTested.push("Mark Quotation Sent");
}

async function submitAndApprove(page: Page) {
  await page.getByTestId("submit-quotation-review").click();
  await expect(page.locator("body")).toContainText("Submitted for Boss Review");
  report.buttonsTested.push("Submit Quotation for Boss Review");
  await page.getByTestId("quotation-action-approve_quote").click();
  await expect(page.locator("body")).toContainText(/Version \d+ \/ Boss Approved/);
  report.buttonsTested.push("Approve Quote");
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function markQuoteAccepted(page: Page) {
  await page.getByTestId("mark-quote-accepted").click();
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(/Version \d+ \/ Accepted/);
  report.buttonsTested.push("Mark Quote Accepted");
}

function addMigrationReadinessToReport() {
  const order = fs.readFileSync(path.join(process.cwd(), "supabase", "MIGRATION_ORDER.md"), "utf8");
  const migration = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "024_quotation_packages.sql"), "utf8");
  expect(order).toContain("024_quotation_packages.sql");
  expect(migration).toMatch(/create table if not exists quotation_packages/i);
  expect(migration).toMatch(/alter table quotation_packages enable row level security/i);
  expect(migration).toMatch(/quotation packages authenticated read/i);
  expect(migration).toMatch(/quotation packages authenticated write/i);
  for (const column of ["lead_id", "quotation_number", "version_number", "status", "file_id", "storage_path", "approved_at", "sent_at", "accepted_at", "voided_at"]) {
    expect(migration).toContain(column);
  }
  report.migrationReadiness.push("024_quotation_packages.sql is listed in MIGRATION_ORDER.md.");
  report.migrationReadiness.push("Local migration DDL includes quotation_packages table, required workflow columns, RLS enablement, and read/write policies.");
  report.migrationReadiness.push("Live/staging command added: npm run verify:quotation-migration with SUPABASE_DB_URL or STAGING_SUPABASE_DB_URL.");
}

test.describe("boss ops quotation workflow and data hygiene QA", () => {
  test.skip(!qaE2EMode, "Set QA_E2E_MODE=1 to run safe mock-data workflow E2E tests.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.afterAll(async () => {
    fs.mkdirSync(artifactDir, { recursive: true });
    const jsonPath = path.join(artifactDir, "e2e-test-report.json");
    const mdPath = path.join(artifactDir, "e2e-test-report.md");
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      mdPath,
      [
        `# E2E Test Report`,
        ``,
        `QA run: ${qaRunId}`,
        `Run target: ${report.runTarget}`,
        `Data mode: ${report.dataMode}`,
        ``,
        `## Routes Tested`,
        ...report.routesTested.map((item) => `- ${item}`),
        ``,
        `## Buttons Tested`,
        ...[...new Set(report.buttonsTested)].map((item) => `- ${item}`),
        ``,
        `## Workflows`,
        ...report.workflows.map((item) => `- ${item.status}: ${item.name}${item.notes.length ? ` (${item.notes.join("; ")})` : ""}`),
        ``,
        `## Role Tests`,
        ...report.roleTests.map((item) => `- ${item.status}: ${item.role}${item.notes.length ? ` (${item.notes.join("; ")})` : ""}`),
        ``,
        `## Migration Readiness`,
        ...report.migrationReadiness.map((item) => `- ${item}`),
        ``,
        `## External Action Safety`,
        ...report.safetyChecks.map((item) => `- ${item}`),
        ``,
        `## Dirty Data Checks`,
        ...report.dirtyDataChecks.map((item) => `- ${item}`),
        ``,
        `## Skipped Tests`,
        ...report.skippedTests.map((item) => `- ${item}`),
        ``,
        `## Known Limitations`,
        ...report.knownTodos.map((item) => `- ${item}`)
      ].join("\n") + "\n",
      "utf8"
    );
  });

  test("route smoke, mobile nav, PWA manifest, health, and migration readiness", async ({ page, request }, testInfo) => {
    addMigrationReadinessToReport();
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

  test("normal condo quotation workflow creates project, collection, and start gate", async ({ page }) => {
    await createQuoteFromLead(page, "qa-lead-condo", `QA-Q-CONDO-${qaRunId}`, "75000", "QA condo renovation with MCST, protection, carpentry, wet works, and delivery start checks.");
    await submitApproveAndSend(page);
    await markQuoteAccepted(page);

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Collection Queue");
    await expect(page.locator("body")).toContainText("Deposit");
    await expect(page.locator("body")).toContainText("Overdue days");
    report.workflows.push({ name: "Normal condo quotation accepted creates project/payment schedule", status: "PASS", notes: ["Project/payment schedule appears after manual acceptance."] });

    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Do Not Start Gate");
    await expect(page.locator("body")).toContainText(/Condo\/MCST approval missing|Protection not arranged/);
    report.workflows.push({ name: "Do Not Start Gate shows blockers clearly", status: "PASS", notes: ["Condo start blockers are visible after quote acceptance."] });
  });

  test("landed A&A workflow requires boss review, site visit first, audit, v2 approval, and manual send", async ({ page }) => {
    await page.goto("/leads/qa-lead-landed-aa", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("QA_TEST_LANDED_AA");
    await expect(page.locator("body")).toContainText(/structural|wall hacking|roof|drainage|high-value/i);
    await createQuoteFromLead(page, "qa-lead-landed-aa", `QA-Q-LANDED-${qaRunId}`, "180000", "QA landed A&A with structural, waterproofing, wall hacking, roof and drainage risk.");
    await page.getByTestId("submit-quotation-review").click();
    await page.getByTestId("quotation-action-need_site_visit_first").click();
    await expect(page.locator("body")).toContainText("Revision Requested");
    report.buttonsTested.push("Need Site Visit First");

    const revisionSourceUrl = page.url();
    await page.goto("/audit-log", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/quotation_site_visit_required|site visit/i);

    await page.goto(revisionSourceUrl, { waitUntil: "domcontentloaded" });
    await uploadRevisedQuote(page, `QA-Q-LANDED-V2-${qaRunId}`, "QA-Q-LANDED-v2.pdf");
    await submitApproveAndSend(page);
    report.workflows.push({ name: "Landed/A&A site-visit-first workflow", status: "PASS", notes: ["Risk badge shown; site visit action audited; revised quote manually sent after boss approval."] });
  });

  test("JBC carpentry workflow creates 50/40/10 schedule and deposit blocks start until received", async ({ page }) => {
    await createQuoteFromLead(page, "qa-lead-jbc-carpentry", `QA-Q-JBC-${qaRunId}`, "30000", "QA JBC carpentry package with wardrobe, kitchen cabinets, and shoe cabinet.");
    await submitApproveAndSend(page);
    await markQuoteAccepted(page);

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("QA_TEST_JBC_CARPENTRY");
    await expect(page.locator("body")).toContainText(/15,000|15000/);
    await expect(page.locator("body")).toContainText(/12,000|12000/);
    await expect(page.locator("body")).toContainText(/3,000|3000/);

    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    const jbcCard = page.locator("article").filter({ hasText: "QA_TEST_JBC_CARPENTRY" }).first();
    await expect(jbcCard).toContainText("Deposit not received");

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid^="record-deposit-received-payment-project-qa-lead-jbc-carpentry-deposit-"]').first().click();
    report.buttonsTested.push("Record Deposit Received");
    await page.locator('[data-testid^="record-progress-received-payment-project-qa-lead-jbc-carpentry-progress-"]').first().click();
    await page.locator('[data-testid^="record-final-received-payment-project-qa-lead-jbc-carpentry-final-"]').first().click();
    report.buttonsTested.push("Record progress payment", "Record final payment");

    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("article").filter({ hasText: "QA_TEST_JBC_CARPENTRY" }).first()).not.toContainText("Deposit not received");
    report.workflows.push({ name: "JBC carpentry 50/40/10 and deposit blocker", status: "PASS", notes: ["Deposit/progress/final milestones created; deposit receipt clears deposit blocker."] });
  });

  test("condo workflow updates MCST and protection blockers", async ({ page }) => {
    await setQaRole(page, "boss");
    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    const condoCard = page.locator("article").filter({ hasText: "QA_TEST_CONDO_MCST" }).first();
    await expect(condoCard).toContainText("Condo/MCST approval missing");
    await expect(condoCard).toContainText("Protection not arranged");
    await page.getByTestId("confirm-mcst_approval_confirmed-project-qa-lead-condo-mcst").click();
    await expect(condoCard).not.toContainText("Condo/MCST approval missing");
    await page.getByTestId("confirm-protection_arranged-project-qa-lead-condo-mcst").click();
    await expect(condoCard).not.toContainText("Protection not arranged");
    report.buttonsTested.push("Confirm MCST approval", "Confirm protection arranged");
    await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    const updatedCondoCard = page.locator("article").filter({ hasText: "QA_TEST_CONDO_MCST" }).first();
    await expect(updatedCondoCard).not.toContainText("Condo/MCST approval missing");
    await expect(updatedCondoCard).not.toContainText("Protection not arranged");
    report.workflows.push({ name: "Condo MCST/protection start blockers", status: "PASS", notes: ["MCST and protection confirmations update the Do Not Start Gate."] });
  });

  test("revision workflow approves v2 only after v1 revision request", async ({ page }) => {
    await createQuoteFromLead(page, "qa-lead-revision", `QA-Q-REV-V1-${qaRunId}`, "42000", "QA revision workflow v1.");
    await page.getByTestId("submit-quotation-review").click();
    await page.getByTestId("quotation-action-request_revision").click();
    await expect(page.locator("body")).toContainText("Revision Requested");
    report.buttonsTested.push("Request Revision");
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('textarea[name="boss_notes"]').fill("QA revised v2 after boss request.");
    await uploadRevisedQuote(page, `QA-Q-REV-V2-${qaRunId}`, "QA-Q-REV-v2.pdf");
    await submitApproveAndSend(page);
    report.workflows.push({ name: "Revision v1 to approved v2", status: "PASS", notes: ["v1 requested revision; v2 submitted, approved, and manually marked sent."] });
  });

  test("role permissions block sales/project approval and allow boss/admin approval", async ({ page }) => {
    await setQaRole(page, "sales");
    await page.goto("/quotations/quote-qa-role-v1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quotation-action-approve_quote")).toBeDisabled();
    report.roleTests.push({ role: "QA Sales", status: "PASS", notes: ["Approve Quote is disabled."] });

    await setQaRole(page, "project");
    await page.goto("/quotations/quote-qa-role-v1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quotation-action-approve_quote")).toBeDisabled();
    report.roleTests.push({ role: "QA Project", status: "PASS", notes: ["Project persona uses viewer-level permission and cannot approve."] });

    await setQaRole(page, "admin");
    await page.goto("/quotations/quote-qa-role-v1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quotation-action-approve_quote")).toBeEnabled();
    report.roleTests.push({ role: "QA Admin", status: "PASS", notes: ["Approve Quote is enabled."] });

    await setQaRole(page, "boss", false);
    await page.goto("/quotations/quote-qa-role-v1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("quotation-action-approve_quote").click();
    await expect(page.locator("body")).toContainText("Boss Approved");
    report.roleTests.push({ role: "QA Boss", status: "PASS", notes: ["Boss approved a submitted quotation package."] });
  });

  test("client rejected quote does not create project or payment schedule", async ({ page }) => {
    await createQuoteFromLead(page, "qa-lead-rejected", `QA-Q-REJECT-HOLD-${qaRunId}`, "28000", "QA reject/hold coverage quotation.");
    await page.getByTestId("submit-quotation-review").click();
    await page.getByTestId("quotation-action-ask_for_more_info").click();
    await expect(page.locator("body")).toContainText("Revision Requested");
    report.buttonsTested.push("Ask For More Info");
    await page.reload({ waitUntil: "domcontentloaded" });
    await uploadRevisedQuote(page, `QA-Q-REJECT-V2-${qaRunId}`, "QA-Q-REJECT-v2.pdf");
    await page.getByTestId("submit-quotation-review").click();
    await page.getByTestId("quotation-action-reject_hold").click();
    await expect(page.locator("body")).toContainText("Rejected / Hold");
    report.buttonsTested.push("Reject / Hold");
    await page.reload({ waitUntil: "domcontentloaded" });

    await uploadRevisedQuote(page, `QA-Q-CLIENT-REJECT-${qaRunId}`, "QA-Q-CLIENT-REJECT.pdf");
    await submitAndApprove(page);
    await page.getByTestId("mark-quote-rejected").click();
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Client Rejected");
    report.buttonsTested.push("Mark Client Rejected");

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("QA_TEST_CLIENT_REJECTED");
    report.workflows.push({ name: "Client rejected quote creates no project/payment schedule", status: "PASS", notes: ["Manual rejection recorded; collection queue remains clean."] });
  });

  test("boss review negative gates and data hygiene dirty record cleanup/restore", async ({ page }) => {
    await setQaRole(page, "boss", false);
    await page.goto("/quotations/quote-qa-condo-v1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mark-quotation-sent")).toBeDisabled();
    await expect(page.locator("body")).toContainText("latest active quotation version is not Boss Approved");
    report.workflows.push({ name: "Cannot mark quote sent before boss approval", status: "PASS", notes: [] });

    await page.goto("/sales-collection", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("QA_TEST_DEMO_SERENE_ONG");
    report.dirtyDataChecks.push("Serene-like fake/demo unlinked payment is hidden from Collection Queue by default.");

    await page.goto("/data-hygiene", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("QA_TEST_miamamun52582");
    await expect(page.locator("body")).toContainText("QA_TEST_semon");
    await expect(page.locator("body")).toContainText("QA_TEST_Test_approval");
    await expect(page.locator("body")).toContainText("QA_TEST_DEMO_SERENE_ONG");
    report.dirtyDataChecks.push("Dirty QA records are visible in Data Hygiene preview.");

    const selector = page.getByTestId("data-hygiene-select-lead-qa-lead-miamamun");
    await selector.check();
    await page.getByTestId("data-hygiene-soft-archive").click();
    await expect(page.locator("body")).toContainText("Data hygiene action recorded");
    report.buttonsTested.push("Data Hygiene preview suspected records", "Soft archive QA/test records");

    await page.getByTestId("data-hygiene-select-lead-qa-lead-miamamun").check();
    await page.getByTestId("data-hygiene-restore").click();
    await expect(page.locator("body")).toContainText("Data hygiene action recorded");
    report.buttonsTested.push("Restore wrongly flagged data-hygiene record");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("QA_TEST_miamamun52582");
    await expect(page.locator("body")).not.toContainText("QA_TEST_semon");
    report.dirtyDataChecks.push("Dirty QA records remain hidden from Boss Daily Brief by default after restore review because they remain marked test/demo.");

    await page.goto("/audit-log", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/lead_marked_test|lead_archived|data_hygiene|restored/i);
    report.dirtyDataChecks.push("Cleanup and restore actions appear in audit log.");
    report.safetyChecks.push("No hard delete action was used during data hygiene cleanup.");
  });
});
