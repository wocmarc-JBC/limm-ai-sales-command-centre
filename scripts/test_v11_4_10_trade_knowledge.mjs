import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const knowledge = read("lib/whatsapp-trade-knowledge.ts");
const qualityGate = read("lib/whatsapp-reply-quality-gate.ts");
const releaseGate = read(".github/workflows/release-gate.yml");

for (const marker of [
  "structural_wall_assessment",
  "waterproofing_system_review",
  "tile_overlay_vs_hack",
  "tiling_material_and_installation",
  "existing_carpentry_modification",
  "carpentry_specification_review",
  "countertop_material_selection",
  "electrical_load_and_routing",
  "plumbing_route_and_fixture",
  "false_ceiling_clearance",
  "painting_surface_preparation",
  "hacking_scope_and_protection",
  "site_protection_planning",
  "renovation_sequencing",
  "approval_scope_review"
]) {
  assert.ok(knowledge.includes(marker), `Trade knowledge is missing ${marker}.`);
}

assert.match(knowledge, /priceQuestion\(text\)/);
assert.match(knowledge, /if \(!text \|\| !questionLike\(text\) \|\| priceQuestion\(text\)\) return null/);
assert.match(knowledge, /cannot be confirmed as removable from a photo alone/);
assert.match(knowledge, /Approval requirements depend on the property/);
assert.match(knowledge, /Which appliance, light or socket are you adding or relocating\?/);
assert.match(knowledge, /Which fixture are you moving or installing\?/);
assert.doesNotMatch(knowledge, /\$\d|S\$\d|guaranteed approval|guarantee approval|zero leakage guaranteed/i);
assert.doesNotMatch(knowledge, /WHATSAPP_ACCESS_TOKEN|sendWhatsApp|WhatsAppCloudApiAdapter/);

assert.match(qualityGate, /buildTradeKnowledgeReply/);
assert.match(qualityGate, /const tradeKnowledge = direct \? null : buildTradeKnowledgeReply/);
assert.match(qualityGate, /reason: direct\?\.reason \|\| \(tradeKnowledge \? "trade_knowledge_answer"/);
assert.match(qualityGate, /tradeKnowledgeUsed: Boolean\(tradeKnowledge\)/);
assert.match(qualityGate, /tradeKnowledgeKey: tradeKnowledge\?\.knowledgeKey/);
assert.match(qualityGate, /tradeKnowledgeTrade: tradeKnowledge\?\.trade/);
assert.match(releaseGate, /Verify v11\.4\.10 trade knowledge/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.10 deterministic trade answers, price-policy precedence, one-question composition, and no-send boundary");
