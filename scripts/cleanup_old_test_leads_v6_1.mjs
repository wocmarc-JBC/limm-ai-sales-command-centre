import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = path.join(root, "reports", "V6_1_TEST_LEAD_CLEANUP_REPORT.md");
const now = new Date().toISOString();

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

const applyMode = process.argv.includes("--apply");
const hardDeleteTestData = process.argv.includes("--hard-delete-test-data");
const fixturePath = argValue("--fixture");
const reportPath = argValue("--report")
  ? path.resolve(root, argValue("--report"))
  : defaultReportPath;

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

function maskPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "not provided";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function textOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeLead(row) {
  return {
    id: row.id,
    clientName: row.client_name ?? row.clientName ?? "",
    contactName: row.contact_name ?? row.contactName ?? "",
    displayName: row.display_name ?? row.displayName ?? "",
    phoneLabel: row.phone_label ?? row.phoneLabel ?? "",
    title: row.title ?? row.crm_title ?? row.crmTitle ?? "",
    phone: row.phone ?? "",
    source: row.source ?? "",
    status: row.status ?? "",
    lastClientMessage: row.last_client_message ?? row.lastClientMessage ?? "",
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    isTest: Boolean(row.is_test ?? row.isTest),
    isSpam: Boolean(row.is_spam ?? row.isSpam),
    metadata: row.metadata ?? {},
    raw: row
  };
}

function normalizeMessage(row) {
  return {
    leadId: row.lead_id ?? row.leadId ?? "",
    body: row.body ?? row.text ?? row.caption ?? "",
    title: row.title ?? row.message_title ?? row.messageTitle ?? "",
    metadata: row.metadata ?? {},
    providerMessageId: row.provider_message_id ?? row.providerMessageId ?? "",
    createdAt: row.created_at ?? row.createdAt ?? ""
  };
}

function protectedPersonEvidence(lead, messages) {
  const protectedText = [
    lead.clientName,
    lead.contactName,
    lead.displayName,
    lead.phoneLabel,
    lead.title,
    lead.lastClientMessage,
    ...messages.map((message) => `${message.body} ${message.title}`)
  ].join("\n");
  const matches = [];
  if (/marcus/i.test(protectedText)) matches.push("Marcus");
  if (/fio/i.test(protectedText)) matches.push("Fio");
  if (/fion/i.test(protectedText)) matches.push("Fion");
  return [...new Set(matches)];
}

function isFakePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  return /^(0+|1+|9{7,}|1234567|6599999999|6500000000)$/.test(digits)
    || /(000000|999999|1234567)$/.test(digits);
}

function scoreLead(lead, messages) {
  const reasons = [];
  const weakReasons = [];
  const protectedPeople = protectedPersonEvidence(lead, messages);
  const haystack = [
    lead.id,
    lead.clientName,
    lead.contactName,
    lead.displayName,
    lead.phoneLabel,
    lead.title,
    lead.source,
    lead.lastClientMessage,
    textOf(lead.metadata),
    ...messages.map((message) => `${message.body} ${textOf(message.metadata)} ${message.providerMessageId}`)
  ].join("\n").toLowerCase();

  if (lead.isTest) reasons.push("already marked is_test");
  if (/\b(test|qa|sample|sandbox)\b/.test(String(lead.clientName).toLowerCase())) reasons.push("client name clearly marks test/QA/sample/sandbox");
  if (/\b(demo lead|demo client|demo qa|test demo|sample demo)\b/.test(String(lead.clientName).toLowerCase())) reasons.push("client name clearly marks demo test data");
  if (/\b(v[3456][_ -]?qa|v[3456][_ -]?test|dev[_ -]?brain|playwright|browser qa|live[_ -]?test|test marker)\b/.test(haystack)) reasons.push("QA/test marker found in metadata or messages");
  if (/\b(v4_live_test|v4_1_dev_brain_test|v5_3|v6_ultimate|v6_1|test_marker)\b/.test(haystack)) reasons.push("versioned QA marker found");
  if (isFakePhone(lead.phone)) reasons.push("phone looks fake/test-only");
  if (/\b(seed_demo|script seed|generated qa|fixture)\b/.test(haystack)) reasons.push("created by seed/fixture/QA script");

  const knownTestPhrases = [
    "hello...can help me do my kitchen?",
    "do kitchen and demo 2 wall can?",
    "how much ah",
    "can make appt wed 2pm?",
    "can see your past works?",
    "got landed project photo?",
    "voice test",
    "floor plan test",
    "laminated wall cladding test"
  ];
  for (const phrase of knownTestPhrases) {
    if (haystack.includes(phrase)) weakReasons.push(`known QA phrase: ${phrase}`);
  }

  const clearlyTest = protectedPeople.length ? false : reasons.length > 0 || weakReasons.length >= 2;
  return {
    clearlyTest,
    protectedPeople,
    reasons,
    weakReasons,
    riskWarning: protectedPeople.length
      ? `Protected lead contains ${protectedPeople.join(" and ")}; excluded from cleanup completely.`
      : clearlyTest
        ? ""
        : "Not clearly test data; no cleanup action planned."
  };
}

function plannedActionFor(lead, score) {
  if (score.protectedPeople.length) return "protected_marcus_fio";
  if (!score.clearlyTest) return "not_touched";
  if (hardDeleteTestData && lead.deletedAt) return "hard_delete_test_data";
  if (lead.deletedAt) return "already_soft_deleted_keep";
  return "mark_test_and_soft_delete";
}

function getConfig() {
  loadLocalEnv();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  };
}

async function supabaseRequest(pathname, options = {}) {
  const config = getConfig();
  if (!config.url || !config.serviceRole) {
    throw new Error("Supabase URL and service role key are required for live cleanup scans/writes.");
  }
  const url = `${config.url.replace(/\/$/, "")}/rest/v1/${pathname}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: config.serviceRole,
      Authorization: `Bearer ${config.serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}) for ${pathname}: ${body?.message ?? "unknown error"}`);
  }
  return body;
}

async function loadData() {
  if (fixturePath) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(root, fixturePath), "utf8"));
    return {
      source: "fixture",
      leads: (fixture.leads ?? fixture).map(normalizeLead),
      messages: (fixture.messages ?? []).map(normalizeMessage),
      warnings: []
    };
  }

  const config = getConfig();
  if (!config.url || !config.serviceRole) {
    return {
      source: "not_configured",
      leads: [],
      messages: [],
      warnings: ["Live Supabase admin env is missing. No live leads were scanned. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally, then rerun dry run."]
    };
  }

  const leads = await supabaseRequest("leads?select=*&order=updated_at.desc&limit=1000");
  const messages = await supabaseRequest("lead_messages?select=*&order=created_at.desc&limit=2000");
  return {
    source: "supabase",
    leads: leads.map(normalizeLead),
    messages: messages.map(normalizeMessage),
    warnings: []
  };
}

async function writeAudit(lead, action, summary, metadata) {
  await supabaseRequest("audit_logs", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      actor: "v6.1 cleanup script",
      actor_type: "system",
      actor_name: "v6.1 cleanup script",
      actor_email: "",
      actor_id: null,
      action,
      entity_type: "lead",
      entity_id: lead.id,
      summary,
      before_data: {
        status: lead.status,
        deleted_at: lead.deletedAt,
        is_test: lead.isTest,
        is_spam: lead.isSpam
      },
      after_data: metadata.afterData ?? null,
      metadata,
      created_at: now
    })
  });
}

async function applyCleanup(plan) {
  const results = [];
  for (const item of plan) {
    if (!["mark_test_and_soft_delete", "hard_delete_test_data"].includes(item.action)) {
      results.push({ ...item, result: "skipped" });
      continue;
    }
    if (item.action === "mark_test_and_soft_delete") {
      const afterData = {
        is_test: true,
        deleted_at: now,
        deleted_by: "v6.1 cleanup script",
        delete_reason: "Old QA/test lead cleanup via v6.1 dry-run-reviewed script.",
        lead_level: "Spam/Test",
        mission_category: "Test/Spam Cleanup"
      };
      await writeAudit(item.lead, "lead_test_cleanup_soft_delete_planned", "v6.1 cleanup marked this clearly identified test lead for soft delete.", {
        dryRunReviewed: true,
        reasons: item.reasons,
        weakReasons: item.weakReasons,
        afterData
      });
      await supabaseRequest(`leads?id=eq.${encodeURIComponent(item.lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify(afterData)
      });
      results.push({ ...item, result: "soft_deleted" });
      continue;
    }

    if (item.action === "hard_delete_test_data") {
      await writeAudit(item.lead, "lead_test_cleanup_hard_delete_pre_audit", "v6.1 cleanup permanently deleted already-soft-deleted test data after explicit hard-delete flag.", {
        hardDeleteExplicitFlag: true,
        reasons: item.reasons,
        weakReasons: item.weakReasons
      });
      await supabaseRequest(`leads?id=eq.${encodeURIComponent(item.lead.id)}`, { method: "DELETE" });
      results.push({ ...item, result: "hard_deleted" });
    }
  }
  return results;
}

function simulateFixtureApply(plan) {
  return plan.map((item) => {
    if (item.action === "mark_test_and_soft_delete") return { ...item, result: "soft_deleted" };
    if (item.action === "hard_delete_test_data") return { ...item, result: "hard_deleted" };
    return { ...item, result: "skipped" };
  });
}

function buildPlan(leads, messages) {
  return leads.map((lead) => {
    const leadMessages = messages.filter((message) => message.leadId === lead.id);
    const score = scoreLead(lead, leadMessages);
    return {
      lead,
      action: plannedActionFor(lead, score),
      reasons: score.reasons,
      weakReasons: score.weakReasons,
      protectedPeople: score.protectedPeople,
      riskWarning: score.riskWarning,
      messageCount: leadMessages.length
    };
  });
}

function renderReport({ source, warnings, plan, results = [] }) {
  const cleanable = plan.filter((item) => ["mark_test_and_soft_delete", "hard_delete_test_data", "already_soft_deleted_keep"].includes(item.action));
  const protectedCount = plan.filter((item) => item.action === "protected_marcus_fio").length;
  const skippedUncertain = plan.filter((item) => item.action === "not_touched").length;
  const softDeleted = results.filter((item) => item.result === "soft_deleted").length;
  const hardDeleted = results.filter((item) => item.result === "hard_deleted").length;
  const cleaned = softDeleted + hardDeleted;
  const lines = [
    "# V6.1 Test Lead Cleanup Report",
    "",
    `Mode: ${applyMode ? "APPLY" : "DRY RUN"}`,
    `Source: ${source}`,
    `Generated: ${now}`,
    "",
    "## Summary",
    "",
    `- Total leads scanned: ${plan.length}`,
    `- Test leads identified: ${cleanable.length}`,
    `- Test leads cleaned: ${cleaned}`,
    `- Marcus/Fio leads protected: ${protectedCount}`,
    `- Skipped uncertain leads: ${skippedUncertain}`,
    `- Soft-deleted: ${softDeleted}`,
    `- Hard-deleted: ${hardDeleted}`,
    `- Leads not touched: ${skippedUncertain + protectedCount}`,
    `- Hard delete flag enabled: ${hardDeleteTestData ? "yes" : "no"}`,
    "",
    "## Safety Rules",
    "",
    "- Dry run is default.",
    "- Apply requires `--apply`.",
    "- Cleanup defaults to mark test + soft delete.",
    "- Hard delete requires `--hard-delete-test-data` and the lead must already be soft-deleted.",
    "- Any lead mentioning Marcus or Fio in name, contact/display name, phone label, title, or message content is excluded completely.",
    "- Audit logs are not deleted.",
    "- Real-looking leads are not touched.",
    ""
  ];

  if (warnings.length) {
    lines.push("## Warnings", "");
    for (const warning of warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push("## Leads Selected For Cleanup", "");
  const selected = plan.filter((item) => ["mark_test_and_soft_delete", "hard_delete_test_data"].includes(item.action));
  if (!selected.length) {
    lines.push("None.", "");
  } else {
    for (const item of selected) {
      lines.push(`- ${item.lead.clientName || item.lead.id} (${item.action})`);
    }
    lines.push("");
  }

  lines.push("## Marcus / Fio Protected Leads", "");
  const protectedItems = plan.filter((item) => item.action === "protected_marcus_fio");
  if (!protectedItems.length) {
    lines.push("None found.", "");
  } else {
    for (const item of protectedItems) {
      lines.push(`- ${item.lead.clientName || item.lead.id}: ${item.protectedPeople.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Planned / Applied Actions", "");
  for (const item of plan) {
    const result = results.find((entry) => entry.lead.id === item.lead.id)?.result ?? (applyMode ? "skipped" : "dry_run_only");
    lines.push(`### ${item.lead.clientName || item.lead.id}`);
    lines.push(`- Lead id: ${item.lead.id}`);
    lines.push(`- Phone: ${maskPhone(item.lead.phone)}`);
    lines.push(`- Action: ${item.action}`);
    lines.push(`- Result: ${result}`);
    lines.push(`- Messages checked: ${item.messageCount}`);
    lines.push(`- Protected names found: ${item.protectedPeople.join(", ") || "None"}`);
    lines.push(`- Strong reasons: ${item.reasons.join("; ") || "None"}`);
    lines.push(`- Weak reasons: ${item.weakReasons.join("; ") || "None"}`);
    lines.push(`- Risk warning: ${item.riskWarning || "None"}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const data = await loadData();
const plan = buildPlan(data.leads, data.messages);
let results = [];
if (applyMode) {
  if (data.source === "fixture") {
    data.warnings.push("Fixture apply simulation only. No live writes or audit inserts were performed.");
    results = simulateFixtureApply(plan);
  } else if (data.source !== "supabase") {
    data.warnings.push("Apply mode requires live Supabase admin env. No writes were performed.");
  } else {
    results = await applyCleanup(plan);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, renderReport({ ...data, plan, results }), "utf8");

const identified = plan.filter((item) => item.action !== "not_touched").length;
console.log(`${applyMode ? "APPLY" : "DRY RUN"}: scanned ${plan.length} leads; identified ${identified} test leads.`);
console.log(`Report: ${path.relative(root, reportPath)}`);
if (data.warnings.length) {
  for (const warning of data.warnings) console.log(`WARN: ${warning}`);
}
