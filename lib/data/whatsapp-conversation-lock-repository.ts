import "server-only";

import { randomUUID } from "node:crypto";
import { getDataMode } from "@/lib/data/data-source";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import {
  InMemoryConversationReplyLeaseCoordinator,
  WHATSAPP_REPLY_LEASE_SECONDS,
  type ConversationReplyLeaseResult,
  type ConversationReplyReservationResult
} from "@/lib/whatsapp-conversation-concurrency";

const mockCoordinator = new InMemoryConversationReplyLeaseCoordinator();

function getWriteClient() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin credentials are required for WhatsApp conversation locking.");
  return supabase;
}

function firstRpcRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
  return (data ?? {}) as Record<string, unknown>;
}

export function newWhatsAppReplyLeaseOwnerToken() {
  return randomUUID();
}

export async function acquireWhatsAppConversationReplyLease(input: {
  leadId: string;
  ownerToken: string;
  directQuestion: boolean;
}): Promise<ConversationReplyLeaseResult> {
  if (getDataMode() !== "Supabase Mode") return mockCoordinator.acquire(input);
  const { data, error } = await getWriteClient().rpc("acquire_whatsapp_conversation_reply_lease", {
    p_lead_id: input.leadId,
    p_owner_token: input.ownerToken,
    p_direct_question: input.directQuestion,
    p_lease_seconds: WHATSAPP_REPLY_LEASE_SECONDS
  });
  if (error) throw new Error(`WhatsApp conversation lease acquisition failed: ${error.message}`);
  const row = firstRpcRow(data);
  return {
    acquired: row.acquired === true,
    reason: row.reason === "active_processing" || row.reason === "cooldown_active" ? row.reason : "acquired",
    leaseExpiresAt: typeof row.lease_expires_at === "string" ? row.lease_expires_at : null
  };
}

export async function reserveWhatsAppConversationReply(input: {
  leadId: string;
  ownerToken: string;
  inboundProviderMessageId: string;
  replySignature: string;
}): Promise<ConversationReplyReservationResult> {
  if (getDataMode() !== "Supabase Mode") return mockCoordinator.reserve(input);
  const { data, error } = await getWriteClient().rpc("reserve_whatsapp_conversation_reply", {
    p_lead_id: input.leadId,
    p_owner_token: input.ownerToken,
    p_inbound_provider_message_id: input.inboundProviderMessageId,
    p_reply_signature: input.replySignature
  });
  if (error) throw new Error(`WhatsApp reply reservation failed: ${error.message}`);
  const row = firstRpcRow(data);
  return {
    reserved: row.reserved === true,
    reason: row.reason === "lease_not_owned" || row.reason === "duplicate_reply_reservation" ? row.reason : "reserved",
    reservationId: typeof row.reservation_id === "string" ? row.reservation_id : null
  };
}

export async function completeWhatsAppConversationReplyReservation(input: {
  reservationId: string;
  status: "sent" | "failed" | "blocked";
  outboundProviderMessageId?: string;
  failureReason?: string;
}) {
  if (!input.reservationId || getDataMode() !== "Supabase Mode") return;
  const { error } = await getWriteClient()
    .from("whatsapp_reply_reservations")
    .update({
      status: input.status,
      outbound_provider_message_id: input.outboundProviderMessageId || null,
      failure_reason: input.failureReason || "",
      completed_at: new Date().toISOString()
    })
    .eq("id", input.reservationId);
  if (error) throw new Error(`WhatsApp reply reservation completion failed: ${error.message}`);
}

export async function releaseWhatsAppConversationReplyLease(input: {
  leadId: string;
  ownerToken: string;
  cooldownSeconds: number;
}) {
  if (getDataMode() !== "Supabase Mode") return mockCoordinator.release(input);
  const { data, error } = await getWriteClient().rpc("release_whatsapp_conversation_reply_lease", {
    p_lead_id: input.leadId,
    p_owner_token: input.ownerToken,
    p_cooldown_seconds: Math.max(0, input.cooldownSeconds)
  });
  if (error) throw new Error(`WhatsApp conversation lease release failed: ${error.message}`);
  return data === true;
}

export async function getWhatsAppConversationConcurrencyHealth() {
  if (getDataMode() !== "Supabase Mode") {
    return { databaseConnected: false, migration027Ready: false, migration028Ready: false, reason: "mock_mode" };
  }
  const client = getWriteClient();
  const intentSchema = await client
    .from("leads")
    .select("conversation_intent,lead_eligible,conversation_route,intent_confidence,intent_reason_codes,intent_classifier_version,intent_manual_override,intent_classified_at,non_sales_acknowledged_at,latest_unanswered_question,conversation_safety_state")
    .limit(1);
  const lockSchema = await client
    .from("whatsapp_conversation_reply_leases")
    .select("lead_id,lease_expires_at,cooldown_until")
    .limit(1);
  const schemaFunction = await client.rpc("whatsapp_conversation_concurrency_schema_ready");
  const migration027Ready = !intentSchema.error;
  const migration028Ready = !lockSchema.error && !schemaFunction.error && schemaFunction.data === true;
  return {
    databaseConnected: !intentSchema.error || !lockSchema.error || !schemaFunction.error,
    migration027Ready,
    migration028Ready,
    reason: migration027Ready && migration028Ready ? "ready" : "migration_required"
  };
}
