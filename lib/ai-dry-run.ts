import { validateAiDecisionShape } from "./ai-decision-schema";
import { OPENAI_DRY_RUN_DRAFT_NOTICE, getOpenAiBrainRuntime } from "./openai-brain-config";
import { assertSafeClientReply } from "./safety-rules";
import type { AiDecision, AiDryRunRecommendation, AiDryRunValidation, Lead } from "./types";

const unsafeAnyTextPatterns = [
  /\bS\$\s*\d/i,
  /\bSGD\s*\d/i,
  /\$\s*\d/i,
  /\b\d+\s*k\s*-\s*\d+\s*k\b/i,
  /\b\d{5,}\s*-\s*\d{5,}\b/i,
  /\bquote range\b/i,
  /\bprice range\b/i,
  /\brough estimate\b/i,
  /\bestimated amount\b/i,
  /\bpackage price\b/i,
  /\bguaranteed approval\b/i,
  /\bguaranteed completion\b/i,
  /\bconfirmed no permit\b/i,
  /\bconfirmed can hack\b/i
];

const validLeadCategories = new Set(["Hot", "Warm", "Cold", "Low Fit", "Manager Review"]);
const validAppointmentTypes = new Set(["initial_project_review", "site_discussion", "manager_call", "quotation_review"]);
const validDivisions = new Set(["LIMM Works", "Demo Works", "Carpentry Works"]);

function textBlob(value: unknown) {
  return JSON.stringify(value ?? "");
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

function clampScore(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeDecision(raw: Partial<AiDecision>, lead: Lead): AiDecision {
  const missing = normalizeStringArray(raw.missing_info, lead.missingInfo.length ? lead.missingInfo : ["floor_plan", "site_photos", "scope"]);
  const riskFlags = [
    ...new Set([
      ...normalizeStringArray(raw.risk_flags, lead.riskFlags),
      ...(lead.riskFlags ?? []),
      ...(lead.lastClientMessage.match(/how much|price|cost|discount/i) ? ["pricing_request"] : []),
      ...(lead.propertyType.match(/landed|terrace|semi-d|a&a/i) ? ["landed_or_a_and_a_review"] : []),
      ...(lead.propertyType.match(/commercial|clinic|office/i) ? ["commercial_review"] : [])
    ])
  ];

  const leadCategory = validLeadCategories.has(String(raw.lead_category)) ? raw.lead_category! : lead.leadCategory;
  const appointmentType = validAppointmentTypes.has(String(raw.appointment_type)) ? raw.appointment_type! : lead.appointmentType ?? "initial_project_review";
  const division = validDivisions.has(String(raw.division)) ? raw.division! : lead.division;

  return {
    division,
    property_type: String(raw.property_type || lead.propertyType || "Not confirmed"),
    service_type: String(raw.service_type || lead.serviceType || "initial_project_review"),
    scope_summary: String(raw.scope_summary || lead.scopeSummary || "Scope needs review"),
    lead_score: clampScore(raw.lead_score, lead.leadScore),
    lead_category: leadCategory,
    missing_info: missing,
    risk_flags: riskFlags,
    appointment_suitable: Boolean(raw.appointment_suitable ?? lead.appointmentSuitable ?? false),
    appointment_type: appointmentType,
    auto_booking_allowed: false,
    boss_approval_needed: true,
    quotation_readiness_score: clampScore(raw.quotation_readiness_score, lead.quotationReadiness),
    quote_preparation_checklist: Array.isArray(raw.quote_preparation_checklist) && raw.quote_preparation_checklist.length
      ? raw.quote_preparation_checklist.map((item) => ({
          item: String(item.item ?? "Review item"),
          status: item.status === "complete" ? "complete" : "missing"
        }))
      : missing.map((item) => ({ item, status: "missing" })),
    client_reply: String(raw.client_reply || buildSafeClientReply(lead, missing)),
    internal_notes: String(raw.internal_notes || "Draft recommendation prepared for Marcus review. No live action taken.")
  };
}

export function buildSafeClientReply(lead: Lead, missingInfo = lead.missingInfo) {
  const missing = missingInfo.length ? missingInfo : ["floor plan", "site photos", "main scope"];
  const readableMissing = missing
    .map((item) => item.replace(/_/g, " "))
    .slice(0, 3)
    .join(", ");

  if (lead.lastClientMessage.match(/how much|price|cost|discount|quotation|quote/i)) {
    return `Thanks. Before any quotation direction is reviewed, please share the ${readableMissing}. This helps us prepare the enquiry properly for an initial project review.`;
  }

  return `Thanks. Please share the ${readableMissing} so we can prepare this properly for an initial project review.`;
}

export function validateAiDryRunRecommendation(value: Partial<AiDryRunRecommendation>): AiDryRunValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value.mode !== "dry_run") errors.push("AI output must be dry-run only.");
  if (value.draftNotice !== OPENAI_DRY_RUN_DRAFT_NOTICE) errors.push("Draft notice is missing or incorrect.");
  if (!value.decision) errors.push("Decision object is missing.");

  if (value.decision) {
    const shape = validateAiDecisionShape(value.decision);
    if (!shape.ok) errors.push(`Decision schema missing keys: ${shape.missing.join(", ")}`);
    if (value.decision.auto_booking_allowed !== false) errors.push("Auto booking must be false.");
    if (value.decision.boss_approval_needed !== true) errors.push("Boss approval must be required.");
    if (!validDivisions.has(value.decision.division)) errors.push("Division is invalid.");
    if (!validLeadCategories.has(value.decision.lead_category)) errors.push("Lead category is invalid.");
    if (!validAppointmentTypes.has(value.decision.appointment_type)) errors.push("Appointment type is invalid.");
    if (value.decision.lead_score < 0 || value.decision.lead_score > 100) errors.push("Lead score must be 0 to 100.");
    if (value.decision.quotation_readiness_score < 0 || value.decision.quotation_readiness_score > 100) {
      errors.push("Quotation readiness score must be 0 to 100.");
    }

    const replyCheck = assertSafeClientReply(value.decision.client_reply);
    if (!replyCheck.ok) {
      if (replyCheck.hasPrice) errors.push("Client draft contains pricing or amount wording.");
      if (replyCheck.forbidden.length) errors.push(`Client draft contains blocked wording: ${replyCheck.forbidden.join(", ")}`);
    }
  }

  const serialized = textBlob(value);
  for (const pattern of unsafeAnyTextPatterns) {
    if (pattern.test(serialized)) errors.push(`AI output contains unsafe wording: ${pattern}`);
  }

  if (serialized.match(/send\s+whatsapp|calendar\s+book|booked\s+appointment/i)) {
    errors.push("AI output implies live sending or booking.");
  }

  if (value.provider === "safe_fallback") warnings.push("Safe fallback was used instead of OpenAI output.");

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function buildFallbackAiDryRunRecommendation(lead: Lead, reason: string): AiDryRunRecommendation {
  const runtime = getOpenAiBrainRuntime();
  const decision = normalizeDecision(
    {
      division: lead.division,
      property_type: lead.propertyType,
      service_type: lead.serviceType,
      scope_summary: lead.scopeSummary,
      lead_score: lead.leadScore,
      lead_category: lead.leadCategory,
      missing_info: lead.missingInfo,
      risk_flags: lead.riskFlags,
      appointment_suitable: lead.appointmentSuitable ?? false,
      appointment_type: lead.appointmentType ?? "initial_project_review",
      quotation_readiness_score: lead.quotationReadiness,
      client_reply: buildSafeClientReply(lead),
      internal_notes: `Safe fallback used: ${reason}. Draft only; Marcus approval required.`
    },
    lead
  );
  const recommendation: AiDryRunRecommendation = {
    leadId: lead.id,
    mode: "dry_run",
    draftNotice: OPENAI_DRY_RUN_DRAFT_NOTICE,
    provider: "safe_fallback",
    model: runtime.model,
    decision,
    validation: { ok: false, errors: [], warnings: [reason] },
    createdAt: new Date().toISOString()
  };
  recommendation.validation = validateAiDryRunRecommendation(recommendation);
  return recommendation;
}

export function normalizeOpenAiDryRunOutput(raw: unknown, lead: Lead): AiDryRunRecommendation {
  const runtime = getOpenAiBrainRuntime();
  const object = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const decision = normalizeDecision((object.decision ?? object) as Partial<AiDecision>, lead);
  const recommendation: AiDryRunRecommendation = {
    leadId: lead.id,
    mode: "dry_run",
    draftNotice: OPENAI_DRY_RUN_DRAFT_NOTICE,
    provider: "openai",
    model: runtime.model,
    decision,
    validation: { ok: false, errors: [], warnings: [] },
    createdAt: new Date().toISOString()
  };
  recommendation.validation = validateAiDryRunRecommendation(recommendation);
  return recommendation;
}
