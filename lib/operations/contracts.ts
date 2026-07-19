import type { UserRole } from "@/lib/auth/roles";

export const WORLD_CLASS_RELEASE = "11.3.0";

export const AI_QUALITY_VERSIONS = {
  model: "configured-provider",
  prompt: "limm-whatsapp-playbook-v5",
  planner: "limm-single-reply-planner-v11.1",
  shadow: "limm-quality-shadow-v1"
} as const;

export const OPERATIONS_SLOS = {
  inboxAvailabilityPercent: 99.9,
  inboxRefreshP95Ms: 2500,
  manualSendP95Ms: 8000,
  realtimeRecoverySeconds: 30,
  traceFailureRatePercent: 1,
  durableInboundRpoSeconds: 0,
  durableWorkerRecoverySeconds: 120,
  clientFilesRpoHours: 24,
  clientFilesRtoHours: 4
} as const;

export type InboxOperator = {
  id: string;
  fullName: string;
  role: UserRole;
};

export type InboxAssignment = {
  leadId: string;
  assignedProfileId: string | null;
  assignedName: string;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string;
  version: number;
};

export type InboxInternalNote = {
  id: string;
  leadId: string;
  body: string;
  mentions: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  editedAt: string | null;
};

export type InboxPresenceMember = {
  profileId: string;
  fullName: string;
  role: UserRole;
  activeLeadId: string;
  onlineAt: string;
};

export type AiQualityDecision = "observed" | "accepted" | "edited" | "rejected" | "unsafe";

export type OperationsSloSnapshot = {
  schemaReady: boolean;
  sampleSize: number;
  successRatePercent: number;
  failureRatePercent: number;
  p95DurationMs: number;
  lastCanaryAt: string | null;
  lastCanaryStatus: string;
};
