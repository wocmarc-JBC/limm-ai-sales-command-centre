const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error("Usage: node scripts/check_v4_8_vercel_whatsapp_health.mjs <base-url>");
  process.exit(1);
}

const healthUrl = `${baseUrl.replace(/\/$/, "")}/api/whatsapp/health`;
const response = await fetch(healthUrl);
const health = await response.json().catch(() => null);

if (!response.ok || !health || health.ok !== true) {
  console.error(`FAIL: WhatsApp health endpoint did not return safe OK JSON. HTTP ${response.status}`);
  console.log(JSON.stringify(health, null, 2));
  process.exit(1);
}

const required = [
  "hasSupabaseUrl",
  "hasSupabaseAnonKey",
  "hasServiceRoleKey",
  "liveInboundEnabled",
  "testAutoReplyEnabled",
  "hasWhatsappVerifyToken",
  "hasWhatsappPhoneNumberId",
  "hasWhatsappAccessToken",
  "hasWhatsappBusinessNumber"
];

const optional = ["publicAutoReplyEnabled", "testMode"];
const failed = required.filter((key) => health[key] !== true);
const closedTestMode = health.publicAutoReplyEnabled === false && health.testMode === true;
const approvedLiveMode = health.publicAutoReplyEnabled === true && health.testMode === false;

console.log("WhatsApp health summary");
for (const key of [...required, ...optional]) {
  console.log(`${key}: ${health[key] === true ? "PASS" : health[key] === false ? "FAIL/false" : "UNKNOWN"}`);
}

if (!closedTestMode && !approvedLiveMode) {
  failed.push("publicAutoReplyEnabled/testMode must be either closed test or Marcus-approved live mode");
}

if (failed.length) {
  console.error(`FAIL: Missing or unsafe WhatsApp fields: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`PASS: WhatsApp Vercel health is ready for ${approvedLiveMode ? "Marcus-approved live mode" : "closed test mode"}.`);
