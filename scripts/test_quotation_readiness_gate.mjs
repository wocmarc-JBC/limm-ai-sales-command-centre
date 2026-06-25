import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const engine = read("lib/phase3-read-models.ts");
const page = read("app/quotation-readiness/page.tsx");
const button = read("components/QuotationReadinessGateActions.tsx");
const api = read("app/api/quotation-readiness/move/route.ts");

for (const status of [
  "Not Ready",
  "Basic Info Missing",
  "Files Needed",
  "Location Needed",
  "Boss Review Required",
  "Site Review Needed",
  "Ready for Quotation Review"
]) {
  assert(engine.includes(status), `Quotation gate missing status: ${status}`);
}

assert(engine.includes("!facts.propertyType.value || !facts.scopeSummary.value"), "Missing property/scope must block readiness.");
assert(engine.includes('facts.locationStatus === "missing_location"'), "Missing location must block readiness.");
assert(engine.includes("!facts.floorPlanReceived.value && !facts.sitePhotosReceived.value"), "Missing files must block readiness.");
assert(engine.includes("hasRiskyTechnicalScope"), "Landed/A&A/structural risk must require review.");
assert(engine.includes("canMoveToQuotationReview = readinessStatus === \"Ready for Quotation Review\""), "Move must only be allowed when ready.");

assert(page.includes("QuotationReadinessGateActions"), "Quotation page must use guarded action component.");
assert(page.includes("Open WhatsApp Chat") && page.includes("/inbox?lead="), "Quotation cards must open WhatsApp chat.");
assert(button.includes("disabled={!canMove || pending}"), "Move button must be disabled unless ready.");
assert(api.includes("buildQuotationReadinessGate"), "API must enforce readiness server-side.");
assert(api.includes("quotation_not_ready"), "API must reject unready leads with reason.");

const clientFacing = [engine, page, button].join("\n");
for (const unsafe of ["from $", "around $", "package price", "price range", "auto-pricing"]) {
  assert(!clientFacing.toLowerCase().includes(unsafe), `Quotation readiness must not generate/show pricing wording: ${unsafe}`);
}

console.log("PASS test_quotation_readiness_gate");
