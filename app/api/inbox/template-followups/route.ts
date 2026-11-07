import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { getLeadById, markLeadAwaitingClientAfterManualReply } from "@/lib/data/leads-repository";
import { saveLeadMessage } from "@/lib/data/lead-messages-repository";
import { createAuditLog } from "@/lib/data/audit-repository";
import { beginVerifiedCompletion, observeVerifiedCompletion } from "@/lib/data/verified-completion-repository";
import { consumeRateLimit } from "@/lib/operations/rate-limit";
import { isQaE2EMode } from "@/lib/qa-e2e-mode";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-config";
import {
  FOLLOWUP_TEMPLATE_NAME,
  FOLLOWUP_TEMPLATE_CATEGORY,
  FOLLOWUP_TEMPLATE_BODY,
  FOLLOWUP_TEMPLATE_LANGUAGE,
  getMetaFollowupTemplate,
  submitMetaFollowupTemplate,
  sendMetaApprovedFollowup
} from "@/lib/whatsapp-approved-template-followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVIDENCE_SOURCES = new Set(["whatsapp_explicit", "website_form", "signed_document", "other_documented"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPT_OUT_PATTERN = /^\s*(?:stop|unsubscribe|opt\s*out|do\s*not\s*contact(?:\s*me)?|no\s*more\s*messages)\s*[.!]?\s*$/i;

function errorResponse(status: number, errorCode: string, errorMessage: string) {
  return NextResponse.json({ ok: false, errorCode, errorMessage }, { status, headers: { "Cache-Control": "no-store" } });
}

function shortText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getLeadContext(leadId: string) {
  if (!UUID_PATTERN.test(leadId)) return null;
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("supabase_admin_not_configured");
  const { data, error } = await admin.from("leads")
    .select("id,company_id,phone")
    .eq("id", leadId).maybeSingle();
  if (error || !data?.company_id) throw new Error("lead_company_lookup_failed");
  return { lead, companyId: String(data.company_id), admin };
}

async function getConsent(input: NonNullable<Awaited<ReturnType<typeof getLeadContext>>>) {
  const { data, error } = await input.admin.from("whatsapp_followup_consents")
    .select("status,source,evidence,consented_at,updated_at")
    .eq("lead_id", input.lead.id)
    .eq("company_id", input.companyId)
    .eq("category", FOLLOWUP_TEMPLATE_CATEGORY)
    .maybeSingle();
  if (error) throw new Error("consent_registry_unavailable");
  return data;
}

async function hasOptOutSinceConsent(input: NonNullable<Awaited<ReturnType<typeof getLeadContext>>>, consentedAt: string) {
  const { data, error } = await input.admin.from("lead_messages")
    .select("body,created_at")
    .eq("lead_id", input.lead.id)
    .eq("direction", "inbound")
    .eq("channel", "whatsapp")
    .gte("created_at", consentedAt)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("opt_out_check_unavailable");
  return (data ?? []).some((message) => OPT_OUT_PATTERN.test(String(message.body ?? "")));
}

async function hasInternalBlock(input: NonNullable<Awaited<ReturnType<typeof getLeadContext>>>) {
  const digits = normalizeWhatsAppPhone(input.lead.phone);
  const clause = "lead_id.eq." + input.lead.id + ",normalized_phone.eq." + digits;
  const { data, error } = await input.admin.from("whatsapp_blocklist").select("id")
    .eq("company_id", input.companyId)
    .eq("active", true)
    .or(clause).limit(1);
  if (error) throw new Error("blocklist_check_unavailable");
  return Boolean(data?.length);
}

/**
 * Preserve the pre-existing 131047 hard stop. A previous Meta policy rejection
 * must not be bypassed by the new manual/template workflow; only a verified
 * new customer inbound can clear the old protection.
 */
async function hasPriorMetaPolicyBlock(input: NonNullable<Awaited<ReturnType<typeof getLeadContext>>>) {
  const { data, error } = await input.admin.rpc("whatsapp_v16_1_policy_block_state", {
    p_lead_id: input.lead.id,
    p_company_id: input.companyId
  });
  if (error) throw new Error("legacy_whatsapp_policy_gate_unavailable");
  if (!data || typeof data !== "object") throw new Error("legacy_whatsapp_policy_gate_invalid");
  return data.blocked === true || data.blocked === "true";
}

function leadIneligible(lead: NonNullable<Awaited<ReturnType<typeof getLeadContext>>>["lead"]) {
  return Boolean(
    lead.isSpam || lead.isTest || lead.deletedAt || lead.archivedAt ||
    lead.leadEligible === false || (Boolean(lead.conversationRoute) && lead.conversationRoute !== "sales_lead") ||
    ["lost", "won", "not suitable"].includes(String(lead.status ?? "").toLowerCase()) ||
    ["lost", "won"].includes(String(lead.salesStage ?? "").toLowerCase())
  );
}

function safeProviderMessage(error: unknown) {
  const code = error && typeof error === "object" && "metaCode" in error
    ? String((error as { metaCode?: string }).metaCode ?? "")
    : "";
  return code ? "Meta rejected the approved template (code " + code.slice(0, 20) + ")." : "Template was not accepted by Meta. Review template status and number permissions.";
}

async function getPermission() {
  return requirePermission("manage_followups");
}

export async function GET(request: NextRequest) {
  const permission = await getPermission();
  if (!permission.ok) return errorResponse(403, "permission_denied", "Sign in with follow-up access.");
  const leadId = shortText(request.nextUrl.searchParams.get("leadId"), 80);
  if (!UUID_PATTERN.test(leadId)) return errorResponse(400, "invalid_lead", "Choose a conversation first.");
  try {
    const context = await getLeadContext(leadId);
    if (!context) return errorResponse(404, "lead_not_found", "Lead not found.");
    const consent = await getConsent(context);
    let template = null;
    let metaError = "";
    try {
      template = await getMetaFollowupTemplate();
    } catch {
      metaError = "Could not confirm Meta template status. Sending stays disabled.";
    }
    return NextResponse.json({
      ok: true,
      leadId,
      leadName: context.lead.clientName,
      template,
      templateName: FOLLOWUP_TEMPLATE_NAME,
      templateLanguage: FOLLOWUP_TEMPLATE_LANGUAGE,
      suggestedText: FOLLOWUP_TEMPLATE_BODY,
      consent: consent ? {
        status: consent.status, source: consent.source,
        consentedAt: consent.consented_at, updatedAt: consent.updated_at
      } : null,
      eligible: !leadIneligible(context.lead) && !(await hasInternalBlock(context)) && !(await hasPriorMetaPolicyBlock(context)),
      metaError
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(503, "template_status_unavailable", "WhatsApp follow-up setup could not be verified. No message was sent.");
  }
}

export async function POST(request: NextRequest) {
  const permission = await getPermission();
  if (!permission.ok) return errorResponse(403, "permission_denied", "Sign in with follow-up access.");
  const operator = permission.auth.profile;
  if (!operator) return errorResponse(403, "permission_denied", "Operator identity unavailable.");
  const rate = await consumeRateLimit({ identity: operator.id, action: "inbox_template_followup", limit: 8, windowSeconds: 60 });
  if (!rate.allowed) return errorResponse(429, "rate_limited", "Too many follow-up requests.");
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return errorResponse(400, "invalid_json", "Request body is invalid.");
  const action = shortText(payload.action, 40);

  if (action === "submit_template") {
    if (!["boss", "admin"].includes(operator.role)) return errorResponse(403, "permission_denied", "Only a boss or administrator can submit Meta templates.");
    if (isQaE2EMode()) return errorResponse(409, "qa_no_external_sends", "QA mode cannot submit a template.");
    try {
      const result = await submitMetaFollowupTemplate();
      await createAuditLog({
        actorName: operator.fullName, actorEmail: operator.email, actorId: operator.id,
        action: "whatsapp_followup_meta_template_submitted", entityType: "whatsapp_template", entityId: FOLLOWUP_TEMPLATE_NAME,
        summary: "Submitted approved-template request or confirmed existing Meta template. Approval is not assumed.",
        metadata: { templateName: FOLLOWUP_TEMPLATE_NAME, category: FOLLOWUP_TEMPLATE_CATEGORY, resultStatus: result.status }
      });
      return NextResponse.json({ ok: true, result, approved: result.status === "APPROVED" });
    } catch (error) {
      return errorResponse(502, "meta_submission_failed", safeProviderMessage(error));
    }
  }

  const leadId = shortText(payload.leadId, 80);
  if (!UUID_PATTERN.test(leadId)) return errorResponse(400, "invalid_lead", "Choose a valid conversation.");
  let context: Awaited<ReturnType<typeof getLeadContext>>;
  try {
    context = await getLeadContext(leadId);
  } catch {
    return errorResponse(503, "lead_lookup_failed", "Unable to verify the conversation.");
  }
  if (!context) return errorResponse(404, "lead_not_found", "Lead not found.");
  if (leadIneligible(context.lead)) return errorResponse(403, "lead_not_eligible", "This contact is not eligible for follow-ups.");
  try {
    if (await hasInternalBlock(context)) return errorResponse(403, "contact_blocked", "This number is blocked internally.");
    if (await hasPriorMetaPolicyBlock(context)) return errorResponse(403, "whatsapp_policy_blocked", "Previous Meta policy rejection remains blocked until the client messages again.");
  } catch {
    return errorResponse(503, "blocklist_unavailable", "Unable to verify the blocklist; no message was sent.");
  }

  if (action === "record_consent" || action === "revoke_consent") {
    const source = shortText(payload.source, 40);
    const evidence = shortText(payload.evidence, 1000);
    const rawDate = shortText(payload.consentedAt, 60);
    const consentMs = Date.parse(rawDate);
    if (!EVIDENCE_SOURCES.has(source) || evidence.length < 12 || evidence.length > 1000
        || !Number.isFinite(consentMs) || consentMs > Date.now() + 60000
        || consentMs < Date.now() - 2 * 365 * 86400000) {
      return errorResponse(400, "invalid_consent_evidence", "Provide the dated, documented WhatsApp opt-in or opt-out evidence.");
    }
    if (isQaE2EMode()) return NextResponse.json({ ok: true, dryRun: true });
    const status = action === "record_consent" ? "OPTED_IN" : "OPTED_OUT";
    const record = {
      company_id: context.companyId, lead_id: leadId, category: FOLLOWUP_TEMPLATE_CATEGORY,
      status, consented_at: new Date(consentMs).toISOString(), source, evidence,
      recorded_by: operator.id, updated_at: new Date().toISOString()
    };
    const { error } = await context.admin.from("whatsapp_followup_consents").upsert(record, {
      onConflict: "company_id,lead_id,category"
    });
    if (error) return errorResponse(503, "consent_save_failed", "Unable to save consent; sending is disabled.");
    await createAuditLog({
      actorName: operator.fullName, actorEmail: operator.email, actorId: operator.id,
      action: status === "OPTED_IN" ? "whatsapp_marketing_optin_recorded" : "whatsapp_marketing_optout_recorded",
      entityType: "lead", entityId: leadId,
      summary: "Operator recorded documented WhatsApp marketing preference.",
      metadata: { consentSource: source, consentAt: record.consented_at, status }
    }).catch(() => null);
    return NextResponse.json({ ok: true, status });
  }
  if (action !== "send") return errorResponse(400, "unsupported_action", "Unknown follow-up action.");
  if (isQaE2EMode() || permission.auth.mode !== "Supabase Mode") {
    return errorResponse(409, "qa_no_external_sends", "Test mode cannot send WhatsApp templates.");
  }
  const clientRequestId = shortText(payload.clientRequestId, 80);
  if (!UUID_PATTERN.test(clientRequestId)) return errorResponse(400, "invalid_request_id", "A unique send request is required.");

  let consent;
  try {
    consent = await getConsent(context);
    if (consent?.status !== "OPTED_IN" || !consent.consented_at ||
        await hasOptOutSinceConsent(context, String(consent.consented_at))) {
      return errorResponse(403, "marketing_optin_required", "Documented marketing opt-in is required; STOP requests always block follow-ups.");
    }
  } catch {
    return errorResponse(503, "consent_check_failed", "Consent could not be verified; no message was sent.");
  }
  let template;
  try {
    template = await getMetaFollowupTemplate();
  } catch {
    return errorResponse(503, "meta_template_unverified", "Meta's live approval status could not be verified.");
  }
  if (!template?.approved) return errorResponse(409, "template_not_approved", "The LIMM Works follow-up template is not approved by Meta.");

  const bodyHash = createHash("sha256").update(FOLLOWUP_TEMPLATE_BODY).digest("hex");
  const { error: reservationError } = await context.admin.from("whatsapp_desk_send_requests").insert({
    idempotency_key: clientRequestId,
    operator_id: operator.id,
    lead_id: leadId,
    company_id: context.companyId,
    body_sha256: bodyHash,
    status: "pending"
  });
  if (reservationError) {
    if (reservationError.code === "23505") return errorResponse(409, "duplicate_send_request", "This request was already submitted; check the conversation before retrying.");
    return errorResponse(503, "reservation_failed", "Send could not be reserved; no message was sent.");
  }

  const receipt = await beginVerifiedCompletion({
    actionType: "whatsapp_message", entityType: "lead", entityId: leadId, leadId,
    intent: "Send a documented-opt-in, Meta-approved renovation follow-up template.",
    expectedPostcondition: { whatsappStatus: ["sent", "delivered", "read"], providerMessageId: "matching webhook" },
    actorType: operator.role, actorName: operator.fullName,
    metadata: { sourceAction: "inbox_marketing_template_followup", clientRequestId, templateName: FOLLOWUP_TEMPLATE_NAME }
  }).catch(() => null);

  let providerMessageId = "";
  try {
    const sent = await sendMetaApprovedFollowup(context.lead.phone);
    providerMessageId = sent.providerMessageId;
    await context.admin.from("whatsapp_desk_send_requests").update({
      status: "unknown", provider_message_id: providerMessageId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq("idempotency_key", clientRequestId).eq("lead_id", leadId);
  } catch (error) {
    await context.admin.from("whatsapp_desk_send_requests").update({
      status: "failed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq("idempotency_key", clientRequestId).eq("lead_id", leadId);
    if (receipt) await observeVerifiedCompletion(receipt, {
      independentlyObserved: true, postconditionMatched: false, terminalFailure: true,
      failureReason: safeProviderMessage(error), observedEvidence: { providerAccepted: false }
    }).catch(() => null);
    await createAuditLog({
      actorName: operator.fullName, actorEmail: operator.email, actorId: operator.id,
      action: "whatsapp_followup_template_failed", entityType: "lead", entityId: leadId,
      summary: "Meta template send failed; no successful delivery claimed.",
      metadata: { templateName: FOLLOWUP_TEMPLATE_NAME, clientRequestId }
    }).catch(() => null);
    return errorResponse(502, "provider_failed", safeProviderMessage(error));
  }

  try {
    const saved = await saveLeadMessage({
      leadId, direction: "outbound", body: template.body || FOLLOWUP_TEMPLATE_BODY,
      providerMessageId, safeToSend: true, whatsappStatus: "accepted",
      metadata: {
        manualReply: true, manualTakeover: true, templateSend: true,
        templateName: FOLLOWUP_TEMPLATE_NAME, templateLanguage: FOLLOWUP_TEMPLATE_LANGUAGE,
        templateCategory: FOLLOWUP_TEMPLATE_CATEGORY,
        clientTempId: clientRequestId, metaMessageId: providerMessageId,
        completionReceiptId: receipt?.receiptId || "", completionStatus: "pending"
      }
    });
    await context.admin.from("whatsapp_desk_send_requests").update({
      outbound_message_id: saved.id, updated_at: new Date().toISOString()
    }).eq("idempotency_key", clientRequestId).eq("lead_id", leadId);
    await markLeadAwaitingClientAfterManualReply(leadId, operator.fullName).catch(() => null);
    await createAuditLog({
      actorName: operator.fullName, actorEmail: operator.email, actorId: operator.id,
      action: "whatsapp_followup_template_provider_accepted", entityType: "lead", entityId: leadId,
      summary: "Meta accepted a marketing follow-up template; final delivery remains pending webhook.",
      metadata: { templateName: FOLLOWUP_TEMPLATE_NAME, clientRequestId, providerMessageIdPresent: true }
    }).catch(() => null);
    return NextResponse.json({
      ok: true, leadId, messageId: saved.id, providerMessageId, whatsappStatus: "accepted",
      completionStatus: "pending", clientRequestId
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(500, "provider_accepted_persistence_failed", "Meta accepted the template, but CRM persistence failed. Check the WhatsApp thread before any retry.");
  }
}
