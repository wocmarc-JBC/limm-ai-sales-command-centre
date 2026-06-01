import type {
  ApprovalRequest,
  AppointmentSettings,
  AuditLog,
  FollowUp,
  Lead,
  LeadMessage,
  QuotationReadinessRecord
} from "@/lib/types";

export function mapLeadRow(row: any): Lead {
  return {
    id: row.id,
    clientName: row.client_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    source: row.source ?? "",
    division: row.division ?? "LIMM Works",
    propertyType: row.property_type ?? "",
    serviceType: row.service_type ?? "",
    scopeSummary: row.scope_summary ?? "",
    leadScore: row.lead_score ?? 0,
    leadCategory: row.lead_category ?? "Cold",
    status: row.status ?? "New Enquiry",
    missingInfo: row.missing_info ?? [],
    aiRecommendedNextAction: row.next_action ?? row.ai_recommended_next_action ?? "",
    bossApprovalNeeded: row.boss_approval_needed ?? false,
    appointmentSuitable: row.appointment_suitable ?? false,
    appointmentType: row.appointment_type ?? "initial_project_review",
    appointmentReadiness: row.appointment_readiness ?? 0,
    quotationReadiness: row.quotation_readiness_score ?? row.quotation_readiness ?? 0,
    lastClientMessage: row.last_client_message ?? "",
    lastReplyAt: row.last_reply_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preferredContactTime: row.preferred_contact_time ?? "",
    riskFlags: row.risk_flags ?? [],
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? "",
    deleteReason: row.delete_reason ?? "",
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? "",
    archivedReason: row.archived_reason ?? "",
    isTest: row.is_test ?? false,
    isSpam: row.is_spam ?? false,
    duplicateOf: row.duplicate_of ?? "",
    restoredAt: row.restored_at ?? null,
    restoredBy: row.restored_by ?? "",
    botPaused: row.bot_paused ?? false,
    botPausedAt: row.bot_paused_at ?? null,
    botPausedBy: row.bot_paused_by ?? "",
    botPauseReason: row.bot_pause_reason ?? "",
    assignedTo: row.assigned_to ?? "",
    needsMarcus: row.needs_marcus ?? false,
    followedUpAt: row.followed_up_at ?? null,
    followedUpBy: row.followed_up_by ?? "",
    leadLevel: row.lead_level ?? undefined,
    conversationSummary: row.conversation_summary ?? "",
    missionCategory: row.mission_category ?? ""
  };
}

export function mapApprovalRow(row: any): ApprovalRequest {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title ?? row.approval_type ?? row.request_type ?? "Approval request",
    approvalType: row.approval_type ?? row.request_type ?? "general",
    reason: row.reason ?? "",
    aiRecommendation: row.ai_recommendation ?? row.proposed_payload?.aiRecommendation ?? "",
    proposedReply: row.proposed_reply ?? row.proposed_payload?.proposedReply ?? "",
    riskFlags: row.risk_flags ?? row.proposed_payload?.riskFlags ?? [],
    status: row.status ?? "pending",
    requestedAt: row.requested_at ?? row.created_at,
    decidedAt: row.decided_at ?? null,
    decidedBy: row.decided_by ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? row.requested_at
  };
}

export function mapFollowUpRow(row: any): FollowUp {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientName: row.client_name ?? row.leads?.client_name ?? "Unknown",
    dueAt: row.due_at,
    followupType: row.followup_type ?? row.template_type ?? "",
    templateType: row.template_type ?? row.followup_type ?? "",
    status: row.status ?? "Scheduled",
    suggestedMessage: row.suggested_message ?? "",
    completedAt: row.completed_at ?? null,
    notes: row.notes ?? "",
    lead: row.leads ? mapLeadRow(row.leads) : null
  };
}

export function mapQuotationRow(row: any): QuotationReadinessRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    readinessScore: row.readiness_score ?? 0,
    missingInfo: row.missing_info ?? row.missing_information ?? [],
    quotePreparationChecklist: row.quote_preparation_checklist ?? [],
    bossReviewRequired: row.boss_review_required ?? false,
    status: row.status ?? "collecting_info",
    nextAction: row.next_action ?? "",
    updatedAt: row.updated_at ?? row.created_at
  };
}

export function mapAuditRow(row: any): AuditLog {
  return {
    id: row.id,
    actor: row.actor_name ?? row.actor ?? "",
    actorType: row.actor_type ?? "system",
    actorName: row.actor_name ?? row.actor ?? "System",
    actorEmail: row.actor_email ?? "",
    actorId: row.actor_id ?? null,
    action: row.action,
    entity: row.entity_id ?? row.entity ?? "",
    entityType: row.entity_type ?? "unknown",
    entityId: row.entity_id ?? "",
    summary: row.summary ?? "",
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    metadata: row.metadata ?? row.payload ?? {},
    createdAt: row.created_at
  };
}

export function mapLeadMessageRow(row: any): LeadMessage {
  return {
    id: row.id,
    leadId: row.lead_id,
    direction: row.direction ?? "inbound",
    channel: row.channel ?? "whatsapp",
    body: row.body ?? "",
    safeToSend: row.safe_to_send ?? false,
    providerMessageId: row.provider_message_id ?? "",
    providerTimestamp: row.provider_timestamp ?? null,
    whatsappStatus: row.whatsapp_status ?? "",
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

export function mapAppointmentSettingsRow(row: any): AppointmentSettings {
  return {
    timezone: row.timezone ?? "Asia/Singapore",
    minimumNoticeHours: row.minimum_notice_hours ?? 24,
    maxAppointmentsPerDay: row.max_per_day ?? row.max_appointments_per_day ?? 3,
    bufferBetweenAppointmentsMinutes: row.buffer_minutes ?? row.buffer_between_appointments_minutes ?? 30,
    sameDayBookingRule: row.same_day_rule ?? row.same_day_booking_rule ?? "approval_required",
    publicHolidayRule: row.public_holiday_rule ?? "approval_required",
    bossApprovalRules: row.boss_approval_rules ?? [],
    days: row.allowed_days ?? row.day_settings ?? {},
    appointmentTypes: row.appointment_type_settings ?? {},
    publicHolidays: row.public_holidays ?? []
  };
}
