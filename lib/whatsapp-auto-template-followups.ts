import "server-only";

import { createAuditLog } from "@/lib/data/audit-repository";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { saveLeadMessage } from "@/lib/data/lead-messages-repository";
import { beginVerifiedCompletion } from "@/lib/data/verified-completion-repository";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import {
  FOLLOWUP_TEMPLATE_BODY,
  FOLLOWUP_TEMPLATE_CATEGORY,
  FOLLOWUP_TEMPLATE_LANGUAGE,
  FOLLOWUP_TEMPLATE_NAME,
  getMetaFollowupTemplate,
  sendMetaApprovedFollowup
} from "@/lib/whatsapp-approved-template-followups";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_RUN = 5;
const MAX_CANDIDATES_PER_RUN = 40;
const STOP_PATTERN = /^\s*(?:stop|unsubscribe|opt\s*out|do\s*not\s*contact(?:\s*me)?|no\s*more\s*messages)\s*[.!]?\s*$/i;

type AutoFollowupResult = {
  enabled: boolean;
  templateApproved: boolean;
  considered: number;
  reserved: number;
  providerAccepted: number;
  failed: number;
  skipped: number;
};

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

async function legacyPolicyBlocked(admin: AdminClient, leadId: string, companyId: string) {
  const { data, error } = await admin.rpc("whatsapp_v16_1_policy_block_state", {
    p_lead_id: leadId, p_company_id: companyId
  });
  if (error || !data || typeof data !== "object") {
    throw new Error("legacy_whatsapp_policy_check_failed");
  }
  return data.blocked === true || data.blocked === "true";
}

async function isBlocked(admin: AdminClient, leadId: string, companyId: string, phone: string) {
  const { data, error } = await admin.from("whatsapp_blocklist")
    .select("id").eq("company_id", companyId).eq("active", true)
    .or("lead_id.eq." + leadId + ",normalized_phone.eq." + phone).limit(1);
  if (error) throw new Error("whatsapp_blocklist_check_failed");
  return Boolean(data?.length);
}

async function hasStopAfterConsent(admin: AdminClient, leadId: string, consentedAt: string) {
  const { data, error } = await admin.from("lead_messages")
    .select("body").eq("lead_id", leadId).eq("channel", "whatsapp")
    .eq("direction", "inbound").gte("created_at", consentedAt)
    .order("created_at", { ascending: false }).limit(250);
  if (error || !data || data.length >= 250) throw new Error("customer_opt_out_check_incomplete");
  return data.some((m) => STOP_PATTERN.test(String(m.body ?? "")));
}

function eligibleLead(lead: Record<string, unknown>) {
  return Boolean(
    lead.conversation_route === "sales_lead" &&
    lead.lead_eligible === true &&
    !lead.is_spam && !lead.is_test && !lead.deleted_at && !lead.archived_at &&
    !lead.bot_paused && !lead.needs_marcus && !lead.boss_approval_needed &&
    !["won", "lost", "not suitable"].includes(String(lead.status ?? "").toLowerCase()) &&
    !["won", "lost"].includes(String(lead.sales_stage ?? "").toLowerCase())
  );
}

async function countPriorTemplateFollowup(admin: AdminClient, leadId: string, lastSevenDays: string) {
  const { data, error } = await admin.from("lead_messages").select("id")
    .eq("lead_id", leadId).eq("channel", "whatsapp").eq("direction", "outbound")
    .contains("metadata", { templateSend: true })
    .gte("created_at", lastSevenDays).limit(1);
  if (error) throw new Error("prior_template_lookup_failed");
  return Boolean(data?.length);
}

/**
 * Scheduled re-engagement is deliberately narrower than Meta policy:
 * - explicit recorded marketing opt-in, no STOP, no spam/vendor/human takeover
 * - newest verified customer inbound is 25-71 hours old
 * - maximum one automatic attempt per inbound and one template per 7 days
 * - no retries after reservation (network ambiguity cannot cause duplicates)
 * - at most 5 sends per 09:15 SGT daily run
 * - totally off unless WHATSAPP_TEMPLATE_FOLLOWUPS_AUTO_ENABLED=true
 */
export async function runAutomaticApprovedTemplateFollowups(): Promise<AutoFollowupResult> {
  const result: AutoFollowupResult = {
    enabled: process.env.WHATSAPP_TEMPLATE_FOLLOWUPS_AUTO_ENABLED === "true",
    templateApproved: false,
    considered: 0,
    reserved: 0,
    providerAccepted: 0,
    failed: 0,
    skipped: 0
  };
  if (!result.enabled) return result;
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("whatsapp_template_followup_admin_unavailable");

  const template = await getMetaFollowupTemplate();
  if (!template?.approved) return result;
  result.templateApproved = true;

  const { data: consents, error: consentsError } = await admin
    .from("whatsapp_followup_consents")
    .select("lead_id,company_id,consented_at,status")
    .eq("category", FOLLOWUP_TEMPLATE_CATEGORY)
    .eq("status", "OPTED_IN")
    .not("consented_at", "is", null)
    .order("consented_at", { ascending: false })
    .limit(MAX_CANDIDATES_PER_RUN);
  if (consentsError) throw new Error("whatsapp_template_consent_candidates_unavailable");
  const nowMs = Date.now();
  for (const consent of consents ?? []) {
    if (result.providerAccepted >= MAX_SENDS_PER_RUN) break;
    result.considered++;
    const leadId = String(consent.lead_id);
    const companyId = String(consent.company_id);
    try {
      const { data: lead, error: leadError } = await admin.from("leads")
        .select("id,company_id,phone,conversation_route,lead_eligible,is_spam,is_test,deleted_at,archived_at,bot_paused,needs_marcus,boss_approval_needed,status,sales_stage")
        .eq("id", leadId).eq("company_id", companyId).maybeSingle();
      if (leadError || !lead) throw new Error("lead_state_unavailable");
      if (!eligibleLead(lead)) { result.skipped++; continue; }
      const phone = normalizeWhatsAppPhone(String(lead.phone ?? ""));
      if (!/^\d{8,15}$/.test(phone)) { result.skipped++; continue; }

      const { data: inboundRows, error: inboundError } = await admin.from("lead_messages")
        .select("id,provider_timestamp,created_at").eq("lead_id", leadId).eq("channel", "whatsapp")
        .eq("direction", "inbound").not("provider_timestamp", "is", null)
        .order("provider_timestamp", { ascending: false }).limit(1);
      if (inboundError) throw new Error("last_provider_inbound_unavailable");
      const inbound = inboundRows?.[0];
      if (!inbound?.id || !inbound.provider_timestamp) { result.skipped++; continue; }

      const inboundMs = Date.parse(String(inbound.provider_timestamp));
      if (!Number.isFinite(inboundMs)) { result.skipped++; continue; }
      const hoursSinceInbound = (nowMs - inboundMs) / ONE_HOUR_MS;
      if (hoursSinceInbound < 25 || hoursSinceInbound > 71) { result.skipped++; continue; }

      const consentedAt = String(consent.consented_at);
      if (await hasStopAfterConsent(admin, leadId, consentedAt) ||
          await isBlocked(admin, leadId, companyId, phone) ||
          await legacyPolicyBlocked(admin, leadId, companyId) ||
          await countPriorTemplateFollowup(admin, leadId, new Date(nowMs - 7 * 24 * ONE_HOUR_MS).toISOString())) {
        result.skipped++; continue;
      }

      // Reserve the exact customer inbound once, even across overlapping cron invocations.
      const { data: attempt, error: reserveError } = await admin.from("whatsapp_auto_template_attempts")
        .insert({
          company_id: companyId, lead_id: leadId, inbound_message_id: inbound.id,
          status: "reserved", recipient_phone: phone
        })
        .select("attempt_id").single();
      if (reserveError?.code === "23505") { result.skipped++; continue; }
      if (reserveError || !attempt?.attempt_id) throw new Error("template_attempt_reservation_failed");
      result.reserved++;
      const attemptId = String(attempt.attempt_id);

      try {
        // Reconfirm Meta approval immediately before the one irreversible provider send.
        const currentTemplate = await getMetaFollowupTemplate();
        if (!currentTemplate?.approved) {
          await admin.from("whatsapp_auto_template_attempts").update({
            status: "blocked", reason_code: "template_no_longer_approved",
            completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
          }).eq("attempt_id", attemptId);
          result.skipped++; continue;
        }

        const receipt = await beginVerifiedCompletion({
          actionType: "whatsapp_message", entityType: "lead", entityId: leadId, leadId,
          intent: "Send one opted-in, Meta-approved renovation follow-up after the 24-hour reply window.",
          expectedPostcondition: { whatsappStatus: ["sent", "delivered", "read"], providerMessageId: "matching webhook" },
          actorType: "system", actorName: "CC Approved Template Scheduler",
          metadata: { sourceAction: "auto_whatsapp_template_followup", attemptId, templateName: FOLLOWUP_TEMPLATE_NAME }
        });

        const accepted = await sendMetaApprovedFollowup(phone);
        await admin.from("whatsapp_auto_template_attempts").update({
          status: "accepted", provider_message_id: accepted.providerMessageId,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq("attempt_id", attemptId);
        result.providerAccepted++;

        await saveLeadMessage({
          leadId, direction: "outbound", body: currentTemplate.body || FOLLOWUP_TEMPLATE_BODY,
          providerMessageId: accepted.providerMessageId,
          safeToSend: true, whatsappStatus: "accepted",
          metadata: {
            templateSend: true, automaticTemplateFollowup: true,
            templateName: FOLLOWUP_TEMPLATE_NAME,
            templateLanguage: FOLLOWUP_TEMPLATE_LANGUAGE,
            templateCategory: FOLLOWUP_TEMPLATE_CATEGORY,
            autoTemplateAttemptId: attemptId, metaMessageId: accepted.providerMessageId,
            completionReceiptId: receipt.receiptId, completionStatus: "pending"
          }
        });
        await createAuditLog({
          actorType: "system", actorName: "CC Approved Template Scheduler",
          action: "whatsapp_auto_template_provider_accepted", entityType: "lead", entityId: leadId,
          summary: "Meta accepted one consented, approved follow-up template; delivery remains pending webhook.",
          metadata: { attemptId, templateName: FOLLOWUP_TEMPLATE_NAME }
        }).catch(() => null);
      } catch {
        // Never automatically retry after an ambiguous Graph request. An unknown
        // provider result may already have reached the customer.
        await admin.from("whatsapp_auto_template_attempts").update({
          status: "unknown", reason_code: "send_or_persistence_unverified",
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq("attempt_id", attemptId).eq("status", "reserved");
        result.failed++;
      }
    } catch {
      // Missing consent/lead/provider evidence fails closed. Never force sends.
      result.failed++;
    }
  }
  return result;
}
