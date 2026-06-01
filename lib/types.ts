export type Division = "LIMM Works" | "Demo Works" | "Carpentry Works";

export type LeadCategory = "Hot" | "Warm" | "Cold" | "Low Fit" | "Manager Review";

export type LeadStatus =
  | "New Enquiry"
  | "Awaiting Client"
  | "Waiting Boss Approval"
  | "Ready To Book"
  | "Appointment Pending"
  | "Quotation Readiness"
  | "Follow Up Due"
  | "Not Suitable";

export type AppointmentRule = "allowed" | "approval_required" | "blocked";

export type AppointmentType =
  | "initial_project_review"
  | "site_discussion"
  | "manager_call"
  | "quotation_review"
  | "site_visit"
  | "phone_review"
  | "zoom_review"
  | "landed_aa_review"
  | "condo_renovation_review"
  | "commercial_renovation_review";

export interface AppointmentDaySetting {
  enabled: boolean;
  approvalRequired: boolean;
  slots: Array<{ start: string; end: string }>;
}

export interface AppointmentTypeSetting {
  enabled: boolean;
  durationMinutes: number;
  approvalRequired: boolean;
}

export interface AppointmentSettings {
  timezone: string;
  minimumNoticeHours: number;
  maxAppointmentsPerDay: number;
  bufferBetweenAppointmentsMinutes: number;
  sameDayBookingRule: AppointmentRule;
  publicHolidayRule: AppointmentRule;
  bossApprovalRules: string[];
  days: Record<string, AppointmentDaySetting>;
  appointmentTypes: Record<AppointmentType, AppointmentTypeSetting>;
  publicHolidays: string[];
}

export interface AppointmentSlot {
  date: string;
  day: string;
  start: string;
  end: string;
  appointmentType: AppointmentType;
  approvalRequired: boolean;
  approvalReason: string;
}

export interface AiDecision {
  division: Division;
  property_type: string;
  service_type: string;
  scope_summary: string;
  lead_score: number;
  lead_category: LeadCategory;
  missing_info: string[];
  risk_flags: string[];
  appointment_suitable: boolean;
  appointment_type: AppointmentType;
  auto_booking_allowed: boolean;
  boss_approval_needed: boolean;
  quotation_readiness_score: number;
  quote_preparation_checklist: Array<{ item: string; status: "complete" | "missing" }>;
  client_reply: string;
  internal_notes: string;
}

export type AiDryRunProvider = "openai" | "safe_fallback";

export interface AiDryRunValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export type AiDraftReviewStatus =
  | "pending"
  | "saved"
  | "marked_useful"
  | "marked_not_useful"
  | "needs_edit"
  | "rejected_unsafe"
  | "copied";

export interface AiDryRunRecommendation {
  id?: string;
  leadId: string;
  mode: "dry_run";
  draftNotice: string;
  provider: AiDryRunProvider;
  model: string;
  decision: AiDecision;
  validation: AiDryRunValidation;
  reviewStatus?: AiDraftReviewStatus;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  clientName: string;
  phone: string;
  email?: string;
  source: string;
  division: Division;
  propertyType: string;
  serviceType: string;
  scopeSummary: string;
  leadScore: number;
  leadCategory: LeadCategory;
  status: LeadStatus;
  missingInfo: string[];
  aiRecommendedNextAction: string;
  bossApprovalNeeded: boolean;
  appointmentSuitable?: boolean;
  appointmentType?: AppointmentType;
  appointmentReadiness: number;
  quotationReadiness: number;
  lastClientMessage: string;
  lastReplyAt: string | null;
  createdAt: string;
  updatedAt?: string;
  preferredContactTime: string;
  riskFlags: string[];
  deletedAt?: string | null;
  deletedBy?: string;
  deleteReason?: string;
  archivedAt?: string | null;
  archivedBy?: string;
  archivedReason?: string;
  isTest?: boolean;
  isSpam?: boolean;
  duplicateOf?: string;
  restoredAt?: string | null;
  restoredBy?: string;
  botPaused?: boolean;
  botPausedAt?: string | null;
  botPausedBy?: string;
  botPauseReason?: string;
  assignedTo?: string;
  needsMarcus?: boolean;
  followedUpAt?: string | null;
  followedUpBy?: string;
  leadLevel?: "Gold Lead" | "Warm Lead" | "Cold Lead" | "Risk Lead" | "Spam/Test" | "Needs Marcus";
  conversationSummary?: string;
  missionCategory?: string;
}

export type LeadMessageDirection = "inbound" | "outbound" | "internal";

export interface LeadMessage {
  id: string;
  leadId: string;
  direction: LeadMessageDirection;
  channel: "whatsapp" | "internal" | "web";
  body: string;
  safeToSend: boolean;
  providerMessageId?: string;
  providerTimestamp?: string | null;
  whatsappStatus?: "received" | "sent" | "blocked" | "failed" | "disabled" | "";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "more_info";

export interface ApprovalRequest {
  id: string;
  leadId: string;
  title: string;
  approvalType: string;
  reason: string;
  aiRecommendation: string;
  proposedReply: string;
  riskFlags: string[];
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string;
  notes: string;
  createdAt: string;
}

export type FollowUpStatus = "Due" | "Overdue" | "Scheduled" | "Completed" | "Snoozed" | "No Reply";

export interface FollowUp {
  id: string;
  leadId: string;
  clientName: string;
  dueAt: string;
  followupType: string;
  templateType: string;
  status: FollowUpStatus;
  suggestedMessage: string;
  completedAt: string | null;
  notes: string;
  lead?: Lead | null;
}

export interface AuditLog {
  id: string;
  actor?: string;
  actorType: string;
  actorName: string;
  actorEmail?: string;
  actorId?: string | null;
  action: string;
  entity?: string;
  entityType: string;
  entityId: string;
  summary: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface QuotationReadinessRecord {
  id: string;
  leadId: string;
  readinessScore: number;
  missingInfo: string[];
  quotePreparationChecklist: Array<{ item: string; status: "complete" | "missing" }>;
  bossReviewRequired: boolean;
  status: "collecting_info" | "ready_for_boss_review" | "boss_reviewed" | "more_info_needed";
  nextAction: string;
  updatedAt: string;
}

export interface QuotationReadinessRow {
  lead: Lead;
  readiness: QuotationReadinessRecord;
}

export interface SystemHealth {
  mode: "Mock Mode" | "Supabase Mode";
  supabaseUrlDetected: boolean;
  supabaseAnonKeyDetected: boolean;
  authEnabled: boolean;
  rlsExpected: boolean;
  rlsNotes: string;
  openAiStatus: "disabled" | "dry_run_key_missing" | "dry_run_ready";
  whatsappStatus: "disabled" | "closed_test_ready" | "live_auto_reply_ready" | "closed_test_credentials_missing" | "inbound_only";
  calendarStatus: "disabled" | "connection_missing" | "boss_approval_required" | "auto_booking_requested";
}

export type LeadLifecycleAction =
  | "archive"
  | "soft_delete"
  | "restore"
  | "mark_test"
  | "mark_spam"
  | "mark_duplicate"
  | "hard_delete"
  | "take_over"
  | "pause_bot"
  | "resume_bot"
  | "mark_needs_marcus"
  | "mark_followed_up";
