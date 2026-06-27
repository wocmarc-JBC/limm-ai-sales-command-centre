import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listPaymentRecords, listProjectAccounts } from "@/lib/data/sales-collection-repository";
import {
  containsProductionVisibilityNoise,
  getProductionLeadVisibilityReasons,
  isProductionHiddenApproval,
  isProductionHiddenPayment,
  isProductionHiddenProject
} from "@/lib/production-visibility";
import { quotationStatusForLead, salesStageForLead } from "@/lib/sales-collection";
import type { ApprovalRequest, Lead, LeadFile, PaymentRecord, ProjectAccount } from "@/lib/types";

export type DataHygieneRecordType = "lead" | "approval" | "project" | "payment" | "client_file";

export type DataHygieneRecord = {
  type: DataHygieneRecordType;
  id: string;
  title: string;
  subtitle: string;
  reasons: string[];
  recordRef: string;
  alreadyHidden: boolean;
  selectable: boolean;
};

export type DataHygienePreview = {
  records: DataHygieneRecord[];
  byType: Record<DataHygieneRecordType, DataHygieneRecord[]>;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function acceptedOrWon(lead?: Lead) {
  if (!lead) return false;
  return salesStageForLead(lead) === "Won" || quotationStatusForLead(lead) === "Accepted";
}

function linkedLead(project: ProjectAccount, leadById: Map<string, Lead>) {
  return leadById.get(project.leadId) ?? leadById.get(project.sourceLeadId);
}

function projectReasons(project: ProjectAccount, leadById: Map<string, Lead>) {
  const reasons: string[] = [];
  const lead = linkedLead(project, leadById);
  if (project.isTest) reasons.push("Project marked isTest");
  if (project.archivedAt) reasons.push("Project archived");
  if (project.deletedAt) reasons.push("Project soft deleted");
  if (!lead) reasons.push("Orphan project: linked lead not found");
  if (lead && !acceptedOrWon(lead)) reasons.push("Project is not linked to a won/accepted lead");
  if (isProductionHiddenProject(project)) reasons.push("Project matches production-hidden test/demo pattern");
  return unique(reasons);
}

function paymentReasons(payment: PaymentRecord, leadById: Map<string, Lead>, projectById: Map<string, ProjectAccount>) {
  const reasons: string[] = [];
  const lead = leadById.get(payment.leadId);
  const project = projectById.get(payment.projectId);
  if (payment.isTest) reasons.push("Payment marked isTest");
  if (payment.voidedAt) reasons.push("Payment voided/soft hidden");
  if (payment.status === "Disputed") reasons.push("Payment disputed and hidden by default");
  if (!project) reasons.push("Orphan payment: project not found");
  if (!lead) reasons.push("Orphan payment: linked lead not found");
  if (lead && !acceptedOrWon(lead)) reasons.push("Payment is not linked to a won/accepted job");
  if (payment.amount <= 0) reasons.push("Payment has no amount due");
  if (isProductionHiddenPayment(payment)) reasons.push("Payment matches production-hidden test/demo pattern");
  return unique(reasons);
}

function approvalReasons(approval: ApprovalRequest, visibleLeadIds: Set<string>) {
  const reasons: string[] = [];
  if (isProductionHiddenApproval(approval, visibleLeadIds)) reasons.push("Approval matches hidden lead or test/demo pattern");
  if (containsProductionVisibilityNoise(
    approval.title,
    approval.reason,
    approval.aiRecommendation,
    approval.proposedReply,
    approval.notes,
    approval.riskFlags
  )) {
    reasons.push("Approval contains test/demo/QA keyword");
  }
  return unique(reasons);
}

function fileReasons(file: LeadFile, leadById: Map<string, Lead>) {
  const reasons: string[] = [];
  const lead = leadById.get(file.leadId);
  if (!lead) reasons.push("Client file is orphaned: lead not found");
  if (lead && getProductionLeadVisibilityReasons(lead).length) reasons.push("Client file belongs to hidden test/demo lead");
  if (file.fileStatus === "voided") reasons.push("Client file already voided");
  if (containsProductionVisibilityNoise(
    file.id,
    file.leadId,
    file.originalFileName,
    file.storageBucket,
    file.storagePath,
    file.mimeType,
    file.notes,
    file.uploadedBy
  )) {
    reasons.push("Client file contains test/demo/QA keyword");
  }
  return unique(reasons);
}

function record(type: DataHygieneRecordType, id: string, title: string, subtitle: string, reasons: string[], alreadyHidden = false): DataHygieneRecord {
  return {
    type,
    id,
    title,
    subtitle,
    reasons,
    recordRef: `${type}:${id}`,
    alreadyHidden,
    selectable: reasons.length > 0
  };
}

export async function buildDataHygienePreview(): Promise<DataHygienePreview> {
  const [leads, approvals, projects, payments, files] = await Promise.all([
    listLeads({ includeInactive: true, includeTest: true }),
    listApprovalRequests({ includeTestDemo: true }),
    listProjectAccounts({ includeTestDemo: true }),
    listPaymentRecords({ includeTestDemo: true }),
    listAllLeadFiles()
  ]);
  const visibleLeadIds = new Set(leads.filter((lead) => !getProductionLeadVisibilityReasons(lead).length).map((lead) => lead.id));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const records: DataHygieneRecord[] = [
    ...leads
      .map((lead) => record(
        "lead",
        lead.id,
        lead.clientName,
        `${lead.phone || "No phone"} / ${lead.scopeSummary || lead.lastClientMessage || "No preview"}`,
        getProductionLeadVisibilityReasons(lead),
        Boolean(lead.archivedAt || lead.deletedAt || lead.isSpam)
      ))
      .filter((item) => item.reasons.length > 0),
    ...approvals
      .map((approval) => record(
        "approval",
        approval.id,
        approval.title,
        `${approval.approvalType} / ${approval.reason}`,
        approvalReasons(approval, visibleLeadIds),
        approval.status !== "pending"
      ))
      .filter((item) => item.reasons.length > 0),
    ...projects
      .map((project) => record(
        "project",
        project.id,
        project.clientName,
        `${project.status} / ${project.scopeSummary || project.propertyType}`,
        projectReasons(project, leadById),
        Boolean(project.archivedAt || project.deletedAt || project.status === "Cancelled")
      ))
      .filter((item) => item.reasons.length > 0),
    ...payments
      .map((payment) => record(
        "payment",
        payment.id,
        `${payment.paymentType} ${payment.amount}`,
        `${payment.status} / project ${payment.projectId}`,
        paymentReasons(payment, leadById, projectById),
        Boolean(payment.voidedAt || payment.status === "Disputed")
      ))
      .filter((item) => item.reasons.length > 0),
    ...files
      .map((file) => record(
        "client_file",
        file.id,
        file.originalFileName || "Client file",
        `${file.fileCategory} / ${file.fileStatus}`,
        fileReasons(file, leadById),
        file.fileStatus === "voided"
      ))
      .filter((item) => item.reasons.length > 0)
  ].sort((a, b) => Number(a.alreadyHidden) - Number(b.alreadyHidden) || a.type.localeCompare(b.type));

  return {
    records,
    byType: {
      lead: records.filter((item) => item.type === "lead"),
      approval: records.filter((item) => item.type === "approval"),
      project: records.filter((item) => item.type === "project"),
      payment: records.filter((item) => item.type === "payment"),
      client_file: records.filter((item) => item.type === "client_file")
    }
  };
}
