import "server-only";

import { getDataMode } from "./data-source";
import { getMockStore } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";

export type WhatsAppLeadControlState = {
  id: string;
  botPaused: boolean;
  botPausedAt: string | null;
  botPausedBy: string;
  botPauseReason: string;
  needsMarcus: boolean;
};

function mapControlState(row: Record<string, unknown>): WhatsAppLeadControlState {
  return {
    id: String(row.id ?? ""),
    botPaused: Boolean(row.bot_paused),
    botPausedAt: row.bot_paused_at ? String(row.bot_paused_at) : null,
    botPausedBy: String(row.bot_paused_by ?? ""),
    botPauseReason: String(row.bot_pause_reason ?? ""),
    needsMarcus: Boolean(row.needs_marcus)
  };
}

/**
 * Trusted webhook-only read for the final bot/takeover safety decision.
 * Browser and operator reads must continue through the user-scoped RLS client.
 */
export async function getWhatsAppLeadControlState(leadId: string): Promise<WhatsAppLeadControlState | null> {
  if (getDataMode() === "Mock Mode") {
    const lead = getMockStore().leads.find((item) => item.id === leadId);
    return lead ? {
      id: lead.id,
      botPaused: Boolean(lead.botPaused),
      botPausedAt: lead.botPausedAt ?? null,
      botPausedBy: lead.botPausedBy ?? "",
      botPauseReason: lead.botPauseReason ?? "",
      needsMarcus: Boolean(lead.needsMarcus)
    } : null;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Trusted WhatsApp lead control client is unavailable.");
  const { data, error } = await admin
    .from("leads")
    .select("id,bot_paused,bot_paused_at,bot_paused_by,bot_pause_reason,needs_marcus")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`Trusted WhatsApp lead control read failed: ${error.code || "unknown"}.`);
  return data ? mapControlState(data) : null;
}
