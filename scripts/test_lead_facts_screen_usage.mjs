import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const checks = [
  {
    file: "app/inbox/page.tsx",
    mustContain: ["buildLeadFacts", "leadFactsLocationLabel", "infoCompletenessScore", "missingFields"],
    description: "Inbox initial server payload uses Lead Facts."
  },
  {
    file: "app/api/inbox/conversations/[leadId]/route.ts",
    mustContain: ["buildLeadFacts", "leadFactsLocationLabel", "infoCompletenessScore", "missingFields"],
    description: "Selected conversation API uses Lead Facts."
  },
  {
    file: "components/inbox/MultiChatInbox.tsx",
    mustContain: ["Lead Facts", "infoCompletenessScore", "referenceImagesStatus", "locationStatus"],
    description: "Inbox right panel renders Lead Facts."
  },
  {
    file: "components/LeadCard.tsx",
    mustContain: ["buildLeadFacts", "Lead facts completeness", "facts.nextAction"],
    description: "Command Core/lead cards use facts for next action."
  },
  {
    file: "lib/mission-map.ts",
    mustContain: ["buildLeadFacts", "locationStatus", "infoCompletenessScore"],
    description: "Mission Map uses facts before inferring location."
  },
  {
    file: "lib/quotation-readiness.ts",
    mustContain: ["buildLeadFacts", "facts.floorPlanReceived", "facts.budgetExpectation"],
    description: "Quotation readiness uses facts."
  },
  {
    file: "lib/whatsapp-auto-reply.ts",
    mustContain: ["updateLeadFactsFromEvidence", "lead_facts_extracted"],
    description: "Live WhatsApp inbound path updates facts."
  }
];

for (const check of checks) {
  const source = read(check.file);
  for (const text of check.mustContain) {
    assert.ok(source.includes(text), `${check.description} Missing ${text} in ${check.file}`);
  }
}

const missionMap = read("lib/mission-map.ts");
assert.ok(!/description:\s*facts\.addressRaw\.value/.test(missionMap), "Mission Map must not expose full address as pin description.");

console.log("PASS test_lead_facts_screen_usage");
