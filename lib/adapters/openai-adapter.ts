import { safeMockAiDecision } from "../ai-decision-schema";
import { buildFallbackAiDryRunRecommendation, normalizeOpenAiDryRunOutput } from "../ai-dry-run";
import { getOpenAiBrainRuntime, OPENAI_DRY_RUN_DRAFT_NOTICE } from "../openai-brain-config";
import type { AiDecision, AiDryRunRecommendation, Lead } from "../types";

export interface AiDraftInput {
  leadId: string;
  latestClientMessage: string;
  conversationSummary: string;
}

export interface AiDraftAdapter {
  draftDecision(input: AiDraftInput): Promise<AiDecision>;
}

export class MockOpenAiAdapter implements AiDraftAdapter {
  async draftDecision(_input: AiDraftInput): Promise<AiDecision> {
    return safeMockAiDecision;
  }
}

export class DisabledOpenAiAdapter implements AiDraftAdapter {
  async draftDecision(_input: AiDraftInput): Promise<AiDecision> {
    throw new Error("OpenAI live adapter is disabled in v3.0 scaffold.");
  }
}

export interface OpenAiDryRunInput {
  lead: Lead;
}

export interface OpenAiDryRunAdapter {
  draftRecommendation(input: OpenAiDryRunInput): Promise<AiDryRunRecommendation>;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildDryRunPrompt(lead: Lead) {
  return [
    "You are preparing a dry-run-only internal recommendation for LIMM Works.",
    "Return strict JSON only. Do not include markdown.",
    "Do not send messages, book appointments, approve anything, or generate pricing.",
    `Every output must be marked exactly: ${OPENAI_DRY_RUN_DRAFT_NOTICE}`,
    "Use initial project review wording for any review step.",
    "Respect appointment settings and never override Sunday rules.",
    "Boss approval is always required for this dry run.",
    "Use this JSON shape:",
    JSON.stringify({
      draft_notice: OPENAI_DRY_RUN_DRAFT_NOTICE,
      decision: {
        division: "LIMM Works",
        property_type: "",
        service_type: "",
        scope_summary: "",
        lead_score: 0,
        lead_category: "Cold",
        missing_info: [],
        risk_flags: [],
        appointment_suitable: false,
        appointment_type: "initial_project_review",
        auto_booking_allowed: false,
        boss_approval_needed: true,
        quotation_readiness_score: 0,
        quote_preparation_checklist: [{ item: "floor_plan", status: "missing" }],
        client_reply: "",
        internal_notes: ""
      }
    }),
    "Lead context:",
    JSON.stringify({
      id: lead.id,
      clientName: lead.clientName,
      source: lead.source,
      division: lead.division,
      propertyType: lead.propertyType,
      serviceType: lead.serviceType,
      scopeSummary: lead.scopeSummary,
      leadScore: lead.leadScore,
      leadCategory: lead.leadCategory,
      status: lead.status,
      missingInfo: lead.missingInfo,
      riskFlags: lead.riskFlags,
      appointmentSuitable: lead.appointmentSuitable,
      appointmentType: lead.appointmentType,
      quotationReadiness: lead.quotationReadiness,
      lastClientMessage: lead.lastClientMessage,
      preferredContactTime: lead.preferredContactTime
    })
  ].join("\n");
}

export class OpenAiBrainDryRunAdapter implements OpenAiDryRunAdapter {
  async draftRecommendation(input: OpenAiDryRunInput): Promise<AiDryRunRecommendation> {
    const runtime = getOpenAiBrainRuntime();
    if (!runtime.dryRunEnabled) {
      return buildFallbackAiDryRunRecommendation(input.lead, "OpenAI brain is disabled by default.");
    }
    if (!runtime.canCallOpenAi) {
      return buildFallbackAiDryRunRecommendation(input.lead, "OpenAI dry-run is enabled but no API key is configured.");
    }

    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: runtime.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return safe dry-run JSON only. No live actions. No prices. Boss approval required."
          },
          {
            role: "user",
            content: buildDryRunPrompt(input.lead)
          }
        ]
      });
      const content = completion.choices[0]?.message?.content ?? "";
      const parsed = safeJsonParse(content);
      if (!parsed) {
        return buildFallbackAiDryRunRecommendation(input.lead, "OpenAI returned invalid JSON.");
      }
      const recommendation = normalizeOpenAiDryRunOutput(parsed, input.lead);
      if (!recommendation.validation.ok) {
        return buildFallbackAiDryRunRecommendation(
          input.lead,
          `OpenAI output failed validation: ${recommendation.validation.errors.join("; ")}`
        );
      }
      return recommendation;
    } catch (error) {
      return buildFallbackAiDryRunRecommendation(
        input.lead,
        error instanceof Error ? `OpenAI dry-run failed: ${error.message}` : "OpenAI dry-run failed."
      );
    }
  }
}

export const openAiBrainDryRunAdapter = new OpenAiBrainDryRunAdapter();
