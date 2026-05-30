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
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (["node_modules", ".next", "test-results", "playwright-report", ".git"].includes(entry.name)) continue;
    output.push(full);
    if (entry.isDirectory()) walk(full, output);
  }
  return output;
}

for (const file of [
  "PRODUCTION_ENV_VARS_CHECKLIST.md",
  "VERCEL_DEPLOYMENT_GUIDE.md",
  "META_WHATSAPP_WEBHOOK_LIVE_SETUP.md",
  "WHATSAPP_EMERGENCY_OFF_GUIDE.md",
  "V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md",
  "app/api/whatsapp/webhook/route.ts",
  "lib/adapters/whatsapp-adapter.ts",
  "lib/data/supabase-admin.ts",
  ".env.example"
]) {
  assert(exists(file), `Missing v4.9 deployment readiness file: ${file}`);
}

const pkg = JSON.parse(read("package.json"));
for (const script of ["build", "start", "dev", "qa:browser", "qa:v4-3", "qa:dev-brain", "test:v4.9"]) {
  assert(pkg.scripts?.[script], `package.json missing script: ${script}`);
}
for (const dependency of ["next", "react", "react-dom"]) {
  assert(pkg.dependencies?.[dependency], `package.json missing dependency: ${dependency}`);
}

const envExample = read(".env.example");
for (const safeDefault of [
  "WHATSAPP_LIVE_INBOUND_ENABLED=false",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false",
  "WHATSAPP_TEST_MODE=true",
  "OPENAI_BRAIN_DRY_RUN=false",
  "NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=false"
]) {
  assert(envExample.includes(safeDefault), `.env.example missing safe default: ${safeDefault}`);
}

const productionEnvChecklist = read("PRODUCTION_ENV_VARS_CHECKLIST.md");
for (const required of [
  "NEXT_PUBLIC_SUPABASE_URL=",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "SERVER ONLY",
  "WHATSAPP_LIVE_INBOUND_ENABLED=true",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=true",
  "WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true",
  "WHATSAPP_TEST_MODE=false",
  "WHATSAPP_VERIFY_TOKEN=",
  "WHATSAPP_PHONE_NUMBER_ID=",
  "WHATSAPP_ACCESS_TOKEN=",
  "WHATSAPP_BUSINESS_NUMBER=",
  "OPENAI_BRAIN_DRY_RUN=false"
]) {
  assert(productionEnvChecklist.includes(required), `Production env checklist missing: ${required}`);
}
assert(!/SUPABASE_SERVICE_ROLE_KEY\s*=\s*NEXT_PUBLIC/i.test(productionEnvChecklist), "Service role must never be presented as NEXT_PUBLIC.");

const vercelGuide = read("VERCEL_DEPLOYMENT_GUIDE.md");
for (const required of [
  "Framework preset: Next.js",
  "Build command: `npm run build`",
  "https://YOUR-VERCEL-URL/api/whatsapp/webhook",
  "Redeploy",
  "Marcus-approved live mode"
]) {
  assert(vercelGuide.includes(required), `Vercel guide missing: ${required}`);
}

const metaGuide = read("META_WHATSAPP_WEBHOOK_LIVE_SETUP.md");
for (const required of [
  "https://YOUR-VERCEL-URL/api/whatsapp/webhook",
  "WHATSAPP_VERIFY_TOKEN",
  "messages",
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=true",
  "Marcus-approved live mode"
]) {
  assert(metaGuide.includes(required), `Meta webhook setup guide missing: ${required}`);
}

const emergencyGuide = read("WHATSAPP_EMERGENCY_OFF_GUIDE.md");
for (const required of [
  "WHATSAPP_TEST_AUTO_REPLY_ENABLED=false",
  "Disable or remove the webhook",
  "WHATSAPP_ACCESS_TOKEN"
]) {
  assert(emergencyGuide.includes(required), `Emergency off guide missing: ${required}`);
}
assert(emergencyGuide.toLowerCase().includes("redeploy"), "Emergency off guide must mention redeploy/restart after kill switch changes.");

const webhookRoute = read("app/api/whatsapp/webhook/route.ts");
assert(webhookRoute.includes('runtime = "nodejs"'), "WhatsApp webhook must use Node.js runtime for production server-side env access.");
assert(/export\s+async\s+function\s+GET/.test(webhookRoute), "WhatsApp webhook GET verification handler missing.");
assert(/export\s+async\s+function\s+POST/.test(webhookRoute), "WhatsApp webhook POST handler missing.");
assert(webhookRoute.includes("WHATSAPP_VERIFY_TOKEN"), "WhatsApp webhook GET must use WHATSAPP_VERIFY_TOKEN.");
assert(webhookRoute.includes("hub.challenge") && webhookRoute.includes("hub.verify_token"), "WhatsApp webhook GET must implement Meta challenge verification.");
assert(webhookRoute.includes("parseWhatsAppInbound") && webhookRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook POST must parse and handle inbound payloads.");
assert(!/localhost|127\.0\.0\.1|trycloudflare|pinggy/i.test(webhookRoute), "Webhook route must not hardcode a local tunnel URL.");

const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
assert(whatsappAdapter.includes("server-only"), "WhatsApp adapter must be server-only.");
assert(whatsappAdapter.includes("WHATSAPP_ACCESS_TOKEN"), "WhatsApp adapter must read token server-side.");
assert(whatsappAdapter.includes("WHATSAPP_PHONE_NUMBER_ID"), "WhatsApp adapter must read phone number id server-side.");
assert(!/console\.(log|error|warn)/.test(whatsappAdapter), "WhatsApp adapter must not print tokens or provider responses.");

const supabaseAdmin = read("lib/data/supabase-admin.ts");
assert(supabaseAdmin.includes("server-only"), "Supabase admin helper must be server-only.");
assert(supabaseAdmin.includes("SUPABASE_SERVICE_ROLE_KEY"), "Supabase admin helper should be the only app helper reading the service role key.");

const reviewFlag = read("lib/review-route.ts");
const reviewRoute = read("app/review-chatgpt-ui/page.tsx");
assert(reviewFlag.includes("NEXT_PUBLIC_ENABLE_REVIEW_ROUTE"), "Review route flag helper missing.");
assert(reviewRoute.includes("isReviewRouteEnabled") && reviewRoute.includes("notFound()"), "Review route must stay disabled by default unless explicitly enabled.");

const frontendFiles = [
  ...walk(path.join(root, "app")),
  ...walk(path.join(root, "components"))
].filter((file) => /\.(ts|tsx)$/.test(file) && !path.relative(root, file).startsWith(`app${path.sep}api${path.sep}`));
for (const file of frontendFiles) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(content), `WhatsApp server credential referenced in frontend file: ${relative}`);
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(content), `Supabase service role referenced in frontend file: ${relative}`);
}

const serverOnlyAllowed = new Set([
  path.join("lib", "data", "supabase-admin.ts"),
  path.join("lib", "adapters", "whatsapp-adapter.ts"),
  path.join("lib", "whatsapp-config.ts")
]);
for (const file of walk(path.join(root, "lib")).filter((item) => /\.(ts|tsx)$/.test(item))) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  if (!serverOnlyAllowed.has(relative)) {
    assert(!/SUPABASE_SERVICE_ROLE_KEY|WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(content), `Server credential outside approved server-only helper: ${relative}`);
  }
}

const clientReplySurfaces = [
  "lib/ai-decision-schema.ts",
  "lib/mock-data.ts",
  "lib/adapters/whatsapp-adapter.ts",
  "app/leads/[id]/page.tsx",
  "app/quotation-readiness/page.tsx",
  "app/review-chatgpt-ui/page.tsx"
];
const forbiddenClientPatterns = [
  /free consultation/i,
  /\bS\$\s*\d{2,}/i,
  /\bSGD\s*\d{2,}/i,
  /\$\s*\d{2,}/,
  /\bquote range\b/i,
  /\bprice estimate\b/i,
  /\brough estimate\b/i,
  /\bestimated price\b/i,
  /\bpackage price\b/i,
  /\bcalendar booking confirmed\b/i,
  /\bappointment confirmed\b/i
];
for (const file of clientReplySurfaces) {
  const content = read(file);
  for (const pattern of forbiddenClientPatterns) {
    assert(!pattern.test(content), `${file} contains forbidden deployment safety pattern: ${pattern}`);
  }
}

const appointmentEngine = read("lib/appointment-engine.ts");
assert(appointmentEngine.includes("sunday"), "Appointment engine must include configurable Sunday support.");
assert(!/dayName\s*===\s*["']sunday["']/i.test(appointmentEngine), "Appointment engine must not hardcode Sunday logic.");
assert(!/getDay\(\)\s*===\s*0/i.test(appointmentEngine), "Appointment engine must not hardcode Sunday blocking.");
assert(!/sunday[\s\S]{0,80}(blocked|continue)/i.test(appointmentEngine), "Appointment engine appears to hardcode Sunday blocking.");

const nextConfig = exists("next.config.mjs") ? read("next.config.mjs") : "";
assert(!/localhost|127\.0\.0\.1|trycloudflare|pinggy/i.test(nextConfig), "Next config must not contain local-only webhook assumptions.");

console.log("PASS: v4.9 deployment readiness static tests passed.");
