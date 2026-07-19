import { randomUUID } from "node:crypto";
import { getDataMode } from "./data-source";
import { mapLeadMessageRow, mapLeadRow } from "./mappers";
import { nextWhatsAppLeadCompatibilityRow } from "./lead-schema-compatibility";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import type { Lead, LeadMessage, LeadMessageDirection } from "@/lib/types";

function getSupabaseWriteClient() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase server-only admin credentials are required for WhatsApp webhook writes.");
  }
  return supabase;
}

function provisionalWhatsAppLeadRow(input: { phone: string; contactName?: string; latestMessage: string }, now: string) {
  const intentGate = {
    conversationIntent: "unclear_intent",
    primaryIntent: "unclear_intent",
    leadEligible: false,
    salesEligible: false,
    conversationRoute: "intent_review",
    confidence: 0,
    reasonCodes: ["awaiting_pre_sales_intent_classification"],
    classifierVersion: "v10.2.0",
    classifiedAt: null,
    conversationSafetyState: {}
  };
  return {
    client_name: input.contactName || "WhatsApp Contact",
    phone: input.phone,
    source: "WhatsApp",
    division: "LIMM Works",
    property_type: "",
    service_type: "conversation_pending_classification",
    scope_summary: "",
    lead_score: 0,
    lead_category: "Low Fit",
    status: "Not Suitable",
    missing_info: [],
    risk_flags: [],
    boss_approval_needed: false,
    appointment_suitable: false,
    appointment_type: "initial_project_review",
    appointment_readiness: 0,
    quotation_readiness_score: 0,
    next_action: "Classify conversation intent before entering any sales workflow.",
    last_client_message: input.latestMessage,
    lead_level: "Low Fit",
    mission_category: "Conversation: intent review",
    intake_profile: { trace: { intentGate } },
    conversation_intent: "unclear_intent",
    lead_eligible: false,
    conversation_route: "intent_review",
    intent_confidence: 0,
    intent_reason_codes: ["awaiting_pre_sales_intent_classification"],
    intent_classifier_version: "v10.2.0",
    intent_classified_at: null,
    conversation_safety_state: {},
    created_at: now,
    updated_at: now
  };
}

export async function findLeadMessageByProviderId(providerMessageId: string) {
  if (!providerMessageId) return null;
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseWriteClient();
    const { data, error } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (!error && data) return mapLeadMessageRow(data);
  }

  const message = getMockStore().leadMessages.find((item) => item.providerMessageId === providerMessageId) ?? null;
  return message ? mockClone(message) : null;
}

export async function listLeadMessagesForRevenueIntelligence(leadIds: string[]) {
  if (!leadIds.length) return [];
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("lead_messages")
      .select("*")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true })
      .limit(10000);
    if (!error && data) return data.map(mapLeadMessageRow);
  }
  const visible = new Set(leadIds);
  return mockClone(getMockStore().leadMessages)
    .filter((message) => visible.has(message.leadId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function upsertWhatsAppLead(input: { phone: string; contactName?: string; latestMessage: string }) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseWriteClient();
    const existing = await supabase
      .from("leads")
      .select("*")
      .eq("phone", input.phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data && !existing.error) {
      const { data, error } = await supabase
        .from("leads")
        .update({
          client_name: existing.data.client_name || input.contactName || "WhatsApp Lead",
          source: "WhatsApp",
          last_client_message: input.latestMessage,
          updated_at: now
        })
        .eq("id", existing.data.id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`WhatsApp lead update failed: ${error.message}`);
      return mapLeadRow(data);
    }

    let insertRow: Record<string, unknown> = provisionalWhatsAppLeadRow(input, now);
    let data = null;
    let error = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from("leads")
        .insert(insertRow)
        .select("*")
        .maybeSingle();
      data = result.data;
      error = result.error;
      if (!error) break;

      const compatibleRow = nextWhatsAppLeadCompatibilityRow(insertRow, error);
      if (!compatibleRow) break;
      insertRow = compatibleRow;
    }
    if (error) throw new Error(`WhatsApp lead insert failed: ${error.message}`);
    return mapLeadRow(data);
  }

  const store = getMockStore();
  const existingIndex = store.leads.findIndex((lead) => lead.phone === input.phone);
  if (existingIndex >= 0) {
    store.leads[existingIndex] = {
      ...store.leads[existingIndex],
      clientName: store.leads[existingIndex].clientName || input.contactName || "WhatsApp Lead",
      source: "WhatsApp",
      lastClientMessage: input.latestMessage,
      updatedAt: now
    };
    return mockClone(store.leads[existingIndex]);
  }

  const lead: Lead = {
    id: `whatsapp-${input.phone}-${Date.now()}`,
    clientName: input.contactName || "WhatsApp Contact",
    phone: input.phone,
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "conversation_pending_classification",
    scopeSummary: "",
    leadScore: 0,
    leadCategory: "Low Fit",
    status: "Not Suitable",
    missingInfo: [],
    aiRecommendedNextAction: "Classify conversation intent before entering any sales workflow.",
    bossApprovalNeeded: false,
    appointmentSuitable: false,
    appointmentType: "initial_project_review",
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: input.latestMessage,
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: "",
    riskFlags: [],
    leadLevel: "Low Fit",
    missionCategory: "Conversation: intent review",
    conversationIntent: "unclear_intent",
    leadEligible: false,
    conversationRoute: "intent_review",
    intentConfidence: 0,
    intentReasonCodes: ["awaiting_pre_sales_intent_classification"],
    intentClassifierVersion: "v10.2.0",
    intentClassifiedAt: null,
    conversationSafetyState: {},
    intakeProfile: {
      trace: {
        intentGate: {
          conversationIntent: "unclear_intent",
          primaryIntent: "unclear_intent",
          leadEligible: false,
          salesEligible: false,
          conversationRoute: "intent_review",
          confidence: 0,
          reasonCodes: ["awaiting_pre_sales_intent_classification"],
          classifierVersion: "v10.2.0",
          classifiedAt: null,
          conversationSafetyState: {}
        }
      }
    }
  };
  store.leads.unshift(lead);
  return mockClone(lead);
}

export async function saveLeadMessage(input: {
  leadId: string;
  direction: LeadMessageDirection;
  body: string;
  safeToSend?: boolean;
  providerMessageId?: string;
  providerTimestamp?: string | null;
  whatsappStatus?: LeadMessage["whatsappStatus"];
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseWriteClient();
    const { data, error } = await supabase
      .from("lead_messages")
      .insert({
        lead_id: input.leadId,
        direction: input.direction,
        channel: "whatsapp",
        body: input.body,
        safe_to_send: Boolean(input.safeToSend),
        provider_message_id: input.providerMessageId || null,
        provider_timestamp: input.providerTimestamp || null,
        whatsapp_status: input.whatsappStatus || "",
        metadata: input.metadata ?? {},
        created_at: now
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Lead message insert failed: ${error.message}`);
    return mapLeadMessageRow(data);
  }

  const message: LeadMessage = {
    id: randomUUID(),
    leadId: input.leadId,
    direction: input.direction,
    channel: "whatsapp",
    body: input.body,
    safeToSend: Boolean(input.safeToSend),
    providerMessageId: input.providerMessageId,
    providerTimestamp: input.providerTimestamp ?? null,
    whatsappStatus: input.whatsappStatus ?? "",
    metadata: input.metadata ?? {},
    createdAt: now
  };
  getMockStore().leadMessages.unshift(message);
  return mockClone(message);
}

export async function listLeadMessages(leadId: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) return data.map(mapLeadMessageRow);
  }

  return mockClone(getMockStore().leadMessages)
    .filter((message) => message.leadId === leadId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listLatestLeadMessagesForInbox(leadIds: string[], perLead = 3) {
  const uniqueLeadIds = Array.from(new Set(leadIds.filter(Boolean)));
  if (!uniqueLeadIds.length) return new Map<string, LeadMessage[]>();

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_messages")
      .select("*")
      .in("lead_id", uniqueLeadIds)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(Math.max(uniqueLeadIds.length * perLead * 2, uniqueLeadIds.length));
    if (!error && data) {
      const grouped = new Map<string, LeadMessage[]>();
      for (const row of data.map(mapLeadMessageRow)) {
        const current = grouped.get(row.leadId) ?? [];
        if (current.length < perLead) {
          current.push(row);
          grouped.set(row.leadId, current);
        }
      }
      return grouped;
    }
  }

  const grouped = new Map<string, LeadMessage[]>();
  for (const message of mockClone(getMockStore().leadMessages)
    .filter((item) => uniqueLeadIds.includes(item.leadId) && item.channel === "whatsapp")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const current = grouped.get(message.leadId) ?? [];
    if (current.length < perLead) {
      current.push(message);
      grouped.set(message.leadId, current);
    }
  }
  return grouped;
}

export function isMeaningfulWhatsAppMessage(message: LeadMessage) {
  if (message.channel !== "whatsapp") return false;
  if (message.direction !== "inbound" && message.direction !== "outbound") return false;
  const body = message.body.trim();
  if (!body) return false;
  const metadataType = typeof message.metadata?.type === "string" ? message.metadata.type : "";
  const metadataEvent = typeof message.metadata?.event === "string" ? message.metadata.event : "";
  return !/audit|debug|webhook|technical|log|internal/i.test(`${metadataType} ${metadataEvent} ${body}`);
}

export async function listLatestMeaningfulWhatsAppMessagesForLeads(leadIds: string[]) {
  const grouped = await listLatestLeadMessagesForInbox(leadIds, 6);
  const latestByLead = new Map<string, LeadMessage>();
  for (const leadId of leadIds) {
    const latest = (grouped.get(leadId) ?? []).find(isMeaningfulWhatsAppMessage);
    if (latest) latestByLead.set(leadId, latest);
  }
  return latestByLead;
}

export async function listLeadMessagesPage(leadId: string, limit = 30, before?: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    let query = supabase!
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (!error && data) {
      const rows = data.map(mapLeadMessageRow);
      return {
        messages: rows.slice(0, limit).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        hasOlder: rows.length > limit,
        oldestCursor: rows[Math.min(rows.length, limit) - 1]?.createdAt ?? null
      };
    }
  }

  const all = mockClone(getMockStore().leadMessages)
    .filter((message) => message.leadId === leadId && message.channel === "whatsapp" && (!before || message.createdAt < before))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    messages: all.slice(0, limit).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    hasOlder: all.length > limit,
    oldestCursor: all[Math.min(all.length, limit) - 1]?.createdAt ?? null
  };
}

export async function listLeadMessagesAfter(leadId: string, after: string, limit = 30) {
  if (!leadId || !after) return [];

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("channel", "whatsapp")
      .gt("created_at", after)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (!error && data) return data.map(mapLeadMessageRow);
  }

  return mockClone(getMockStore().leadMessages)
    .filter((message) => message.leadId === leadId && message.channel === "whatsapp" && message.createdAt > after)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export async function listRecentLeadMessagesForWebhook(leadId: string, limit = 8) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseWriteClient();
    const { data, error } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Lead message context lookup failed: ${error.message}`);
    return data.map(mapLeadMessageRow);
  }

  return mockClone(getMockStore().leadMessages)
    .filter((message) => message.leadId === leadId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function countRecentWhatsAppAutoReplies(leadId: string, sinceIso: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseWriteClient();
    const { count, error } = await supabase
      .from("lead_messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("direction", "outbound")
      .eq("channel", "whatsapp")
      .gte("created_at", sinceIso);
    if (error) throw new Error(`WhatsApp rate-limit lookup failed: ${error.message}`);
    return count ?? 0;
  }

  return getMockStore().leadMessages.filter(
    (message) =>
      message.leadId === leadId &&
      message.direction === "outbound" &&
      message.channel === "whatsapp" &&
      message.createdAt >= sinceIso
  ).length;
}
