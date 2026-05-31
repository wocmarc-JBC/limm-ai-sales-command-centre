import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapLeadRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import type { Lead, LeadStatus } from "@/lib/types";

export async function listLeads() {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) return data.map(mapLeadRow);
  }

  return mockClone(getMockStore().leads).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

export async function getLeadById(id: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("leads").select("*").eq("id", id).maybeSingle();
    if (!error && data) return mapLeadRow(data);
  }

  const lead = getMockStore().leads.find((item) => item.id === id) ?? null;
  return lead ? mockClone(lead) : null;
}

async function updateLead(id: string, patch: Partial<Lead>, action: string, summary: string) {
  const before = await getLeadById(id);
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("leads")
      .update({
        status: patch.status,
        boss_approval_needed: patch.bossApprovalNeeded,
        quotation_readiness_score: patch.quotationReadiness,
        next_action: patch.aiRecommendedNextAction,
        updated_at: now
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const after = mapLeadRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action,
        entityType: "lead",
        entityId: id,
        summary,
        beforeData: before ? { status: before.status, bossApprovalNeeded: before.bossApprovalNeeded } : null,
        afterData: { status: after.status, bossApprovalNeeded: after.bossApprovalNeeded }
      });
      return after;
    }
  }

  const store = getMockStore();
  const index = store.leads.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.leads[index] = { ...store.leads[index], ...patch, updatedAt: now };
  const after = store.leads[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action,
    entityType: "lead",
    entityId: id,
    summary,
    beforeData: before ? { status: before.status, bossApprovalNeeded: before.bossApprovalNeeded } : null,
    afterData: { status: after.status, bossApprovalNeeded: after.bossApprovalNeeded }
  });
  return mockClone(after);
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  return updateLead(id, { status }, "lead_status_updated", `Lead status updated to ${status}.`);
}

export async function markBossApprovalNeeded(id: string) {
  return updateLead(
    id,
    { bossApprovalNeeded: true, status: "Waiting Boss Approval" },
    "lead_boss_approval_marked",
    "Lead marked as needing Marcus approval."
  );
}

export async function markLeadNotSuitable(id: string) {
  return updateLead(id, { status: "Not Suitable" }, "lead_marked_not_suitable", "Lead marked not suitable.");
}

export async function moveLeadToQuotationReadiness(id: string) {
  return updateLead(
    id,
    { status: "Quotation Readiness", aiRecommendedNextAction: "Prepare quotation readiness pack for Marcus review." },
    "lead_moved_to_quotation_readiness",
    "Lead moved to quotation readiness without generating prices."
  );
}

export async function requestAppointmentReview(id: string) {
  return updateLead(
    id,
    {
      status: "Appointment Pending",
      bossApprovalNeeded: true,
      aiRecommendedNextAction: "Review appointment readiness before offering or confirming any slot."
    },
    "appointment_review_requested",
    "Lead marked ready for appointment review. Booking confirmation still requires Marcus approval and an actual event."
  );
}

export async function approveAppointmentBooking(id: string) {
  return updateLead(
    id,
    {
      status: "Ready To Book",
      bossApprovalNeeded: false,
      aiRecommendedNextAction: "Create a Calendar event only after availability and required details are confirmed."
    },
    "appointment_booking_approved",
    "Marcus approved this lead for booking workflow. No Calendar event was created by this action."
  );
}

export async function requestAppointmentMissingInfo(id: string) {
  return updateLead(
    id,
    {
      status: "Awaiting Client",
      bossApprovalNeeded: false,
      aiRecommendedNextAction: "Ask the client for missing appointment details before booking review."
    },
    "appointment_missing_info_requested",
    "Appointment workflow needs more information before booking can proceed."
  );
}

export async function recordCalendarEventCreateRequested(id: string) {
  const lead = await updateLead(
    id,
    {
      status: "Ready To Book",
      aiRecommendedNextAction: "Calendar event creation requested, but live Calendar booking is disabled."
    },
    "calendar_event_create_requested",
    "Calendar event creation was requested from the CRM."
  );
  await createAuditLog({
    actorType: "system",
    actorName: "Calendar Adapter",
    action: "calendar_event_create_failed",
    entityType: "lead",
    entityId: id,
    summary: "Calendar event was not created because the live Calendar adapter is disabled.",
    beforeData: null,
    afterData: { calendarEventId: "", status: "disabled" },
    metadata: {
      calendarBookingEnabled: false,
      autoBookingEnabled: false,
      bossApprovalRequired: true,
      noFakeBooking: true
    }
  });
  return lead;
}
