import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const apply = process.argv.includes("--apply");

function env(name) {
  return process.env[name] || "";
}

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

function mapLead(row) {
  return {
    id: row.id,
    clientName: row.client_name || "",
    phone: row.phone || "",
    source: row.source || "WhatsApp",
    division: row.division || "LIMM Works",
    propertyType: row.property_type || "",
    serviceType: row.service_type || "",
    scopeSummary: row.scope_summary || "",
    leadScore: row.lead_score || 0,
    leadCategory: row.lead_category || "Cold",
    status: row.status || "New Enquiry",
    missingInfo: Array.isArray(row.missing_info) ? row.missing_info : [],
    aiRecommendedNextAction: row.next_action || "",
    bossApprovalNeeded: Boolean(row.boss_approval_needed),
    appointmentSuitable: Boolean(row.appointment_suitable),
    appointmentType: row.appointment_type || "initial_project_review",
    appointmentReadiness: row.appointment_readiness || 0,
    quotationReadiness: row.quotation_readiness_score || 0,
    lastClientMessage: row.last_client_message || "",
    lastReplyAt: row.last_reply_at || null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || "",
    preferredContactTime: row.preferred_contact_time || "",
    riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
    propertyArea: row.property_area || "",
    postalCode: row.postal_code || "",
    projectAddress: row.project_address || "",
    intakeProfile: row.intake_profile || undefined
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    direction: row.direction,
    channel: row.channel,
    body: row.body || "",
    safeToSend: Boolean(row.safe_to_send),
    providerMessageId: row.provider_message_id || undefined,
    providerTimestamp: row.provider_timestamp || null,
    whatsappStatus: row.whatsapp_status || "",
    metadata: row.metadata || {},
    createdAt: row.created_at || new Date().toISOString()
  };
}

function buildPatch(lead, facts, leadFactsToLeadPatch) {
  const patch = leadFactsToLeadPatch(lead, facts);
  return {
    property_type: patch.propertyType,
    project_address: patch.projectAddress,
    postal_code: patch.postalCode,
    property_area: patch.propertyArea,
    scope_summary: patch.scopeSummary,
    preferred_contact_time: patch.preferredContactTime,
    missing_info: patch.missingInfo,
    quotation_readiness_score: patch.quotationReadiness,
    next_action: patch.aiRecommendedNextAction,
    intake_profile: patch.intakeProfile,
    updated_at: new Date().toISOString()
  };
}

function cleanPatch(patch) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  console.log("DRY RUN: Supabase admin env is not configured. No live data was scanned or changed.");
  console.log("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then rerun. Add --apply to write updates.");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const { buildLeadFacts, leadFactsToLeadPatch } = await loadLeadFactsModule();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: leadRows, error: leadError } = await supabase
  .from("leads")
  .select("*")
  .is("deleted_at", null)
  .is("archived_at", null)
  .neq("is_spam", true)
  .order("updated_at", { ascending: false });

if (leadError) throw new Error(`Lead scan failed: ${leadError.message}`);

let scanned = 0;
let proposed = 0;
let applied = 0;
const failures = [];

for (const row of leadRows || []) {
  scanned += 1;
  const lead = mapLead(row);
  const { data: messageRows, error: messageError } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(100);
  if (messageError) {
    failures.push({ leadId: lead.id, error: messageError.message });
    continue;
  }
  const messages = (messageRows || []).map(mapMessage);
  const facts = buildLeadFacts(lead, messages, []);
  const patch = cleanPatch(buildPatch(lead, facts, leadFactsToLeadPatch));
  const changedKeys = Object.keys(patch).filter((key) => key !== "updated_at");
  if (!changedKeys.length) continue;
  proposed += 1;
  console.log(`${apply ? "APPLY" : "DRY RUN"} lead=${lead.id} name="${lead.clientName}" completeness=${facts.infoCompletenessScore}% location=${facts.locationStatus} changes=${changedKeys.join(",")}`);
  if (!apply) continue;
  const { error: updateError } = await supabase.from("leads").update(patch).eq("id", lead.id);
  if (updateError) {
    failures.push({ leadId: lead.id, error: updateError.message });
    continue;
  }
  applied += 1;
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  mode: apply ? "apply" : "dry_run",
  scanned,
  proposed,
  applied,
  failures
}, null, 2));
