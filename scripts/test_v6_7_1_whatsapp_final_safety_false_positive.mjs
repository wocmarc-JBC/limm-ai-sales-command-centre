import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

const safety = read("lib/whatsapp-safety.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

check(
  "safe_fallback generic project-review wording is no longer a hard block",
  /code:\s*"missing_initial_project_review_wording"[\s\S]*?blocking:\s*false/.test(safety) &&
    /errors:\s*blockingIssues\.map/.test(safety) &&
    /warnings:\s*warningIssues\.map/.test(safety),
  "The live false positive was the generic missing-project-review wording rule."
);

check(
  "ultra-safe fallback is available and intentionally harmless",
  safety.includes("WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY") &&
    safety.includes("Thanks for your message. The team will review the details and get back to you shortly.") &&
    safety.includes("floor plan, site photos or preferred timing"),
  "The final gate can rewrite fallback replies once instead of going silent."
);

check(
  "safe_fallback final validation can rewrite once",
  autoReply.includes('decision.replySource === "safe_fallback"') &&
    autoReply.includes("WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY") &&
    autoReply.includes("whatsapp_auto_reply_fallback_rewrite_attempted"),
  "safe_fallback should not be killed by a generic false positive."
);

check(
  "no-silence fallback final validation can rewrite once",
  autoReply.includes('decision.noSilenceGuardResult === "used"') &&
    autoReply.includes('(decision.replySource as string) === "no_silence_fallback"'),
  "no_silence_fallback remains protected against false positive silence."
);

check(
  "unsafe pricing replies remain blocked",
  safety.includes('code: "pricing_amount"') &&
    safety.includes('code: "pricing_wording"') &&
    /code:\s*"pricing_amount"[\s\S]*?blocking:\s*true/.test(safety),
  "Pricing amounts/ranges must still fail hard."
);

check(
  "appointment confirmation without calendar event remains blocked",
  safety.includes("calendarConfirmationPattern") &&
    safety.includes('code: "appointment_confirmation_without_calendar_event"') &&
    safety.includes("!options.calendarEventId"),
  "No appointment confirmation without a real calendar event."
);

check(
  "approval, hacking, structural and completion certainty remain blocked",
  safety.includes('code: "approval_promise"') &&
    safety.includes('code: "hacking_certainty"') &&
    safety.includes('code: "structural_certainty"') &&
    safety.includes('code: "completion_guarantee"'),
  "Real safety gates are preserved."
);

check(
  "validation block logs safe reason codes and labels",
  autoReply.includes("validationErrorCodes: safety.errorCodes") &&
    autoReply.includes("validationErrorLabels: safety.errorLabels") &&
    autoReply.includes("replySource: decision.replySource") &&
    autoReply.includes("intent: decision.intent") &&
    autoReply.includes("characterCount: reply.length"),
  "Production logs now show which validator rule blocked the reply without exposing message text."
);

check(
  "known-good WhatsApp text payload shape is preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)") &&
    adapter.includes("JSON.stringify(payload)"),
  "The Meta payload contract remains unchanged."
);

check(
  "health exposes v6.7.1 final safety proof fields",
  health.includes('version: "v6_7_1_whatsapp_final_safety_false_positive_fix"') &&
    health.includes("finalSafetyFalsePositiveFixAvailable: true") &&
    health.includes("safeFallbackFinalValidationAllowed: true") &&
    health.includes("ultraSafeFallbackRewriteAvailable: true") &&
    health.includes("finalValidationReasonLoggingAvailable: true"),
  "Health endpoint should prove the production fix after Vercel deploy."
);

check(
  "price guide, calendar auto-booking and voice transcription stay off",
  health.includes("priceGuideOnHold: true") &&
    health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "This patch must not enable unrelated features."
);

const failed = checks.filter((item) => !item.passed);

console.log("v6.7.1 WhatsApp final safety false-positive test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
