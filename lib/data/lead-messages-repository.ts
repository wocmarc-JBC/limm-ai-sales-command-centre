import { randomUUID } from "node:crypto";
import { getDataMode } from "./data-source";
import { mapLeadMessageRow, mapLeadRow } from "./mappers";
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

    const { data, error } = await supabase
      .from("leads")
      .insert({
        client_name: input.contactName || "WhatsApp Lead",
        phone: input.phone,
        source: "WhatsApp",
        division: "LIMM Works",
        property_type: "",
        service_type: "initial_project_review",
        scope_summary: "WhatsApp renovation enquiry pending review",
        lead_score: 25,
        lead_category: "Cold",
        status: "New Enquiry",
        missing_info: ["property_type", "scope", "floor_plan", "site_photos"],
        risk_flags: [],
        boss_approval_needed: false,
        appointment_suitable: false,
        appointment_type: "initial_project_review",
        appointment_readiness: 10,
        quotation_readiness_score: 0,
        next_action: "Ask for scope, floor plan, and site photos before project review.",
        last_client_message: input.latestMessage,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .maybeSingle();
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
    clientName: input.contactName || "WhatsApp Lead",
    phone: input.phone,
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "initial_project_review",
    scopeSummary: "WhatsApp renovation enquiry pending review",
    leadScore: 25,
    leadCategory: "Cold",
    status: "New Enquiry",
    missingInfo: ["property_type", "scope", "floor_plan", "site_photos"],
    aiRecommendedNextAction: "Ask for scope, floor plan, and site photos before project review.",
    bossApprovalNeeded: false,
    appointmentSuitable: false,
    appointmentType: "initial_project_review",
    appointmentReadiness: 10,
    quotationReadiness: 0,
    lastClientMessage: input.latestMessage,
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: "",
    riskFlags: []
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
    const supabase = getSupabaseServerClient();
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
    const supabase = getSupabaseServerClient();
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

export async function listLeadMessagesPage(leadId: string, limit = 30, before?: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
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
    const supabase = getSupabaseServerClient();
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
