import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);

async function loadLeadFactsModule() {
  const ts = await import("typescript");
  const sourcePath = path.join(projectRoot, "lib", "lead-facts.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require,
    console
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return Object.keys(sandbox.module.exports).length ? sandbox.module.exports : sandbox.exports;
}

function lead(overrides = {}) {
  return {
    id: "lead-1",
    clientName: "Client",
    phone: "6599999999",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "initial_project_review",
    scopeSummary: "",
    leadScore: 25,
    leadCategory: "Cold",
    status: "New Enquiry",
    missingInfo: [],
    aiRecommendedNextAction: "",
    bossApprovalNeeded: false,
    appointmentSuitable: false,
    appointmentType: "initial_project_review",
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    preferredContactTime: "",
    riskFlags: [],
    ...overrides
  };
}

function message(body, metadata = {}, id = `msg-${Math.random()}`) {
  return {
    id,
    leadId: "lead-1",
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: false,
    providerMessageId: id,
    providerTimestamp: null,
    whatsappStatus: "received",
    metadata,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

const { buildLeadFacts, leadFactsToLeadPatch } = await loadLeadFactsModule();

const facts = buildLeadFacts(lead(), [
  message("Hi, I want to do landed A&A at 47 Kasai Road Singapore 808123. Can make appt wed 2pm? How much roughly?", {}, "msg-1"),
  message("floor plan attached", { messageType: "document", filename: "floorplan.pdf", mimeType: "application/pdf" }, "msg-2")
]);

assert.equal(facts.propertyType.value, "landed", "should capture landed property type");
assert.match(facts.scopeSummary.value, /A&A|extension|renovation/i, "should capture scope");
assert.equal(facts.postalCode.value, "808123", "should capture postal code");
assert.match(facts.addressRaw.value, /Kasai Road/i, "should capture address");
assert.equal(facts.floorPlanReceived.value, true, "should capture floor plan document");
assert.match(facts.appointmentPreference.value, /wed|appointment/i, "should capture appointment preference");
assert.match(facts.budgetExpectation.value, /budget|quotation/i, "should capture budget expectation without generating price");
assert.equal(facts.locationStatus, "full_address_captured", "address + postal should be full address captured");
assert.ok(facts.infoCompletenessScore >= 70, "facts completeness should increase with evidence");

const verifiedLead = lead({
  projectAddress: "Verified Marcus Address",
  intakeProfile: {
    trace: {
      leadFacts: {
        addressRaw: {
          value: "Verified Marcus Address",
          confidence: "verified",
          verifiedByMarcus: true
        },
        conflictFields: []
      }
    }
  }
});
const protectedFacts = buildLeadFacts(verifiedLead, [
  message("Actually address is 99 Wrong Road Singapore 999999", {}, "msg-3")
]);
assert.equal(protectedFacts.addressRaw.value, "Verified Marcus Address", "verified data cannot be overwritten");
assert.ok(protectedFacts.conflictFields.includes("address"), "conflict should be flagged instead of silently overwritten");

const patch = leadFactsToLeadPatch(lead(), facts);
assert.equal(patch.propertyType, "landed", "patch should map property type");
assert.equal(patch.postalCode, "808123", "patch should map postal code");
assert.ok(patch.intakeProfile?.trace?.leadFacts, "patch should persist facts in intakeProfile trace");

console.log("PASS test_lead_facts_extraction");
