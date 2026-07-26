import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/data/audit-repository";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { getDataMode } from "@/lib/data/data-source";
import { getMockStore } from "@/lib/data/mock-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_NAME_PATTERN = /(test|qa_|browser_test|live_test|production_test|demo lead|sample)/i;
const TEST_PHONE_PATTERN = /(test_only|00000000)/i;

function isLikelyQaLead(lead: { client_name?: string | null; phone?: string | null; intake_profile?: unknown }) {
  const profile = lead.intake_profile && typeof lead.intake_profile === "object" ? lead.intake_profile as Record<string, unknown> : {};
  const trace = profile.trace && typeof profile.trace === "object" ? profile.trace as Record<string, unknown> : {};
  const sourceType = String(trace.sourceType ?? trace.testSource ?? "");
  return TEST_NAME_PATTERN.test(String(lead.client_name ?? ""))
    || TEST_PHONE_PATTERN.test(String(lead.phone ?? ""))
    || /qa|replay|synthetic|canary|browser/i.test(sourceType);
}

function csvCell(value: unknown) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = [
    "lead_id", "client_name", "phone", "conversation_intent", "conversation_route", "lead_eligible",
    "bot_paused", "needs_marcus", "message_id", "created_at", "direction", "channel", "body",
    "whatsapp_status", "manual_reply", "message_type", "primary_intent", "reply_engine", "template_id",
    "final_send_result", "provider_message_id", "metadata"
  ];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

async function productionRows(includeQa: boolean) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin credentials are required for conversation export.");
  const { data: leads, error: leadError } = await admin
    .from("leads")
    .select("id,client_name,phone,conversation_intent,conversation_route,lead_eligible,bot_paused,needs_marcus,intake_profile")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (leadError) throw new Error(`Conversation export lead lookup failed: ${leadError.message}`);
  const visibleLeads = (leads ?? []).filter((lead) => includeQa || !isLikelyQaLead(lead));
  const leadIds = visibleLeads.map((lead) => String(lead.id));
  if (!leadIds.length) return [];
  const { data: messages, error: messageError } = await admin
    .from("lead_messages")
    .select("id,lead_id,created_at,direction,channel,body,whatsapp_status,provider_message_id,metadata")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: true })
    .limit(50000);
  if (messageError) throw new Error(`Conversation export message lookup failed: ${messageError.message}`);
  const leadMap = new Map(visibleLeads.map((lead) => [String(lead.id), lead]));
  return (messages ?? []).map((message) => {
    const lead = leadMap.get(String(message.lead_id));
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata as Record<string, unknown> : {};
    return {
      lead_id: message.lead_id,
      client_name: lead?.client_name ?? "",
      phone: lead?.phone ?? "",
      conversation_intent: lead?.conversation_intent ?? "",
      conversation_route: lead?.conversation_route ?? "",
      lead_eligible: lead?.lead_eligible ?? false,
      bot_paused: lead?.bot_paused ?? false,
      needs_marcus: lead?.needs_marcus ?? false,
      message_id: message.id,
      created_at: message.created_at,
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      whatsapp_status: message.whatsapp_status,
      manual_reply: metadata.manualReply === true,
      message_type: metadata.messageType ?? "",
      primary_intent: metadata.primaryIntent ?? "",
      reply_engine: metadata.replyEngine ?? "",
      template_id: metadata.templateId ?? "",
      final_send_result: metadata.final_send_result ?? "",
      provider_message_id: message.provider_message_id ?? "",
      metadata
    };
  });
}

function mockRows(includeQa: boolean) {
  const store = getMockStore();
  const leads = store.leads.filter((lead) => includeQa || !TEST_NAME_PATTERN.test(lead.clientName));
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  return store.leadMessages.filter((message) => leadMap.has(message.leadId)).map((message) => {
    const lead = leadMap.get(message.leadId)!;
    return {
      lead_id: lead.id, client_name: lead.clientName, phone: lead.phone,
      conversation_intent: lead.conversationIntent ?? "", conversation_route: lead.conversationRoute ?? "",
      lead_eligible: lead.leadEligible !== false, bot_paused: Boolean(lead.botPaused), needs_marcus: Boolean(lead.needsMarcus),
      message_id: message.id, created_at: message.createdAt, direction: message.direction, channel: message.channel,
      body: message.body, whatsapp_status: message.whatsappStatus ?? "", manual_reply: message.metadata?.manualReply === true,
      message_type: message.metadata?.messageType ?? "", primary_intent: message.metadata?.primaryIntent ?? "",
      reply_engine: message.metadata?.replyEngine ?? "", template_id: message.metadata?.templateId ?? "",
      final_send_result: message.metadata?.final_send_result ?? "", provider_message_id: message.providerMessageId ?? "",
      metadata: message.metadata ?? {}
    };
  });
}

export async function GET(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth.profile.role !== "boss") return NextResponse.json({ ok: false, error: "boss_access_required" }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const includeQa = url.searchParams.get("includeQa") === "true";
  const rows = getDataMode() === "Supabase Mode" ? await productionRows(includeQa) : mockRows(includeQa);

  await createAuditLog({
    actorType: auth.profile.role,
    actorName: auth.profile.fullName,
    actorEmail: auth.profile.email,
    actorId: auth.profile.id,
    action: "conversation_export_downloaded",
    entityType: "conversation_export",
    entityId: `conversation-export-${Date.now()}`,
    summary: `Boss exported ${rows.length} WhatsApp message records.`,
    metadata: { format, includeQa, rowCount: rows.length }
  });

  const date = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), includeQa, rowCount: rows.length, rows }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="limm-conversations-${date}.json"`, "Cache-Control": "no-store" }
    });
  }
  return new NextResponse(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="limm-conversations-${date}.csv"`, "Cache-Control": "no-store" }
  });
}
