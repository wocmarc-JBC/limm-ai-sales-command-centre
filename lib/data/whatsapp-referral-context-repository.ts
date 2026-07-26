import "server-only";

import { createAuditLog } from "@/lib/data/audit-repository";
import { getDataMode } from "@/lib/data/data-source";
import { getLeadById } from "@/lib/data/leads-repository";
import { mapLeadRow } from "@/lib/data/mappers";
import { getMockStore, mockClone } from "@/lib/data/mock-store";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import {
  referralContextForStorage,
  type WhatsAppReferralContext
} from "@/lib/whatsapp-referral-context";
import type { Lead, LeadIntakeProfile } from "@/lib/types";

function sameContext(existing: Record<string, unknown> | undefined, next: Record<string, unknown>) {
  if (!existing || existing.confirmed !== true) return false;
  return String(existing.ctwaClid ?? "") === String(next.ctwaClid ?? "") &&
    String(existing.sourceId ?? "") === String(next.sourceId ?? "") &&
    String(existing.serviceKey ?? "") === String(next.serviceKey ?? "");
}

function mergedProfile(lead: Lead, context: Record<string, unknown>): LeadIntakeProfile {
  return {
    ...(lead.intakeProfile ?? {}),
    trace: {
      ...(lead.intakeProfile?.trace ?? {}),
      whatsappReferralContext: context
    }
  };
}

async function audit(input: {
  leadId: string;
  providerMessageId: string;
  context: WhatsAppReferralContext;
}) {
  await createAuditLog({
    actorType: "system",
    actorName: "WhatsApp Referral Context",
    action: "whatsapp_meta_referral_context_captured",
    entityType: "lead",
    entityId: input.leadId,
    summary: "Confirmed Meta Click-to-WhatsApp referral context stored for reply planning.",
    beforeData: null,
    afterData: {
      referralConfirmed: true,
      serviceKey: input.context.serviceKey,
      serviceLabel: input.context.serviceLabel
    },
    metadata: {
      providerMessageId: input.providerMessageId,
      referralVersion: input.context.version,
      sourceType: input.context.sourceType,
      sourceIdPresent: Boolean(input.context.sourceId),
      sourceUrlPresent: Boolean(input.context.sourceUrl),
      ctwaClidPresent: Boolean(input.context.ctwaClid),
      rawIdentifiersClientFacing: false,
      originalClientTextPreserved: true,
      noWhatsAppSend: true,
      noPriceGuideAutomation: true,
      noCalendarBooking: true
    }
  });
}

export async function persistWhatsAppReferralContext(input: {
  leadId: string;
  providerMessageId: string;
  context: WhatsAppReferralContext;
}) {
  const lead = await getLeadById(input.leadId);
  if (!lead) throw new Error("Referral context persistence could not find the lead.");
  const stored = referralContextForStorage(input.context);
  if (!stored) return lead;
  const currentTrace = (lead.intakeProfile?.trace ?? {}) as Record<string, unknown>;
  const existing = currentTrace.whatsappReferralContext as Record<string, unknown> | undefined;
  if (sameContext(existing, stored)) return lead;
  const intakeProfile = mergedProfile(lead, stored);
  let updated: Lead | null = null;

  if (getDataMode() === "Supabase Mode") {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin credentials are required for referral persistence.");
    const { data, error } = await client
      .from("leads")
      .update({ intake_profile: intakeProfile, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Referral context persistence failed: ${error.message}`);
    if (data) updated = mapLeadRow(data);
  } else {
    const store = getMockStore();
    const index = store.leads.findIndex((item) => item.id === lead.id);
    if (index >= 0) {
      store.leads[index] = {
        ...store.leads[index],
        intakeProfile,
        updatedAt: new Date().toISOString()
      };
      updated = mockClone(store.leads[index]);
    }
  }

  if (!updated) throw new Error("Referral context persistence did not update the lead.");
  await audit(input);
  return updated;
}
