import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

const allPaths = walk(root);
const relativePaths = allPaths.map((file) => path.relative(root, file));

for (const required of [
  "README.md",
  "AGENTS.md",
  "V3_0_BUILD_REPORT.md",
  "CURRENT_STATUS.md",
  "OPEN_ISSUES.md",
  "NEXT_STEPS_FOR_CHATGPT.md",
  "V3_1_SUPABASE_LAYER_REPORT.md",
  "V3_2_SUPABASE_AUTH_RLS_REPORT.md",
  "V3_3_LIVE_SUPABASE_VERIFICATION_REPORT.md",
  "V3_4_LIVE_SUPABASE_RESULT_REPORT.md",
  "V3_4A_REVIEW_ROUTE_UI_FIX_REPORT.md",
  "V4_0_LAUNCH_CANDIDATE_REPORT.md",
  "V4_1_DEV_BRAIN_QA_SYSTEM_REPORT.md",
  "V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md",
  "V4_6_OPENAI_BRAIN_DRY_RUN_REPORT.md",
  "V4_7_OPENAI_DRY_RUN_BOSS_REVIEW_UX_REPORT.md",
  "V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md",
  "V4_8_WHATSAPP_LIVE_DIAGNOSTIC_FIX_REPORT.md",
  "V4_8_WHATSAPP_LIVE_MODE_ENABLE_REPORT.md",
  "V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md",
  "V4_10_WHATSAPP_LIVE_PASS_REPORT.md",
  "V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md",
  "V5_2_WHATSAPP_QUESTION_BANK_REPORT.md",
  "V5_3_WHATSAPP_REPLY_COACH_REPORT.md",
  "V6_ULTIMATE_SALES_COMMAND_CENTRE_REPORT.md",
  "docs/V6_1_UI_POLISH_TEST_CLEANUP.md",
  "docs/V5_3_1_MULTI_INTENT_LEAD_CONTEXT_PORTFOLIO.md",
  "docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md",
  "docs/V6_HUMAN_LIKE_SALES_BRAIN.md",
  "docs/V6_ULTIMATE_BLUEPRINT.md",
  "docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md",
  "reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md",
  "reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md",
  "reports/V6_ULTIMATE_DEEP_QA_REPORT.md",
  "reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md",
  "CALENDAR_BOOKING_SETUP_GUIDE.md",
  "CALENDAR_BOOKING_SAFETY_RULES.md",
  "WHATSAPP_QUESTION_BANK_PLAYBOOK.md",
  "WHATSAPP_REPLY_COACH_PLAYBOOK.md",
  "WHATSAPP_NO_SILENCE_REPLY_RELIABILITY_RULES.md",
  "WHATSAPP_LIVE_INCIDENT_PLAYBOOK.md",
  "WHATSAPP_LIVE_TEST_SETUP_GUIDE.md",
  "WHATSAPP_EMERGENCY_OFF_GUIDE.md",
  "WHATSAPP_AUTO_REPLY_SAFETY_RULES.md",
  "PRODUCTION_ENV_VARS_CHECKLIST.md",
  "VERCEL_DEPLOYMENT_GUIDE.md",
  "META_WHATSAPP_WEBHOOK_LIVE_SETUP.md",
  "DEV_BRAIN_AUTOFIX_POLICY.md",
  "DEV_BRAIN_QA_REPORT.md",
  "CHATGPT_REVIEW_ROUTE_REPORT.md",
  "CHATGPT_HANDOFF_REPORT.md",
  "PROJECT_LAUNCH_AUDIT_NOTES.md",
  "LAUNCH_CHECKLIST.md",
  "GO_LIVE_MANUAL_STEPS.md",
  "BACKUP_AND_RECOVERY_GUIDE.md",
  "LIVE_SUPABASE_SETUP_GUIDE.md",
  "RLS_VERIFICATION_NOTES.md",
  ".env.example",
  "app/login/page.tsx",
  "app/review-chatgpt-ui/page.tsx",
  "app/page.tsx",
  "components/ShellChrome.tsx",
  "components/auth/AuthGate.tsx",
  "components/auth/LoginForm.tsx",
  "components/auth/LogoutButton.tsx",
  "lib/auth/roles.ts",
  "lib/auth/session.ts",
  "lib/appointment-engine.ts",
  "lib/quotation-readiness.ts",
  "lib/ai-decision-schema.ts",
  "lib/ai-dry-run.ts",
  "lib/openai-brain-config.ts",
  "lib/whatsapp-config.ts",
  "lib/whatsapp-parser.ts",
  "lib/whatsapp-safety.ts",
  "lib/whatsapp-auto-reply.ts",
  "lib/whatsapp-sales-brain.ts",
  "lib/whatsapp-question-bank.ts",
  "lib/whatsapp-reply-coach.ts",
  "lib/whatsapp-reply-decision.ts",
  "lib/whatsapp-multi-intent.ts",
  "lib/whatsapp-lead-context.ts",
  "lib/handoff-email.ts",
  "lib/whatsapp-v6/types.ts",
  "lib/whatsapp-v6/message-understanding.ts",
  "lib/whatsapp-v6/singapore-renovation-language.ts",
  "lib/whatsapp-v6/context-truth-gate.ts",
  "lib/whatsapp-v6/reply-planner.ts",
  "lib/whatsapp-v6/natural-reply-composer.ts",
  "lib/whatsapp-v6/safety-governor.ts",
  "lib/whatsapp-v6/reply-quality-judge.ts",
  "lib/whatsapp-v6/sales-brain.ts",
  "lib/sales-control.ts",
  "lib/sales-learning.ts",
  "lib/openai-whatsapp-config.ts",
  "lib/calendar-config.ts",
  "lib/calendar-booking.ts",
  "lib/review-route.ts",
  "lib/data/supabase-client.ts",
  "lib/data/supabase-admin.ts",
  "lib/data/supabase-server.ts",
  "lib/data/supabase-browser.ts",
  "lib/data/leads-repository.ts",
  "lib/data/ai-decisions-repository.ts",
  "lib/data/appointment-settings-repository.ts",
  "lib/data/approvals-repository.ts",
  "lib/data/followups-repository.ts",
  "lib/data/quotation-repository.ts",
  "lib/data/audit-repository.ts",
  "lib/data/settings-repository.ts",
  "lib/data/lead-messages-repository.ts",
  "app/api/whatsapp/webhook/route.ts",
  "app/api/whatsapp/health/route.ts",
  "app/api/whatsapp/debug-parse/route.ts",
  "scripts/test_v3_supabase_layer.mjs",
  "scripts/test_v3_auth_rls_static.mjs",
  "scripts/test_v3_live_setup_static.mjs",
  "scripts/test_v3_review_route_static.mjs",
  "scripts/test_v4_launch_candidate.mjs",
  "scripts/doctor.mjs",
  "scripts/export_mock_data.mjs",
  "scripts/print_live_supabase_setup_checklist.mjs",
  "scripts/verify_live_supabase_schema.mjs",
  "scripts/verify_live_authenticated_actions.mjs",
  "supabase/seed.sql",
  "supabase/MIGRATION_ORDER.md",
  "supabase/bootstrap_profiles.sql",
  "supabase/migrations/001_profiles.sql",
  "supabase/migrations/016_v3_2_auth_rls.sql",
  "supabase/migrations/017_v3_4_audit_log_actor_compatibility.sql",
  "supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql",
  "START_LIMM_SALES_APP.bat",
  "START_LIMM_SALES_APP.ps1",
  "CREATE_CHATGPT_HANDOFF_REPORT.bat",
  "CREATE_CHATGPT_HANDOFF_REPORT.ps1",
  "playwright.config.ts",
  "tests/e2e/review-route.spec.ts",
  "tests/e2e/protected-routes.spec.ts",
  "tests/e2e/login.spec.ts",
  "tests/e2e/authenticated-boss.spec.ts",
  "tests/e2e/route-checks.spec.ts",
  "tests/e2e/v4-2-human-browser.spec.ts",
  "scripts/run_playwright_if_available.mjs",
  "scripts/dev_brain_qa.mjs",
  "scripts/dev_brain_route_probe.mjs",
  "scripts/generate_v4_2_browser_report.mjs",
  "scripts/generate_dev_brain_report.mjs",
  "scripts/generate_chatgpt_handoff_report.mjs",
  "scripts/cleanup_generated_artifacts.mjs",
  "scripts/test_v4_1_dev_brain_static.mjs",
  "scripts/test_v4_6_openai_dry_run.mjs",
  "scripts/test_v4_7_openai_boss_review_ux.mjs",
  "scripts/test_v4_8_whatsapp_closed_test.mjs",
  "scripts/test_v4_8_live_diagnostics_static.mjs",
  "scripts/test_whatsapp_adapter_payload_shape.mjs",
  "scripts/test_v4_8_whatsapp_live_payload.mjs",
  "scripts/check_v4_8_vercel_whatsapp_health.mjs",
  "scripts/test_v4_9_deployment_readiness.mjs",
  "scripts/test_v5_whatsapp_sales_brain_calendar.mjs",
  "scripts/test_v5_2_whatsapp_question_bank.mjs",
  "scripts/test_v5_3_whatsapp_reply_coach_replay.mjs",
  "scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs",
  "scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs",
  "scripts/test_v6_human_like_sales_brain_deep_qa.mjs",
  "scripts/test_v6_ultimate_deep_qa.mjs",
  "scripts/test_v6_1_ui_polish_cleanup.mjs",
  "scripts/cleanup_old_test_leads_v6_1.mjs",
  "supabase/migrations/018_v4_8_whatsapp_closed_test.sql",
  "supabase/migrations/019_v6_ultimate_command_centre.sql"
]) {
  assert(exists(required), `Missing required file: ${required}`);
}

assert(!exists(".env"), ".env must not be committed or present in this scaffold.");
assert(!relativePaths.some((file) => /^node_modules[\\/]/i.test(file)), "node_modules must not be present.");
assert(!relativePaths.some((file) => /^\.next[\\/]/i.test(file)), ".next must not be present.");
assert(!relativePaths.some((file) => /(^|[\\/])__pycache__($|[\\/])/i.test(file)), "__pycache__ must not be present.");
assert(!relativePaths.some((file) => /(^|[\\/])(dist|build|coverage)($|[\\/])/i.test(file)), "build artifacts must not be present.");
assert(!relativePaths.some((file) => /\.py[co]$/i.test(file)), "Python cache files must not be present.");
assert(!relativePaths.some((file) => /tsconfig\.tsbuildinfo$/i.test(file)), "TypeScript build info cache must not be present.");
assert(!relativePaths.some((file) => /LIMM_AI_Sales_Agent_v2/i.test(file)), "v2 folder must not be copied into v3.");

const textFiles = relativePaths.filter((file) =>
  /\.(ts|tsx|js|mjs|json|md|sql|css|example|gitignore)$/i.test(file) && fs.statSync(path.join(root, file)).isFile()
);
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /EAAG[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /^SUPABASE_SERVICE_ROLE_KEY[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m,
  /^META_ACCESS_TOKEN[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m,
  /^WHATSAPP_ACCESS_TOKEN[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m,
  /^OPENAI_API_KEY[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m
];

for (const file of textFiles) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of secretPatterns) {
    assert(!pattern.test(content), `Possible hardcoded secret in ${file}`);
  }
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
for (const file of textFiles) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  assert(!content.includes(wrongWhatsAppPhoneNumberId), `Wrong WhatsApp Phone Number ID reintroduced in ${file}`);
}

for (const file of relativePaths.filter((item) => /\.(ts|tsx)$/i.test(item))) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (file === path.join("lib", "data", "supabase-admin.ts")) continue;
  if (file.startsWith(`app${path.sep}api${path.sep}`)) continue;
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(content), `Server service role key referenced in application code: ${file}`);
}

for (const file of relativePaths.filter((item) => {
  if (item.startsWith(`app${path.sep}api${path.sep}`)) return false;
  return /^app[\\/].*\.(ts|tsx)$/i.test(item) || /^components[\\/].*\.(ts|tsx)$/i.test(item);
})) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(content), `WhatsApp secret/server credential referenced in frontend/app route: ${file}`);
}

for (const file of relativePaths.filter((item) => /^app[\\/].*\.tsx$/i.test(item) || /^components[\\/].*\.tsx$/i.test(item))) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (file === path.join("app", "review-chatgpt-ui", "page.tsx")) continue;
  assert(!/lib\/mock-data/.test(content), `UI file imports mock data directly instead of repository layer: ${file}`);
}

const clientReplySources = ["lib/ai-decision-schema.ts", "lib/mock-data.ts", "lib/adapters/whatsapp-adapter.ts"];
const generatedPricingPatterns = [
  /\bS\$\s*\d{2,}/i,
  /\bSGD\s*\d{2,}/i,
  /\$\s*\d{2,}/,
  /\b\d{2,}\s*k\s*[-–]\s*\d{2,}\s*k\b/i,
  /\bquote range\b/i,
  /\bprice estimate\b/i,
  /\bestimate range\b/i,
  /\bpackage price\b/i
];
for (const file of clientReplySources) {
  const content = read(file);
  assert(!/free consultation/i.test(content), `${file} contains forbidden client wording.`);
  for (const pattern of generatedPricingPatterns) {
    assert(!pattern.test(content), `${file} contains generated pricing pattern: ${pattern}`);
  }
}

for (const file of ["lib/quotation-readiness.ts", "app/quotation-readiness/page.tsx"]) {
  const content = read(file);
  for (const pattern of generatedPricingPatterns) {
    assert(!pattern.test(content), `${file} contains pricing pattern: ${pattern}`);
  }
}

const reviewRoute = read("app/review-chatgpt-ui/page.tsx");
const shellChrome = read("components/ShellChrome.tsx");
const authGate = read("components/auth/AuthGate.tsx");
const reviewRouteFlag = read("lib/review-route.ts");
assert(reviewRouteFlag.includes("NEXT_PUBLIC_ENABLE_REVIEW_ROUTE"), "Review route flag helper missing NEXT_PUBLIC_ENABLE_REVIEW_ROUTE.");
assert(reviewRoute.includes("isReviewRouteEnabled") && reviewRoute.includes("notFound()"), "Review route must be disabled by default behind a review flag.");
assert(shellChrome.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "Review shell chrome must only activate behind review flag.");
assert(authGate.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "AuthGate must only exempt review route when the review flag is enabled.");
assert(reviewRoute.includes("Temporary ChatGPT UI Review Mode — Mock Data — No Live Actions"), "Review route missing safety banner.");
assert(reviewRoute.includes("@/lib/mock-data"), "Review route must use mock data directly for isolated review mode.");
assert(!/from\s+["']@\/lib\/actions["']|from\s+["']@\/lib\/data\/.*repository|from\s+["']@\/lib\/data\/supabase|save[A-Za-z]+Action|<form/i.test(reviewRoute), "Review route must not import write actions, live repositories, Supabase, or forms.");
assert(shellChrome.includes("Mock UI Review Mode"), "Review shell header must show Mock UI Review Mode.");
assert(shellChrome.includes("No Login Required"), "Review shell header must show No Login Required.");
assert(shellChrome.includes("No Live Actions"), "Review shell header must show No Live Actions.");
assert(shellChrome.includes("Demo Data Only"), "Review shell header must show Demo Data Only.");
assert(!reviewRoute.includes("Login required"), "Review route body must not show protected login copy.");
assert(!reviewRoute.includes("Logout"), "Review route body must not show logout.");
assert(/auth\.profile\s*&&\s*auth\.authenticated\s*&&\s*clientAuthenticated[\s\S]{0,700}<LogoutButton/.test(shellChrome), "Logout must only render for an authenticated profile.");
assert(shellChrome.includes("reviewNavItems"), "Review route must use dedicated review nav items.");
assert(shellChrome.includes("#dashboard") && shellChrome.includes("#client-files"), "Review nav must use internal anchors.");
assert(!/reviewNavItems[\s\S]{0,900}href:\s*["']\/(leads|appointments|settings|audit-log)/.test(shellChrome), "Review nav must not link to protected app routes.");
assert(reviewRoute.includes("(Preview Only)") && /<button[\s\S]{0,120}disabled/.test(reviewRoute), "Review route action buttons must be disabled or labelled Preview Only.");
assert(reviewRoute.includes("Move to Quotation Readiness"), "Review route must use Quotation Readiness wording.");
assert(!reviewRoute.includes("Move to Quotation</DisabledAction>"), "Review route must not use old Move to Quotation label.");
assert(!reviewRoute.includes("Quotation Needed"), "Review route dashboard must not use Quotation Needed wording.");
assert(reviewRoute.includes("Ready for Quotation Review"), "Review route dashboard must use quotation review wording.");
assert(reviewRoute.includes("Client Files Preview"), "Review route must include Client Files Preview.");
assert(reviewRoute.includes("new Date(`${slot.date}T00:00:00`).getDay() === 0"), "Review route must assert Sunday preview dates are real Sundays.");
const reviewSundayDate = "2026-05-31";
assert(reviewRoute.includes(reviewSundayDate), "Review route should use the May 2026 Sunday demo date.");
assert(new Date(`${reviewSundayDate}T00:00:00`).getDay() === 0, "Sunday preview demo date must be an actual Sunday.");
assert(!/free consultation/i.test(reviewRoute), "Review route contains forbidden client wording.");
for (const pattern of generatedPricingPatterns) {
  assert(!pattern.test(reviewRoute), `Review route contains generated pricing pattern: ${pattern}`);
}
assert(!/sunday[\s\S]{0,80}(blocked|continue)/i.test(reviewRoute), "Review route appears to hardcode Sunday blocking.");

assert(authGate.includes("isReviewRouteEnabled"), "AuthGate must not allow review route without explicit review flag.");

const loginPage = read("app/login/page.tsx");
const loginForm = read("components/auth/LoginForm.tsx");
assert(!loginPage.includes('PageHeader title="Login"'), "Login page must not use duplicate Login page header.");
assert(!/<h2[\s\S]{0,80}>Login<\/h2>/i.test(loginForm), "Login form must not duplicate Login heading.");
assert(loginPage.includes("Sign in to Command Centre"), "Login page must have one clear sign-in title.");

const dashboardPage = read("app/page.tsx");
assert(!dashboardPage.includes("Quotation Needed"), "Dashboard must not use Quotation Needed wording.");
assert(dashboardPage.includes("Ready for Quotation Review"), "Dashboard must use quotation review wording.");

const mockData = read("lib/mock-data.ts");
assert(/id:\s*"lead-003"[\s\S]{0,280}division:\s*"LIMM Works"[\s\S]{0,280}propertyType:\s*"Commercial clinic"/.test(mockData), "Commercial clinic mock lead must be classified under LIMM Works.");

const appointmentEngine = read("lib/appointment-engine.ts");
assert(appointmentEngine.includes("sunday"), "Sunday must be present in appointment settings.");
assert(!/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine), "Sunday-specific appointment branch found.");
assert(!/getDay\(\)\s*===\s*0/i.test(appointmentEngine), "Sunday hardcode found.");
assert(!/sunday[\s\S]{0,80}continue/i.test(appointmentEngine), "Sunday hard-block pattern found.");
assert(!/toISOString\(\)\.slice\(0,\s*10\)/.test(appointmentEngine), "Appointment date keys must not use UTC toISOString date slicing.");

const rls = read("supabase/migrations/016_v3_2_auth_rls.sql");
for (const role of ["boss", "admin", "sales", "viewer"]) {
  assert(rls.includes(role), `RLS migration missing role: ${role}`);
}
assert(/enable row level security/i.test(rls), "RLS migration must enable row level security.");
assert(/to authenticated/i.test(rls), "RLS policies must target authenticated users.");
assert(!/to anon/i.test(rls), "RLS migration must not grant anon policies.");
assert(!/audit_logs[\s\S]{0,180}for delete/i.test(rls), "Audit logs must not have delete policy.");

const shell = read("components/Shell.tsx");
assert(/ShellChrome/.test(shell), "Server shell must delegate path-aware chrome to ShellChrome.");
assert(/AuthGate/.test(shellChrome), "Protected shell chrome must include AuthGate.");
assert(/LogoutButton/.test(shellChrome), "Protected shell chrome must include logout for authenticated users.");

const actions = read("lib/actions.ts");
assert(/requirePermission/.test(actions), "Server actions must enforce role permissions.");

const setupGuide = read("LIVE_SUPABASE_SETUP_GUIDE.md");
assert(/NEXT_PUBLIC_SUPABASE_URL/.test(setupGuide), "Live setup guide must include Supabase URL setup.");
assert(/Create Marcus Auth User/.test(setupGuide), "Live setup guide must include Marcus auth user setup.");

const migrationOrder = read("supabase/MIGRATION_ORDER.md");
assert(/016_v3_2_auth_rls\.sql/.test(migrationOrder), "Migration order doc must include RLS migration.");
assert(/Verification query:/i.test(migrationOrder), "Migration order doc must include verification queries.");

const bootstrap = read("supabase/bootstrap_profiles.sql");
assert(/MARCUS_AUTH_USER_UUID/.test(bootstrap), "Bootstrap profile SQL must use Marcus UUID placeholder.");
assert(!/password\s*=/i.test(bootstrap), "Bootstrap profile SQL must not contain passwords.");

const actionVerifier = read("scripts/verify_live_authenticated_actions.mjs");
assert(/SUPABASE_TEST_EMAIL/.test(actionVerifier), "Authenticated verifier must use env credentials.");
assert(!/from\("audit_logs"\)\.delete|from\('audit_logs'\)\.delete/i.test(actionVerifier), "Authenticated verifier must not delete audit logs.");

const auditCompatibility = read("supabase/migrations/017_v3_4_audit_log_actor_compatibility.sql");
for (const phrase of ["actor_type", "actor_name", "actor_email", "actor_id", "metadata", "set_audit_logs_actor", "trg_set_audit_logs_actor"]) {
  assert(auditCompatibility.includes(phrase), `Audit compatibility migration missing ${phrase}`);
}

const v4AuditCompatibility = read("supabase/migrations/017_v4_0_audit_log_actor_compatibility.sql");
for (const phrase of ["actor_type", "actor_name", "actor_email", "actor_id", "metadata", "set_audit_logs_actor", "trg_set_audit_logs_actor"]) {
  assert(v4AuditCompatibility.includes(phrase), `v4 audit compatibility migration missing ${phrase}`);
}

const auditRepo = read("lib/data/audit-repository.ts");
assert(/actor:\s*audit\.actor/.test(auditRepo), "Audit repository must send legacy actor field.");
assert(/actor_type:\s*audit\.actorType/.test(auditRepo), "Audit repository must send actor_type.");

const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
assert(whatsappRoute.includes("WHATSAPP_VERIFY_TOKEN") && whatsappRoute.includes("hub.challenge"), "WhatsApp webhook must verify Meta challenge.");
assert(whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must use the closed-test handler.");
assert(whatsappRoute.includes('runtime = "nodejs"'), "WhatsApp production webhook must use Node.js runtime.");
assert(/export\s+async\s+function\s+GET/.test(whatsappRoute), "WhatsApp production webhook GET handler missing.");
assert(/export\s+async\s+function\s+POST/.test(whatsappRoute), "WhatsApp production webhook POST handler missing.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start"), "WhatsApp webhook must log first-line production diagnostic marker.");
assert(whatsappRoute.includes("config_error") && whatsappRoute.includes("missing"), "WhatsApp webhook must return safe config_error JSON.");
assert(whatsappRoute.includes("unsupported_or_status_payload"), "WhatsApp webhook must safely ignore unsupported/status-only payloads.");
assert(!/localhost|127\.0\.0\.1|trycloudflare|pinggy/i.test(whatsappRoute), "WhatsApp production webhook must not hardcode local tunnel URLs.");
const whatsappHealthRoute = read("app/api/whatsapp/health/route.ts");
for (const field of ["hasSupabaseUrl", "hasServiceRoleKey", "hasWhatsappAccessToken", "testAutoReplyEnabled"]) {
  assert(whatsappHealthRoute.includes(field), `WhatsApp health route missing ${field}`);
}
for (const field of [
  "version: \"v6_1_ui_polish_test_cleanup\"",
  "salesBrainVersion: \"v6.ultimate\"",
  "uiPolishAvailable",
  "premiumGoldCommandCentreThemeAvailable",
  "largerReadableFontsAvailable",
  "testLeadCleanupAvailable",
  "testLeadCleanupDryRunAvailable",
  "testLeadCleanupSoftDeleteDefault",
  "humanLikeSalesBrainAvailable",
  "contextTruthGateAvailable",
  "singaporeRenovationMeaningBrainAvailable",
  "naturalReplyComposerAvailable",
  "safetyGovernorAvailable",
  "replyQualityJudgeAvailable",
  "overClaimPreventionAvailable",
  "localRenovationShortformSupportAvailable",
  "v6DeepQaAvailable",
  "v6UltimateDeepQaAvailable",
  "optionalAiSalesBrainEnabled",
  "aiDraftReplyEnabled",
  "aiJsonSchemaValidationAvailable",
  "deepWhatsappAgentQaAvailable",
  "mediaContextDetectionAvailable",
  "floorPlanImageContextAvailable",
  "avoidAskingForReceivedMediaAvailable",
  "voiceMessageFallbackAvailable",
  "voiceTranscriptionEnabled",
  "singlishIntentSupportAvailable",
  "singlishRepliesInEnglish",
  "emailHandoffAvailable",
  "handoffEmailAntiSpamAvailable",
  "multiIntentDetectorAvailable",
  "combinedReplyComposerAvailable",
  "leadContextMemoryCheckerAvailable",
  "avoidRepeatedInfoRequestAvailable",
  "priceScopeFirstRuleAvailable",
  "portfolioInstagramRoutingAvailable",
  "instagramUrlConfigured",
  "portfolioHumanFollowUpTaskAvailable",
  "replyCoachAvailable",
  "replyDecisionEngineAvailable",
  "replyQualityGateAvailable",
  "validTextNeverEmptyReplyGuard",
  "noSilenceFallbackAvailable",
  "safetyRewriteInsteadOfSilence",
  "repetitionRewriteInsteadOfSilence",
  "answerActualQuestionFirstRule",
  "blackBoxReplyRecorderAvailable",
  "humanTakeoverLockPlanned",
  "softDeleteAvailable",
  "restoreAvailable",
  "bossOnlyHardDeleteAvailable",
  "deleteAuditAvailable",
  "humanTakeoverAvailable",
  "botPauseResumeAvailable",
  "leadScoringAvailable",
  "conversationSummaryAvailable",
  "missionQueueAvailable",
  "followUpReminderAvailable",
  "staffRolesAvailable",
  "settingsPageAvailable",
  "goldCommandCentreUiAvailable",
  "inAppQaCentreAvailable",
  "salesLearningFoundationAvailable",
  "weeklyBossReportDraftAvailable",
  "quotationReadinessAvailable",
  "questionBankAvailable",
  "openaiWhatsappReplyEnabled",
  "calendarAutoBookingEnabled"
]) {
  assert(whatsappHealthRoute.includes(field), `WhatsApp health route missing v5.3 proof field: ${field}`);
}
assert(!/return\s+process\.env/.test(whatsappHealthRoute), "WhatsApp health route must not return raw env values.");
const whatsappDebugRoute = read("app/api/whatsapp/debug-parse/route.ts");
assert(whatsappDebugRoute.includes("debug_endpoint_disabled"), "WhatsApp debug parse route must be disabled behind a safe flag.");
assert(!/saveLeadMessage|upsertWhatsAppLead|sendReply|createAuditLog/.test(whatsappDebugRoute), "WhatsApp debug parse route must not write data or send messages.");
const whatsappConfig = read("lib/whatsapp-config.ts");
for (const phrase of ["WHATSAPP_LIVE_INBOUND_ENABLED", "WHATSAPP_TEST_AUTO_REPLY_ENABLED", "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED", "WHATSAPP_TEST_MODE", "!publicAutoReplyEnabled", "liveAutoReplyApproved", "autoReplyModeAllowed"]) {
  assert(whatsappConfig.includes(phrase), `WhatsApp config missing ${phrase}`);
}
const envExample = read(".env.example");
for (const safeDefault of [
  "WHATSAPP_LIVE_INBOUND_ENABLED=false",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false",
  "NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=false",
  "OPENAI_BRAIN_DRY_RUN=false"
]) {
  assert(envExample.includes(safeDefault), `.env.example missing safe production default: ${safeDefault}`);
}
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
assert(whatsappAdapter.includes("server-only"), "WhatsApp adapter must be server-only.");
assert(!/console\.(log|error|warn)/.test(whatsappAdapter), "WhatsApp adapter must not log provider responses.");
const whatsappService = read("lib/whatsapp-auto-reply.ts");
for (const phrase of ["whatsapp_inbound_received", "whatsapp_auto_reply_sent", "whatsapp_auto_reply_blocked_unsafe", "recentReplyCount >= 3", "validateWhatsAppAutoReply"]) {
  assert(whatsappService.includes(phrase), `WhatsApp closed-test service missing ${phrase}`);
}
for (const phrase of [
  "buildWhatsAppReplyDecision",
  "listRecentLeadMessagesForWebhook",
  "auditReplyDecisionTrace",
  "whatsapp_reply_decision_started",
  "whatsapp_sales_brain_classified",
  "whatsapp_reply_quality_checked",
  "whatsapp_no_silence_fallback_used",
  "whatsapp_auto_reply_intentional_no_reply",
  "whatsapp_auto_reply_send_failed",
  "whatsapp_rate_limit_warning",
  "distinctTextWillStillReply",
  "decision.blackBoxTrace"
]) {
  assert(whatsappService.includes(phrase), `WhatsApp v5.3 reply decision integration missing ${phrase}`);
}
assert(!whatsappService.includes("Too many auto-replies sent to this WhatsApp phone."), "Old hard rate-limit silence reason must be removed.");
assert(!/recentReplyCount\s*>=\s*3[\s\S]{0,900}return\s+\{[\s\S]{0,300}auto_reply_disabled/.test(whatsappService), "Rate-limit threshold must not return before reply decision.");
const replyCoach = read("lib/whatsapp-reply-coach.ts");
for (const phrase of [
  "NO_SILENCE_FALLBACK_REPLY",
  "composeMultiIntentReply",
  "composePortfolioReply",
  "composeAppointmentReply",
  "composePriceReply",
  "composePingReply",
  "composeWhatNextReply",
  "answer_design_direction_and_request_refs",
  "safe_price_deflection_and_collect_info",
  "appointment_followup_pending_review",
  "warm_ping_reassurance",
  "evaluateReplyQuality",
  "missingFieldsAsked",
  "repeatedInfoAvoided"
]) {
  assert(replyCoach.includes(phrase), `WhatsApp Reply Coach missing ${phrase}`);
}
const replyDecision = read("lib/whatsapp-reply-decision.ts");
for (const phrase of [
  "buildWhatsAppReplyDecision",
  "valid_client_text",
  "final_reply_text",
  "blackBoxTrace",
  "detectedIntents",
  "primaryIntent",
  "multiIntentDetected",
  "leadContextChecked",
  "knownContextSummary",
  "missingFieldsAsked",
  "repeatedInfoAvoided",
  "portfolioRequestDetected",
  "instagramUrlAvailable",
  "humanFollowUpTaskCreated",
  "combinedReplyUsed",
  "NO_SILENCE_FALLBACK_REPLY",
  "safety_result",
  "repetition_result",
  "quality_result",
  "no_silence_guard_result"
]) {
  assert(replyDecision.includes(phrase), `WhatsApp reply decision engine missing ${phrase}`);
}
const multiIntent = read("lib/whatsapp-multi-intent.ts");
for (const phrase of ["detectWhatsAppMessageIntents", "appointment_request", "design_theme", "landed_renovation", "hacking_wall", "approval_submission", "portfolio_request"]) {
  assert(multiIntent.includes(phrase), `WhatsApp multi-intent detector missing ${phrase}`);
}
const leadContext = read("lib/whatsapp-lead-context.ts");
for (const phrase of ["inferWhatsAppLeadContext", "hasFloorPlan", "hasSitePhotos", "hasScopeOfWork", "hasPropertyType", "getLimmInstagramUrl"]) {
  assert(leadContext.includes(phrase), `WhatsApp lead context memory missing ${phrase}`);
}
const whatsappBrain = read("lib/whatsapp-sales-brain.ts");
for (const phrase of ["landed_renovation", "aa_works", "price_question", "site_visit_request", "repeated_enquiry", "toneCheck", "repetition_checked", "initial project review"]) {
  assert(whatsappBrain.includes(phrase), `WhatsApp v5 sales brain missing ${phrase}`);
}
const questionBank = read("lib/whatsapp-question-bank.ts");
for (const phrase of [
  "whatsappQuestionBank",
  "questionBankStats",
  "matchQuestionBankIntent",
  "safe_answer_strategy",
  "reply_variations",
  "design_theme",
  "submission_approval",
  "waterproofing_drainage_roof"
]) {
  assert(questionBank.includes(phrase), `WhatsApp v5.2 question bank missing ${phrase}`);
}
for (const phrase of [
  "matchQuestionBankIntent(context.latestInboundMessage)",
  "question_bank_intent",
  "matched_keywords",
  "reply_strategy",
  "escalation_required"
]) {
  assert(whatsappBrain.includes(phrase), `WhatsApp v5.2 sales brain metadata missing ${phrase}`);
}
const calendarConfig = read("lib/calendar-config.ts");
for (const phrase of ["CALENDAR_BOOKING_ENABLED", "CALENDAR_BOSS_APPROVAL_REQUIRED", "CALENDAR_AUTO_BOOKING_ENABLED", "GOOGLE_CALENDAR_CONNECTED"]) {
  assert(calendarConfig.includes(phrase), `Calendar config missing ${phrase}`);
}
const calendarBooking = read("lib/calendar-booking.ts");
for (const phrase of ["evaluateBookingReadiness", "ready_for_boss_review", "approved_for_booking", "Do not confirm booking until event is created."]) {
  assert(calendarBooking.includes(phrase), `Calendar booking foundation missing ${phrase}`);
}
const whatsappDocs = read("WHATSAPP_LIVE_TEST_SETUP_GUIDE.md") + read("WHATSAPP_EMERGENCY_OFF_GUIDE.md");
assert(whatsappDocs.includes("WHATSAPP_TEST_AUTO_REPLY_ENABLED=false"), "WhatsApp emergency kill switch doc missing.");
assert(whatsappDocs.includes("WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true"), "WhatsApp docs must include Marcus-approved live mode.");
assert(read("supabase/MIGRATION_ORDER.md").includes("018_v4_8_whatsapp_closed_test.sql"), "Migration order missing v4.8 WhatsApp migration.");

const deploymentDocs = read("PRODUCTION_ENV_VARS_CHECKLIST.md") + read("VERCEL_DEPLOYMENT_GUIDE.md") + read("META_WHATSAPP_WEBHOOK_LIVE_SETUP.md");
for (const phrase of [
  "https://YOUR-VERCEL-URL/api/whatsapp/webhook",
  "Build command: `npm run build`",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "SERVER ONLY",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=true",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true"
]) {
  assert(deploymentDocs.includes(phrase), `Deployment readiness docs missing ${phrase}`);
}

const pkg = JSON.parse(read("package.json"));
for (const script of ["doctor", "verify", "audit:launch", "start:local", "test:v4", "test:v4.1", "qa:browser", "qa:v4-3", "qa:dev-brain", "qa:report", "verify:all"]) {
  assert(pkg.scripts?.[script], `package.json missing ${script}`);
}
assert(pkg.devDependencies?.["@playwright/test"], "package.json missing Playwright dev dependency.");
assert(pkg.scripts?.["test:v6.1"], "package.json missing v6.1 UI/cleanup test script.");
for (const dependency of ["next", "react", "react-dom"]) {
  assert(pkg.dependencies?.[dependency], `package.json missing ${dependency}`);
}

const startupScript = read("START_LIMM_SALES_APP.ps1");
assert(startupScript.includes("node_modules\\.bin\\next.cmd"), "Startup script must check next.cmd.");
assert(startupScript.includes("npm install"), "Startup script must install dependencies when needed.");
assert(startupScript.includes("run doctor"), "Startup script must run doctor.");
assert(startupScript.includes("Get-Command npm.cmd") || startupScript.includes("Get-Command npm"), "Startup script must resolve npm on Windows.");

const nextBestAction = read("lib/next-best-action.ts");
assert(/getNextBestAction/.test(nextBestAction), "Next best action engine missing.");
assert(/urgency/.test(nextBestAction) && /blockers/.test(nextBestAction), "Next best action must expose urgency and blockers.");

const approvalGateMatrix = read("lib/approval-gates.ts");
assert(/approvalGateMatrix/.test(approvalGateMatrix), "Approval gate matrix missing.");
assert(/landed_extension/.test(approvalGateMatrix) && /commercial_project/.test(approvalGateMatrix), "Approval gates missing key risky scopes.");

const v61Docs = read("docs/V6_1_UI_POLISH_TEST_CLEANUP.md");
const v61Cleanup = read("scripts/cleanup_old_test_leads_v6_1.mjs");
const v61Test = read("scripts/test_v6_1_ui_polish_cleanup.mjs");
for (const phrase of ["Dry run is the default", "--apply", "--hard-delete-test-data", "reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md"]) {
  assert(v61Docs.includes(phrase), `v6.1 cleanup docs missing ${phrase}`);
}
for (const phrase of ["lead_test_cleanup_soft_delete_planned", "lead_test_cleanup_hard_delete_pre_audit", "Not clearly test data", "--apply"]) {
  assert(v61Cleanup.includes(phrase), `v6.1 cleanup script missing ${phrase}`);
}
assert(v61Test.includes("Real Homeowner") && v61Test.includes("Action: not_touched"), "v6.1 cleanup test must protect real-looking leads.");

console.log("PASS: v3 package audit passed.");
