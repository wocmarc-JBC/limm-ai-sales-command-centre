import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const applyMode = process.argv.includes("--apply");
const now = new Date().toISOString();

function loadLocalEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function stringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeLead(row) {
  return {
    id: row.id,
    clientName: row.client_name ?? "",
    phone: row.phone ?? "",
    source: row.source ?? "",
    status: row.status ?? "",
    lastClientMessage: row.last_client_message ?? "",
    scopeSummary: row.scope_summary ?? "",
    conversationSummary: row.conversation_summary ?? "",
    missionCategory: row.mission_category ?? "",
    stageNotes: row.stage_notes ?? "",
    leadLevel: row.lead_level ?? "",
    isTest: Boolean(row.is_test),
    isSpam: Boolean(row.is_spam),
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null,
    raw: row
  };
}

function normalizeMessage(row) {
  return {
    leadId: row.lead_id ?? "",
    body: row.body ?? "",
    metadata: row.metadata ?? {},
    providerMessageId: row.provider_message_id ?? ""
  };
}

function qaReasons(lead, messages) {
  const reasons = [];
  const text = [
    lead.id,
    lead.clientName,
    lead.phone,
    lead.source,
    lead.lastClientMessage,
    lead.scopeSummary,
    lead.conversationSummary,
    lead.missionCategory,
    lead.stageNotes,
    lead.leadLevel,
    stringify(lead.raw?.metadata),
    ...messages.map((message) => `${message.body} ${stringify(message.metadata)} ${message.providerMessageId}`)
  ].join("\n");
  const lower = text.toLowerCase();

  if (lead.isTest) reasons.push("already marked is_test");
  if (/\btest\b|test_only|test-only/i.test(lead.phone)) reasons.push("phone contains explicit test marker");
  if (/^\+?65[_ -]?test[_ -]?only$/i.test(lead.phone.trim())) reasons.push("phone equals +65_TEST_ONLY");
  if (/test_only|test-only/i.test(lead.clientName)) reasons.push("name contains explicit TEST_ONLY marker");
  if (/test-only marker/i.test(text)) reasons.push("message contains Test-only marker");
  if (/browser qa scope/i.test(text)) reasons.push("scope contains browser QA scope");
  if (/browser qa|seed qa|generated qa|test generated|codex qa|codex browser qa|playwright|auth boss browser test/i.test(text)) {
    reasons.push("source or metadata contains QA seed marker");
  }
  if (/\bqa[_ -]?seed|seed[_ -]?qa|qa[_ -]?fixture|browser[_ -]?fixture\b/i.test(lower)) reasons.push("known QA seed fixture marker");

  return [...new Set(reasons)];
}

function maskPhone(phone) {
  const value = String(phone ?? "");
  if (/test/i.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "not provided";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function insertAudit(supabase, lead, reasons) {
  const payload = {
    actor: "system",
    actor_type: "system",
    actor_name: "Production lifecycle cleanup",
    action: "lead_marked_qa_test",
    entity_type: "lead",
    entity_id: lead.id,
    summary: "Lead marked as QA/test and archived from daily production screens.",
    before_data: {
      is_test: lead.isTest,
      archived_at: lead.archivedAt,
      status: lead.status
    },
    after_data: {
      is_test: true,
      archived_at: now
    },
    metadata: {
      productionLeadLifecycleCleanup: true,
      reasons
    }
  };
  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) {
    console.warn(`WARN: audit insert skipped for ${lead.id}: ${error.message}`);
  }
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("DRY RUN: Supabase admin env not configured. No data changed.");
    console.log("Required for live scan/apply: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: leadRows, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (leadsError) throw new Error(`Lead scan failed: ${leadsError.message}`);

  const leads = (leadRows ?? []).map(normalizeLead);
  const leadIds = leads.map((lead) => lead.id).filter(Boolean);
  const { data: messageRows, error: messageError } = leadIds.length
    ? await supabase
      .from("lead_messages")
      .select("*")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(Math.max(leadIds.length * 6, 60))
    : { data: [], error: null };
  if (messageError) throw new Error(`Message scan failed: ${messageError.message}`);

  const messagesByLead = new Map();
  for (const message of (messageRows ?? []).map(normalizeMessage)) {
    const current = messagesByLead.get(message.leadId) ?? [];
    if (current.length < 6) {
      current.push(message);
      messagesByLead.set(message.leadId, current);
    }
  }

  const matches = leads
    .map((lead) => ({
      lead,
      reasons: qaReasons(lead, messagesByLead.get(lead.id) ?? [])
    }))
    .filter((item) => item.reasons.length > 0 && !item.lead.deletedAt && !item.lead.isSpam);

  console.log(`${applyMode ? "APPLY" : "DRY RUN"}: scanned ${leads.length} leads; matched ${matches.length} QA/test records.`);
  for (const item of matches) {
    console.log([
      `- ${item.lead.id}`,
      `name="${item.lead.clientName || "Unknown"}"`,
      `phone="${maskPhone(item.lead.phone)}"`,
      `current="${item.lead.archivedAt ? "archived" : item.lead.isTest ? "qa_test" : item.lead.status || "unknown"}"`,
      `proposed="archived/qa_test"`,
      `reason="${item.reasons.join("; ")}"`
    ].join(" | "));
  }

  if (!applyMode) {
    console.log("No changes made. Re-run with --apply to mark matched records as archived/qa_test.");
    return;
  }

  let updated = 0;
  for (const item of matches) {
    const { error } = await supabase
      .from("leads")
      .update({
        is_test: true,
        archived_at: item.lead.archivedAt ?? now,
        archived_by: "Production lifecycle cleanup",
        archived_reason: `QA/test record hidden from daily screens: ${item.reasons.join("; ")}`,
        lead_level: "Spam/Test",
        mission_category: "QA/Test Archive",
        updated_at: now
      })
      .eq("id", item.lead.id);
    if (error) {
      console.warn(`WARN: update failed for ${item.lead.id}: ${error.message}`);
      continue;
    }
    updated += 1;
    await insertAudit(supabase, item.lead, item.reasons);
  }

  console.log(`APPLY complete: marked ${updated} QA/test records. No records hard-deleted.`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
