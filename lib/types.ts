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

export type SalesStage =
  | "New Lead"
  | "Qualified"
  | "Info Requested"
  | "Floor Plan / Scope Received"
  | "Initial Project Review"
  | "Site Visit Needed"
  | "Site Visit Booked"
  | "Quotation Needed"
  | "Quotation Sent"
  | "Follow-Up Due"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "Archived";

export type ManualQuotationStatus =
  | "Not Ready"
  | "Ready to Quote"
  | "Preparing"
  | "Sent"
  | "Client Reviewing"
  | "Revision Requested"
  | "Accepted"
  | "Rejected"
  | "Expired";

export type QuotationPackageStatus =
  | "Draft"
  | "Submitted for Boss Review"
  | "Boss Approved"
  | "Revision Requested"
  | "Rejected / Hold"
  | "Sent to Client"
  | "Client Reviewing"
  | "Accepted"
  | "Client Rejected"
  | "Expired"
  | "Voided";

export type ProjectAccountStatus =
  | "Active"
  | "Deposit Pending"
  | "In Progress"
  | "Payment Due"
  | "Fully Paid"
  | "Completed"
  | "Disputed"
  | "Cancelled";

export type PaymentType = "deposit" | "progress" | "final" | "other";

export type PaymentStatus =
  | "No Payment Yet"
  | "Deposit Requested"
  | "Deposit Received"
  | "Progress Payment Due"
  | "Progress Payment Received"
  | "Final Payment Due"
  | "Fully Paid"
  | "Overdue"
  | "Disputed";

export type LocationConfidence = "exact" | "postal" | "area" | "unknown";

export type LocationSource = "address" | "postal_code" | "message_text" | "manual" | "unknown";

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

export type IntakeChecklistStatus = "collected" | "missing" | "partial";

export interface LeadIntakeChecklistItem {
  key: string;
  label: string;
  status: IntakeChecklistStatus;
  value?: string;
  question: string;
  meetingWeight: number;
  proposalWeight: number;
}

export interface LeadIntakeProfile {
  lifestyleNotes?: string;
  occupants?: string;
  helper?: string;
  pets?: string;
  safetyNeeds?: string;
  budgetExpectation?: string;
  timeline?: string;
  keyCollectionDate?: string;
  moveInDate?: string;
  preferredMeetingTiming?: string;
  propertyType?: string;
  propertyAreaOrAddress?: string;
  scopeOfWork?: string;
  floorPlanStatus?: string;
  sitePhotosStatus?: string;
  meetingReadinessScore?: number;
  proposalReadinessScore?: number;
  missingInfo?: string[];
  suggestedQuestions?: string[];
  checklist?: LeadIntakeChecklistItem[];
  updatedAt?: string;
  updatedBy?: string;
  trace?: Record<string, unknown>;
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
  salesStage?: SalesStage;
  leadOwner?: string;
  salesNextAction?: string;
  followUpDate?: string | null;
  probabilityPercent?: number;
  potentialValue?: number;
  expectedCloseDate?: string | null;
  leadSource?: string;
  wonLostReason?: string;
  stageNotes?: string;
  quotationStatus?: ManualQuotationStatus;
  quotedAmount?: number;
  quoteSentDate?: string | null;
  quoteExpiryDate?: string | null;
  quoteRevisionCount?: number;
  quoteFollowUpDate?: string | null;
  quoteNotes?: string;
  confirmedValue?: number;
  wonDate?: string | null;
  lostDate?: string | null;
  projectId?: string;
  propertyArea?: string;
  postalCode?: string;
  projectAddress?: string;
  planningRegion?: string;
  planningArea?: string;
  mapLat?: number | null;
  mapLng?: number | null;
  locationConfidence?: LocationConfidence;
  locationSource?: LocationSource;
  locationNotes?: string;
  intakeProfile?: LeadIntakeProfile;
}

export interface ProjectAccount {
  id: string;
  leadId: string;
  clientName: string;
  phone: string;
  propertyType: string;
  scopeSummary: string;
  quotedAmount: number;
  confirmedValue: number;
  notes: string;
  status: ProjectAccountStatus;
  sourceLeadId: string;
  propertyArea?: string;
  postalCode?: string;
  projectAddress?: string;
  planningRegion?: string;
  planningArea?: string;
  mapLat?: number | null;
  mapLng?: number | null;
  locationConfidence?: LocationConfidence;
  locationSource?: LocationSource;
  locationNotes?: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  archivedBy?: string;
  archivedReason?: string;
  deletedAt?: string | null;
  deletedBy?: string;
  deleteReason?: string;
  isTest?: boolean;
}

export interface PaymentRecord {
  id: string;
  projectId: string;
  leadId: string;
  paymentType: PaymentType;
  amount: number;
  dueDate: string | null;
  receivedDate: string | null;
  status: PaymentStatus;
  notes: string;
  voidedAt?: string | null;
  voidedBy?: string;
  voidReason?: string;
  isTest?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface QuotationPackage {
  id: string;
  leadId: string;
  clientName: string;
  quotationNumber: string;
  versionNumber: number;
  status: QuotationPackageStatus;
  preparedBy: string;
  preparedAt: string;
  submittedForBossReviewAt: string | null;
  bossReviewedAt: string | null;
  bossReviewedBy: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  revisionRequestedAt: string | null;
  sentAt: string | null;
  sentBy: string;
  acceptedAt: string | null;
  rejectedByClientAt: string | null;
  quotationAmount: number;
  internalCostEstimate?: number | null;
  marginEstimate?: number | null;
  expiryDate: string | null;
  scopeSummary: string;
  bossNotes: string;
  revisionNotes: string;
  clientNotes: string;
  fileId: string;
  storageBucket: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  voidedAt?: string | null;
  voidedBy?: string;
  voidReason?: string;
  qaRunId?: string;
  isTest?: boolean;
}

export interface MonthlySalesTarget {
  id: string;
  targetMonth: string;
  monthlySalesTarget: number;
  monthlyConfirmedJobsTarget: number;
  monthlySiteVisitTarget: number;
  monthlyQuotationTarget: number;
  monthlyLandedLeadTarget: number;
  monthlyCommercialLeadTarget: number;
  monthlyCollectionTarget: number;
  notes: string;
  updatedAt: string;
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

export type LeadFileCategory =
  | "floor_plan"
  | "site_photos"
  | "reference_images"
  | "existing_quotation"
  | "building_rules"
  | "other_documents";

export type LeadFileStatus =
  | "missing"
  | "received"
  | "reviewed"
  | "needs_clarification"
  | "archived"
  | "voided";

export type LeadFileSource = "whatsapp" | "upload_link" | "manual" | "unknown";

export interface LeadFile {
  id: string;
  leadId: string;
  projectId?: string | null;
  fileCategory: LeadFileCategory;
  fileStatus: LeadFileStatus;
  originalFileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  source: LeadFileSource;
  whatsappMessageId?: string | null;
  whatsappMediaId?: string | null;
  uploadedBy?: string | null;
  uploadedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  notes?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadUploadLink {
  id: string;
  leadId: string;
  tokenHash: string;
  expiresAt: string;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  usedAt?: string | null;
  maxUploads: number;
  notes?: string | null;
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
