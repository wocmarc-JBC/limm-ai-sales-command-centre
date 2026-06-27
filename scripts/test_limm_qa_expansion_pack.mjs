import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(ROOT, request.slice(2));
    if (fs.existsSync(target)) return target;
    if (fs.existsSync(`${target}.ts`)) return `${target}.ts`;
    if (fs.existsSync(`${target}.tsx`)) return `${target}.tsx`;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const {
  limmQaExpansionPackMetadata,
  limmQaScenarios,
  limmQaScenarioStats
} = require(path.join(ROOT, "lib/knowledge/limm-qa-scenarios.ts"));

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function countByCategory(scenarios) {
  return scenarios.reduce((acc, scenario) => {
    acc[scenario.category] = (acc[scenario.category] ?? 0) + 1;
    return acc;
  }, {});
}

function hasUnsafePrice(reply) {
  return /\bS\$\s*\d|\bSGD\s*\d|\$\s*\d|\bfrom\s*\$|\baround\s*\$|package price|price range|quote range/i.test(reply);
}

const ids = new Set(limmQaScenarios.map((scenario) => scenario.id));
const actualCategoryCounts = countByCategory(limmQaScenarios);
const mandarinOrMixedCount = limmQaScenarios.filter((scenario) => scenario.language_tags.includes("mandarin_or_mixed")).length;
const dreamHomeScenarios = limmQaScenarios.filter((scenario) => scenario.should_use_dream_home_phrase);
const commercialScenarios = limmQaScenarios.filter((scenario) => /commercial|office|shop/i.test(scenario.category));
const recoveryScenarios = limmQaScenarios.filter((scenario) => /frustrated|repeated|recovery/i.test(scenario.category));
const priceScenarios = limmQaScenarios.filter((scenario) => /price|cost|package/i.test(scenario.category) || scenario.qa_checks.includes("scope_first_price_handling"));

assert(limmQaExpansionPackMetadata.packId === "limm-qa-expansion-pack-v10.1", "Pack id must match v10.1 source.");
assert(limmQaScenarios.length === 200, `Expected exactly 200 scenarios, got ${limmQaScenarios.length}.`);
assert(limmQaExpansionPackMetadata.scenarioCount === 200, "Metadata scenario count must remain 200.");
assert(limmQaScenarioStats.scenarioCount === 200, "Stats scenario count must remain 200.");
assert(ids.size === limmQaScenarios.length, "Scenario ids must be unique.");
assert(mandarinOrMixedCount === limmQaExpansionPackMetadata.mandarinOrMixedCount, "Mandarin/mixed count must match metadata.");
assert(mandarinOrMixedCount >= 35, "Mandarin/mixed coverage must be at least 35 scenarios.");

for (const [category, expected] of Object.entries(limmQaExpansionPackMetadata.categoryCounts)) {
  assert(actualCategoryCounts[category] === expected, `Category count mismatch for ${category}: expected ${expected}, got ${actualCategoryCounts[category] ?? 0}.`);
}

for (const scenario of limmQaScenarios) {
  assert(scenario.should_auto_price === false, `${scenario.id} must not enable auto-pricing.`);
  assert(scenario.should_auto_book === false, `${scenario.id} must not enable auto-booking.`);
  assert(scenario.should_enable_voice_transcription === false, `${scenario.id} must not enable voice transcription.`);
  assert(Array.isArray(scenario.client_examples) && scenario.client_examples.length > 0, `${scenario.id} needs client examples.`);
  assert(scenario.ideal_reply_en.trim().length > 0, `${scenario.id} needs an ideal reply.`);
}

for (const scenario of priceScenarios) {
  assert(!hasUnsafePrice(`${scenario.ideal_reply_en} ${scenario.ideal_reply_zh ?? ""}`), `${scenario.id} price scenario must not contain price/range/package amount wording.`);
}

for (const scenario of commercialScenarios) {
  assert(!/dream home/i.test(`${scenario.ideal_reply_en} ${scenario.ideal_reply_zh ?? ""}`), `${scenario.id} commercial scenario must not use dream-home phrase.`);
  assert(scenario.should_use_dream_home_phrase === false, `${scenario.id} commercial scenario must not require dream-home phrase.`);
}

for (const scenario of recoveryScenarios) {
  assert(!/dream home/i.test(`${scenario.ideal_reply_en} ${scenario.ideal_reply_zh ?? ""}`), `${scenario.id} recovery scenario must not use dream-home phrase.`);
  assert(scenario.should_use_dream_home_phrase === false, `${scenario.id} recovery scenario must not require dream-home phrase.`);
}

for (const scenario of dreamHomeScenarios) {
  assert(/dream home|理想的家/i.test(`${scenario.ideal_reply_en} ${scenario.ideal_reply_zh ?? ""}`), `${scenario.id} dream-home scenario must include contextual dream-home phrase.`);
}

const qaCentre = read("app/qa-centre/page.tsx");
assert(qaCentre.includes("limmQaScenarios"), "QA Centre must import Q&A expansion scenarios.");
assert(qaCentre.includes("Open Q&A Expansion Pack"), "QA Centre must expose Q&A Expansion Pack action.");
assert(qaCentre.includes("Q&A Expansion Pack"), "QA Centre must render Q&A Expansion Pack section.");
assert(qaCentre.includes("No WhatsApp message will be sent."), "QA Centre must remain simulation-only.");
assert(!/Send WhatsApp|fetch\("\/api\/inbox\/send"|sendWhatsAppTextMessage|adapter\.sendReply/.test(qaCentre), "QA Centre must not expose live WhatsApp send.");

const source = read("lib/knowledge/limm-qa-scenarios.ts");
assert(source.includes("Generated from docs/limm-qa-expansion-pack-v10.1.json"), "Knowledge file should retain source provenance.");

console.log("PASS: LIMM Q&A Expansion Pack v10.1");
console.log(`Scenarios: ${limmQaScenarios.length}`);
console.log(`Categories: ${Object.keys(limmQaExpansionPackMetadata.categoryCounts).length}`);
console.log(`Mandarin/mixed: ${mandarinOrMixedCount}`);
