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

const v7 = read("lib/whatsapp-v7-sales-brain.ts");
const health = read("app/api/whatsapp/health/route.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const activePlannerComposer = v7.slice(
  v7.indexOf("export function composeReplyFromPlan"),
  v7.indexOf("export function judgeHumanFeel")
);
const activeMissingSelector = v7.slice(
  v7.indexOf("function playbookMissingFields"),
  v7.indexOf("function selectPrimaryMove")
);
const replyReturnLiterals = [...v7.matchAll(/return\s+(`[^`]*`|"[^"]*"|'[^']*')/g)]
  .map((match) => match[1])
  .join("\n");
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";

check(
  "1. v7.2.2 version marker exists",
  v7.includes('V7_2_2_PRICE_REPLY_KNOWN_CONTEXT_VERSION = "v7_2_2_price_reply_uses_known_context"') &&
    health.includes('version: "v7_2_2_price_reply_uses_known_context"') &&
    health.includes('salesBrainVersion: "v7.2.2"'),
  "Health must prove v7.2.2 after deploy."
);

check(
  "2. known landed A&A price helper uses merged context signals",
  v7.includes("function shouldUseKnownLandedAaPriceContext") &&
    v7.includes("isKnownLandedAa(context)") &&
    v7.includes("context.floor_plan_received") &&
    v7.includes("context.site_photos_received") &&
    v7.includes("context.reference_images_received") &&
    v7.includes("context.property_address") &&
    v7.includes("context.budget_expectation"),
  "Price replies must use merged lead context instead of only the strict serious gate."
);

check(
  "3. serious landed A&A price reply uses the known-context helper",
  activePlannerComposer.includes("if (shouldUseKnownLandedAaPriceContext(context))") &&
    activePlannerComposer.includes("nextUsefulFileLine(context, \"price\")") &&
    !/if \(isSeriousLandedAa\(context\)\) \{[\s\S]{0,240}nextUsefulFileLine\(context, "price"\)/.test(activePlannerComposer),
  "The price branch must not bypass v7.2.1 context-aware next useful item selection."
);

check(
  "4. price question + landed A&A + floor plan received does not ask broad scope",
  activeMissingSelector.includes("if (shouldUseKnownLandedAaPriceContext(context)) return seriousLandedAaNextItems();") &&
    v7.includes(".filter((field) => !(isKnownLandedAa(context) && field === \"scope\"))") &&
    v7.includes("known_landed_aa_price_asked_broad_scope"),
  "Known landed A&A price replies must not default to scope/main areas/areas involved."
);

check(
  "5. price question + floor plan received does not ask for floor plan again",
  v7.includes("if (field === \"floor_plan\") return context.floor_plan_received") &&
    v7.includes("We've received the floor plan, so site photos and any design references would be useful next.") &&
    !/shouldUseKnownLandedAaPriceContext\(context\)[\s\S]{0,260}Could you share the scope of work/.test(activePlannerComposer),
  "Received floor plan must be acknowledged, not requested again."
);

check(
  "6. missing site photos and design references are requested next",
  v7.includes('!context.site_photos_received') &&
    v7.includes('["site_photos", "design_references"]') &&
    v7.includes("site photos and any design references would be useful next"),
  "Next useful item after floor plan should be site photos/design references."
);

check(
  "7. expected client-facing landed A&A price wording exists",
  v7.includes("I understand you'd like a rough idea. For landed A&A works, the team should review the floor plan, site photos, site condition and material direction first before advising.") &&
    v7.includes("We've received the floor plan, so site photos and any design references would be useful next."),
  "Exact approved response pieces should exist."
);

check(
  "8. low-info price question can still ask for property/scope/files",
  activeMissingSelector.includes('return ["scope", "floor_plan", "site_photos", "design_references"].filter') &&
    activePlannerComposer.includes('const followUp = ask || "Could you share the scope of work first for an initial project review?";'),
  "Low-context price enquiries still need safe basic intake."
);

check(
  "9. price replies give no amount/range/from/package",
  !/quote range|price range|from \$|usually around \$|package price|estimated price|rough estimate/i.test(replyReturnLiterals.replace(/budget expectation around \$500k/g, "budget expectation")),
  "No generated price amounts or ranges."
);

check(
  "10. health exposes v7.2.2 price proof fields",
  health.includes("priceReplyUsesKnownContext: true") &&
    health.includes("priceReplyNoBroadScopeAskForSeriousLandedAa: true") &&
    health.includes("priceReplyDoesNotAskReceivedFiles: true") &&
    health.includes("priceGuideOnHold: true") &&
    health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "Production health should show the surgical price fix and safety state."
);

check(
  "11. known-good WhatsApp payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)") &&
    !adapter.includes(wrongWhatsAppPhoneNumberId),
  "Meta send payload contract must remain untouched."
);

check(
  "12. calendar and voice safety remain off",
  health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("calendarAutoBookingEnabled: false") &&
    health.includes("voiceTranscriptionEnabled: false") &&
    decision.includes("voiceTranscriptionAttempted: false"),
  "No calendar auto-booking or voice transcription."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7.2.2 price reply known-context handling test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
