import { defaultAppointmentSettings } from "@/lib/appointment-engine";
import { buildQuotationReadiness } from "@/lib/quotation-readiness";
import { approvalRequests, auditLogs, followUps, mockLeads } from "@/lib/mock-data";
import type {
  ApprovalRequest,
  AppointmentSettings,
  AuditLog,
  FollowUp,
  AiDryRunRecommendation,
  LeadMessage,
  Lead,
  MonthlySalesTarget,
  PaymentRecord,
  ProjectAccount,
  QuotationReadinessRecord
} from "@/lib/types";

type MockStore = {
  leads: Lead[];
  approvalRequests: ApprovalRequest[];
  followUps: FollowUp[];
  auditLogs: AuditLog[];
  aiRecommendations: AiDryRunRecommendation[];
  leadMessages: LeadMessage[];
  projectAccounts: ProjectAccount[];
  paymentRecords: PaymentRecord[];
  monthlyTargets: MonthlySalesTarget[];
  quotationReadiness: QuotationReadinessRecord[];
  appointmentSettings: AppointmentSettings;
  settings: Record<string, unknown>;
};

declare global {
  var __limmV3MockStore: MockStore | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createStore(): MockStore {
  return {
    leads: clone(mockLeads),
    approvalRequests: clone(approvalRequests),
    followUps: clone(followUps),
    auditLogs: clone(auditLogs),
    aiRecommendations: [],
    leadMessages: [],
    projectAccounts: [],
    paymentRecords: [],
    monthlyTargets: [],
    quotationReadiness: mockLeads.map((lead) => {
      const readiness = buildQuotationReadiness(lead);
      return {
        id: readiness.id,
        leadId: readiness.leadId,
        readinessScore: readiness.readinessScore,
        missingInfo: readiness.missingInfo,
        quotePreparationChecklist: readiness.quotePreparationChecklist,
        bossReviewRequired: readiness.bossReviewRequired,
        status: readiness.status,
        nextAction: readiness.nextAction,
        updatedAt: readiness.updatedAt
      };
    }),
    appointmentSettings: clone(defaultAppointmentSettings),
    settings: {
      liveAutoSend: false,
      whatsappMode: "reply_only_safe_mode",
      openAi: "disabled",
      calendar: "disabled"
    }
  };
}

export function getMockStore() {
  if (!globalThis.__limmV3MockStore) {
    globalThis.__limmV3MockStore = createStore();
  }
  return globalThis.__limmV3MockStore;
}

export function resetMockStoreForTests() {
  globalThis.__limmV3MockStore = createStore();
  return globalThis.__limmV3MockStore;
}

export function mockClone<T>(value: T): T {
  return clone(value);
}
