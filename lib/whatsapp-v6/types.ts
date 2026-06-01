import type { Lead, LeadMessage } from "@/lib/types";

export const V6_SALES_BRAIN_VERSION = "v6_1_1_dashboard_declutter_live_cleanup";
export const V6_SALES_BRAIN_LABEL = "v6.ultimate";

export type V6ClientMessageType = "text" | "image" | "document" | "audio" | "voice" | "unsupported";

export interface V6SalesBrainInput {
  inboundMessageText: string;
  inboundMessageType: string;
  lead: Lead;
  previousMessages: LeadMessage[];
  autoReplyEnabled: boolean;
  calendarEventId?: string | null;
  providerMessageId?: string;
}

export interface V6Understanding {
  detectedIntents: string[];
  detectedScopes: string[];
  detectedRisks: string[];
  clientQuestion: string;
  clientTone: string;
  singlishDetected: boolean;
  chineseDetected: boolean;
  renovationShortformDetected: string[];
}

export interface V6VerifiedContext {
  hasFloorPlan: boolean;
  hasSitePhotos: boolean;
  hasScopeOfWork: boolean;
  hasPropertyType: boolean;
  hasAddressOrArea: boolean;
  hasPreferredAppointmentTime: boolean;
  hasDesignReferences: boolean;
  hasImageOrFile: boolean;
  confirmedFacts: string[];
  inferredButNotConfirmed: string[];
  missingFields: string[];
}

export interface V6ContextTruthGate {
  overClaimPrevented: boolean;
  disallowedReceivedClaims: string[];
  allowedReceivedClaims: string[];
}

export interface V6ReplyPlan {
  answerFirst: string;
  safetyNotes: string[];
  askOnlyMissingInfo: string[];
  handoffNeeded: boolean;
  handoffReason: string[];
}

export interface V6SafetyResult {
  priceSafe: boolean;
  appointmentSafe: boolean;
  approvalSafe: boolean;
  hackingSafe: boolean;
  portfolioSafe: boolean;
  bannedPhrasesRemoved: string[];
  ok: boolean;
}

export interface V6QualityResult {
  answeredActualQuestion: boolean;
  soundsHuman: boolean;
  notOverLong: boolean;
  notGenericFormReply: boolean;
  notOverClaimingContext: boolean;
  ok: boolean;
  rewriteReason: string[];
}

export interface V6HandoffResult {
  emailTriggered: boolean;
  emailSent: boolean;
  emailSkippedReason: string;
}

export interface V6SalesBrainDecision {
  version: typeof V6_SALES_BRAIN_VERSION;
  shouldReply: boolean;
  replyText: string;
  replyLanguage: "english";
  clientMessageType: V6ClientMessageType;
  understanding: V6Understanding;
  verifiedContext: V6VerifiedContext;
  contextTruthGate: V6ContextTruthGate;
  replyPlan: V6ReplyPlan;
  safety: V6SafetyResult;
  quality: V6QualityResult;
  handoff: V6HandoffResult;
  traceId: string;
}
