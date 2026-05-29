import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const runId = process.env.V4_2_QA_RUN_ID ?? `v4_3_auth_boss_browser_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const marker = process.env.V4_3_QA_MARKER ?? `v4_3_auth_boss_browser_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const screenshotDir = process.env.V4_2_SCREENSHOT_DIR ?? path.join(process.cwd(), "screenshots", runId);
const summaryDir = process.env.V4_2_QA_SUMMARY_DIR ?? path.join(process.cwd(), "test-results", "v4_2_qa_summary");
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const unsafeCopyPattern = /free consultation|quote range|price range|rough estimate|estimated price|price estimate|package price/i;

type SeededRecords = {
  leadId: string;
  approvalId: string;
  followupId: string;
  readinessId: string;
};

function ensureDirs() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(summaryDir, { recursive: true });
}

function loadPublicEnv() {
  const env = { ...process.env };
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

function record(summary: Record<string, unknown>) {
  ensureDirs();
  fs.appendFileSync(
    path.join(summaryDir, "v4-3-auth-boss-write.jsonl"),
    `${JSON.stringify(summary)}\n`,
    "utf8"
  );
}

async function screenshot(page: Page, projectName: string, name: string) {
  ensureDirs();
  const file = path.join(screenshotDir, `${projectName}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(process.cwd(), file);
}

async function createAuthedSupabase() {
  const { url, anonKey } = loadPublicEnv();
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for v4.3 browser-write QA.");
  if (!email || !password) throw new Error("SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required for v4.3 browser-write QA.");

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const login = await supabase.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(`Supabase test login failed: ${login.error.message}`);
  const profile = await supabase.from("profiles").select("id,email,full_name,role,active").eq("id", login.data.user!.id).single();
  if (profile.error) throw new Error(`Boss test profile read failed: ${profile.error.message}`);
  if (profile.data.role !== "boss" || !profile.data.active) throw new Error("SUPABASE_TEST_EMAIL must belong to an active boss test profile.");
  return supabase;
}

async function insertOrFail<T>(supabase: SupabaseClient, table: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(`${table} seed failed: ${error.message}`);
  return data as T;
}

async function seedTestRecords(supabase: SupabaseClient): Promise<SeededRecords> {
  const leadId = crypto.randomUUID();
  const approvalId = crypto.randomUUID();
  const followupId = crypto.randomUUID();
  const readinessId = crypto.randomUUID();
  const now = new Date().toISOString();

  await insertOrFail(supabase, "leads", {
    id: leadId,
    client_name: `${marker} Lead`,
    phone: "+65_TEST_ONLY",
    email: "",
    source: "v4.3 browser-write QA",
    division: "LIMM Works",
    property_type: "Test-only landed property",
    service_type: "initial_project_review",
    scope_summary: `Test-only browser QA scope ${marker}`,
    lead_score: 12,
    lead_category: "Cold",
    status: "New Enquiry",
    missing_info: ["floor_plan", "site_photos"],
    risk_flags: ["test_only"],
    boss_approval_needed: false,
    appointment_suitable: false,
    appointment_type: "initial_project_review",
    appointment_readiness: 10,
    quotation_readiness_score: 0,
    next_action: "Test-only browser-write QA record. No client action.",
    last_client_message: "Test-only marker. Please request scope, floor plan, and photos.",
    preferred_contact_time: "Test-only",
    created_at: now,
    updated_at: now
  });

  await insertOrFail(supabase, "approval_requests", {
    id: approvalId,
    lead_id: leadId,
    title: `${marker} Approval`,
    request_type: "test_only",
    approval_type: "test_only",
    reason: `Test-only approval request for ${marker}`,
    ai_recommendation: "Test-only internal approval check. No client-facing promise.",
    proposed_reply: "Test-only internal verification. Ask for scope, floor plan, and photos.",
    status: "pending",
    risk_flags: ["test_only"],
    notes: marker,
    requested_at: now,
    created_at: now
  });

  await insertOrFail(supabase, "followups", {
    id: followupId,
    lead_id: leadId,
    followup_type: "test_only",
    template_type: "test_only",
    due_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: "Scheduled",
    suggested_message: `Test-only follow-up ${marker}. Request scope, floor plan, and photos for initial project review.`,
    notes: marker,
    created_at: now
  });

  await insertOrFail(supabase, "quotation_readiness", {
    id: readinessId,
    lead_id: leadId,
    readiness_score: 0,
    missing_info: ["floor_plan", "site_photos"],
    missing_information: ["floor_plan", "site_photos"],
    quote_preparation_checklist: [{ item: "floor_plan", status: "missing" }, { item: "site_photos", status: "missing" }],
    boss_review_required: true,
    status: "collecting_info",
    next_action: `Test-only quotation readiness ${marker}. No pricing.`,
    created_at: now,
    updated_at: now
  });

  return { leadId, approvalId, followupId, readinessId };
}

async function findAuditLog(supabase: SupabaseClient, action: string, entityId: string, metadataMarker?: string) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < 12_000) {
    let query = supabase
      .from("audit_logs")
      .select("id,actor,actor_type,actor_name,actor_email,actor_id,action,entity_type,entity_id,summary,metadata")
      .eq("action", action)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (metadataMarker) {
      query = query.contains("metadata", { marker: metadataMarker });
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      lastError = error.message;
    } else if (data) {
      return { data, error: null };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { data: null, error: lastError ? new Error(lastError) : null };
}

async function expectAuditRecord(supabase: SupabaseClient, action: string, entityId: string, metadataMarker?: string) {
  const { data, error } = await findAuditLog(supabase, action, entityId, metadataMarker);

  expect(error, `${action} audit query should not fail`).toBeFalsy();
  expect(data, `${action} audit log should exist`).toBeTruthy();
  expect(data?.actor || data?.actor_name, `${action} audit actor should be populated`).toBeTruthy();
  expect(data?.actor_id, `${action} audit actor_id should be populated`).toBeTruthy();
  if (metadataMarker) {
    expect(data?.metadata?.marker, `${action} audit metadata marker should match`).toBe(metadataMarker);
  }
}

async function expectAuditLogUi(page: Page, action: string, projectName: string) {
  await page.goto(`/audit-log?action=${encodeURIComponent(action)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(action);
  await expect(page.locator("body")).toContainText(/Marcus|boss|System/i);
  await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  await screenshot(page, projectName, `v4-3-audit-${action}`);
}

async function saveAppointmentSettings(page: Page) {
  await page.locator("form").first().evaluate((form, markerValue) => {
    let input = form.querySelector<HTMLInputElement>('input[name="audit_marker"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "audit_marker";
      form.appendChild(input);
    }
    input.value = markerValue;
  }, marker);
  await page.getByRole("button", { name: "Save Appointment Settings" }).click();
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

async function loginBoss(page: Page, projectName: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Logout")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).toContainText(/boss/i);
  await expect(page.locator("body")).not.toContainText(unsafeCopyPattern);
  return screenshot(page, projectName, "v4-3-login-boss");
}

function recordStep(project: string, step: string, status: "RUNNING" | "PASS" | "FAIL", notes: string[] = []) {
  record({
    project,
    test: "v4.3 authenticated boss-write browser QA",
    marker,
    step,
    status,
    notes
  });
}

async function tracked(project: string, step: string, action: () => Promise<void>) {
  recordStep(project, step, "RUNNING");
  try {
    await action();
    recordStep(project, step, "PASS");
  } catch (error) {
    recordStep(project, step, "FAIL", [error instanceof Error ? error.message : String(error)]);
    throw error;
  }
}

test.describe("v4.3 authenticated boss-write browser QA", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  let supabase: SupabaseClient | null = null;
  let seeded: SeededRecords | null = null;

  test.beforeAll(async () => {
    if (!email || !password) {
      record({
        test: "v4.3 authenticated boss-write browser QA",
        status: "MANUAL REQUIRED",
        notes: ["SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are missing. Password was not printed or stored."]
      });
      return;
    }
    supabase = await createAuthedSupabase();
    seeded = await seedTestRecords(supabase);
  });

  function requireLiveQaReady(projectName: string) {
    if (!email || !password) {
      record({
        project: projectName,
        test: "v4.3 authenticated boss-write browser QA",
        marker,
        step: "credentials",
        status: "MANUAL REQUIRED",
        notes: ["SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required for v4.3 authenticated boss-write QA."]
      });
      test.skip(true, "SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required for v4.3 authenticated boss-write QA.");
    }
    expect(supabase, "Authenticated Supabase client should be ready").toBeTruthy();
    expect(seeded, "Test records should be seeded").toBeTruthy();
    return { supabase: supabase!, seeded: seeded! };
  }

  test.beforeEach(async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    requireLiveQaReady(projectName);
    await tracked(projectName, "login", async () => {
      await loginBoss(page, projectName);
    });
  });

  test("login + appointment settings + audit", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const ready = requireLiveQaReady(projectName);

    await tracked(projectName, "appointment settings write and persistence", async () => {
      await page.goto("/appointment-settings", { waitUntil: "domcontentloaded" });
      const sunday = page.locator('input[name="day_enabled_sunday"]');
      await expect(sunday).toBeVisible();
      await expect(sunday).toBeEnabled();
      const originalSunday = await sunday.isChecked();
      if (originalSunday) {
        await sunday.uncheck();
      } else {
        await sunday.check();
      }
      await saveAppointmentSettings(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(sunday).toBeChecked({ checked: !originalSunday });
      if (originalSunday) {
        await sunday.check();
      } else {
        await sunday.uncheck();
      }
      await saveAppointmentSettings(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(sunday).toBeChecked({ checked: originalSunday });
      await expect(page.locator("body")).toContainText("Sunday is controlled only by this setting");
      await screenshot(page, projectName, "v4-3-appointment-settings-restored");
    });

    await tracked(projectName, "appointment settings audit", async () => {
      await expectAuditRecord(ready.supabase, "appointment_settings_saved", "default", marker);
    });
  });

  test("lead status + audit", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const ready = requireLiveQaReady(projectName);

    await tracked(projectName, "lead status write and persistence", async () => {
      await page.goto(`/leads/${ready.seeded.leadId}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(marker);
      await page.locator('select[name="status"]').selectOption("Follow Up Due");
      await page.getByRole("button", { name: "Save Status" }).click();
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Follow Up Due");
      await expect(page.locator("body")).not.toContainText(unsafeCopyPattern);
      await screenshot(page, projectName, "v4-3-lead-status");
    });

    await tracked(projectName, "lead status audit", async () => {
      await expectAuditRecord(ready.supabase, "lead_status_updated", ready.seeded.leadId);
    });
  });

  test("approval decision + audit", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const ready = requireLiveQaReady(projectName);

    await tracked(projectName, "approval more-info write and persistence", async () => {
      await page.goto("/approvals", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(marker);
      await page.getByTestId(`approval-${ready.seeded.approvalId}`).getByRole("button", { name: "Request More Info" }).click();
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`approval-${ready.seeded.approvalId}`)).toContainText("more_info");
      await screenshot(page, projectName, "v4-3-approval-more-info");
    });

    await tracked(projectName, "approval audit", async () => {
      await expectAuditRecord(ready.supabase, "approval_decision_recorded", ready.seeded.approvalId);
    });
  });

  test("follow-up snooze + audit", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const ready = requireLiveQaReady(projectName);

    await tracked(projectName, "follow-up snooze write and persistence", async () => {
      await page.goto("/followups", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(marker);
      await page.getByTestId(`followup-${ready.seeded.followupId}`).getByRole("button", { name: "Snooze" }).click();
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`followup-${ready.seeded.followupId}`)).toContainText("Snoozed");
      await screenshot(page, projectName, "v4-3-followup-snoozed");
    });

    await tracked(projectName, "follow-up audit", async () => {
      await expectAuditRecord(ready.supabase, "followup_status_updated", ready.seeded.followupId);
    });
  });

  test("quotation readiness + audit", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const ready = requireLiveQaReady(projectName);

    await tracked(projectName, "quotation readiness write and persistence", async () => {
      await page.goto("/quotation-readiness", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(marker);
      await page.getByTestId(`quotation-readiness-${ready.seeded.readinessId}`).getByRole("button", { name: "Ready for Quotation Review" }).click();
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId(`quotation-readiness-${ready.seeded.readinessId}`)).toContainText("Ready For Boss Review");
      await expect(page.locator("body")).not.toContainText(unsafeCopyPattern);
      await screenshot(page, projectName, "v4-3-quotation-readiness");
    });

    await tracked(projectName, "quotation readiness audit", async () => {
      await expectAuditRecord(ready.supabase, "quotation_readiness_updated", ready.seeded.readinessId);
    });
  });

  test("audit-log route + logout/protected route", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    requireLiveQaReady(projectName);

    await tracked(projectName, "audit-log route performance and delete protection", async () => {
      await expectAuditLogUi(page, "quotation_readiness_updated", projectName);
    });

    await tracked(projectName, "logout blocks protected routes", async () => {
      await expect(page.getByText("Logout")).toBeVisible();
      await page.getByText("Logout").click();
      await expect(page.getByText("Logout")).toHaveCount(0);
      await page.goto("/leads", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Login required");
      await expect(page.getByText("Logout")).toHaveCount(0);
      await screenshot(page, projectName, "v4-3-logged-out-protected");
    });

    record({
      project: projectName,
      test: "v4.3 authenticated boss-write browser QA",
      marker,
      status: "PASS",
      buttons: [
        "Sign In",
        "Save Appointment Settings",
        "Save Status",
        "Request More Info",
        "Snooze",
        "Ready for Quotation Review",
        "Logout"
      ],
      forms: [
        "login",
        "appointment settings",
        "lead status",
        "approval decision",
        "follow-up status",
        "quotation readiness"
      ],
      notes: [
        "Spec is split into focused serial tests.",
        "Audit records are polled directly before the audit-log UI route is checked.",
        "Audit actor_id, actor name/type, and marker checks remain strict."
      ]
    });
  });
});
