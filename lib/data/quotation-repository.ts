import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapQuotationPackageRow, mapQuotationRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { CLIENT_FILES_BUCKET } from "@/lib/data/lead-files-repository";
import {
  filterQuotationPackagesForProductionVisibility,
  isProductionHiddenLead,
  type ProductionVisibilityOptions
} from "@/lib/production-visibility";
import { isQaE2EMode, qaE2eSafetyMetadata, QA_E2E_RUN_ID } from "@/lib/qa-e2e-mode";
import type {
  Lead,
  QuotationPackage,
  QuotationPackageStatus,
  QuotationReadinessRecord,
  QuotationReadinessRow
} from "@/lib/types";

const QUOTATION_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

const MAX_QUOTATION_FILE_BYTES = 25 * 1024 * 1024;

function safeFileName(value = "quotation") {
  const cleaned = value
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return cleaned || "quotation";
}

function adminClient() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin credentials are required for private quotation storage.");
  return supabase;
}

function nowIso() {
  return new Date().toISOString();
}

function quotePackageToRow(quotation: QuotationPackage) {
  return {
    id: quotation.id,
    lead_id: quotation.leadId,
    client_name: quotation.clientName,
    quotation_number: quotation.quotationNumber,
    version_number: quotation.versionNumber,
    status: quotation.status,
    prepared_by: quotation.preparedBy,
    prepared_at: quotation.preparedAt,
    submitted_for_boss_review_at: quotation.submittedForBossReviewAt,
    boss_reviewed_at: quotation.bossReviewedAt,
    boss_reviewed_by: quotation.bossReviewedBy,
    approved_at: quotation.approvedAt,
    rejected_at: quotation.rejectedAt,
    revision_requested_at: quotation.revisionRequestedAt,
    sent_at: quotation.sentAt,
    sent_by: quotation.sentBy,
    accepted_at: quotation.acceptedAt,
    rejected_by_client_at: quotation.rejectedByClientAt,
    quotation_amount: quotation.quotationAmount,
    internal_cost_estimate: quotation.internalCostEstimate,
    margin_estimate: quotation.marginEstimate,
    expiry_date: quotation.expiryDate,
    scope_summary: quotation.scopeSummary,
    boss_notes: quotation.bossNotes,
    revision_notes: quotation.revisionNotes,
    client_notes: quotation.clientNotes,
    file_id: quotation.fileId,
    storage_bucket: quotation.storageBucket,
    storage_path: quotation.storagePath,
    original_file_name: quotation.originalFileName,
    mime_type: quotation.mimeType,
    file_size_bytes: quotation.fileSizeBytes,
    voided_at: quotation.voidedAt ?? null,
    voided_by: quotation.voidedBy ?? "",
    void_reason: quotation.voidReason ?? "",
    qa_run_id: quotation.qaRunId ?? "",
    is_test: quotation.isTest ?? false,
    created_at: quotation.createdAt,
    updated_at: quotation.updatedAt
  };
}

function auditPayload<T extends object>(value: T) {
  return value as unknown as Record<string, unknown>;
}

function activeQuotation(quotation: QuotationPackage) {
  return quotation.status !== "Voided" && !quotation.voidedAt && quotation.status !== "Expired";
}

function sortedByLatestVersion(quotations: QuotationPackage[]) {
  return [...quotations].sort((a, b) => {
    if (a.leadId === b.leadId && a.versionNumber !== b.versionNumber) return b.versionNumber - a.versionNumber;
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
  });
}

function validateQuotationFileUpload(input: { fileName: string; mimeType: string; sizeBytes: number }) {
  const errors: string[] = [];
  if (!QUOTATION_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    errors.push("Only PDF, Excel, Word, JPG, PNG, or WEBP quotation files are allowed.");
  }
  if (input.sizeBytes > MAX_QUOTATION_FILE_BYTES) errors.push("Quotation file is too large. Maximum size is 25MB.");
  if (input.sizeBytes <= 0) errors.push("Quotation file is empty.");
  return { ok: errors.length === 0, errors };
}

async function auditQuotationAction(input: {
  action: string;
  quotation: QuotationPackage;
  before?: QuotationPackage | null;
  actorName?: string;
  actorRole?: string;
  note?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await createAuditLog({
    actorType: input.actorRole ?? "boss",
    actorName: input.actorName ?? "Marcus",
    action: input.action,
    entityType: "quotation_package",
    entityId: input.quotation.id,
    summary: input.summary,
    beforeData: input.before ? {
      status: input.before.status,
      versionNumber: input.before.versionNumber,
      quotationAmount: input.before.quotationAmount
    } : null,
    afterData: {
      status: input.quotation.status,
      versionNumber: input.quotation.versionNumber,
      quotationAmount: input.quotation.quotationAmount
    },
    metadata: {
      quotationId: input.quotation.id,
      quotationVersion: input.quotation.versionNumber,
      leadId: input.quotation.leadId,
      note: input.note ?? "",
      ...qaE2eSafetyMetadata(),
      ...(input.metadata ?? {})
    }
  });
}

export async function listQuotationReadinessRows(): Promise<QuotationReadinessRow[]> {
  const store = getMockStore();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_readiness")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) {
      const records = data.map(mapQuotationRow);
      const { listLeads } = await import("./leads-repository");
      const leads = await listLeads();
      return records
        .map((readiness) => ({ readiness, lead: leads.find((lead) => lead.id === readiness.leadId) }))
        .filter((row): row is QuotationReadinessRow => Boolean(row.lead));
    }
  }

  return mockClone(
    store.quotationReadiness
      .map((readiness) => ({ readiness, lead: store.leads.find((lead) => lead.id === readiness.leadId) }))
      .filter((row): row is QuotationReadinessRow => Boolean(row.lead))
  );
}

export async function getQuotationReadinessForLead(leadId: string) {
  const rows = await listQuotationReadinessRows();
  return rows.find((row) => row.lead.id === leadId)?.readiness ?? null;
}

export async function updateQuotationReadinessStatus(
  id: string,
  status: QuotationReadinessRecord["status"],
  checklist?: QuotationReadinessRecord["quotePreparationChecklist"]
) {
  const rows = await listQuotationReadinessRows();
  const before = rows.find((row) => row.readiness.id === id)?.readiness ?? null;
  const now = nowIso();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_readiness")
      .update({ status, quote_preparation_checklist: checklist, updated_at: now })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const after = mapQuotationRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "quotation_readiness_updated",
        entityType: "quotation_readiness",
        entityId: id,
        summary: "Quotation readiness updated without generating prices.",
        beforeData: before ? { status: before.status } : null,
        afterData: { status: after.status }
      });
      return after;
    }
  }

  const store = getMockStore();
  const index = store.quotationReadiness.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.quotationReadiness[index] = {
    ...store.quotationReadiness[index],
    status,
    quotePreparationChecklist: checklist ?? store.quotationReadiness[index].quotePreparationChecklist,
    updatedAt: now
  };
  const after = store.quotationReadiness[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "quotation_readiness_updated",
    entityType: "quotation_readiness",
    entityId: id,
    summary: "Quotation readiness updated without generating prices.",
    beforeData: before ? { status: before.status } : null,
    afterData: { status: after.status }
  });
  return mockClone(after);
}

export type ListQuotationPackagesOptions = ProductionVisibilityOptions & {
  visibleLeadIds?: Set<string>;
};

export async function listQuotationPackages(options: ListQuotationPackagesOptions = {}) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_packages")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) return filterQuotationPackagesForProductionVisibility(data.map(mapQuotationPackageRow), options);
    return [];
  }

  return filterQuotationPackagesForProductionVisibility(
    sortedByLatestVersion(mockClone(getMockStore().quotationPackages)),
    options
  );
}

export async function getQuotationPackageById(id: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("quotation_packages").select("*").eq("id", id).maybeSingle();
    if (!error && data) return mapQuotationPackageRow(data);
    return null;
  }

  const quotation = getMockStore().quotationPackages.find((item) => item.id === id) ?? null;
  return quotation ? mockClone(quotation) : null;
}

export async function listQuotationPackagesForLead(leadId: string, options: ProductionVisibilityOptions = {}) {
  return (await listQuotationPackages(options)).filter((quotation) => quotation.leadId === leadId);
}

export async function getLatestActiveQuotationForLead(leadId: string, options: ProductionVisibilityOptions = {}) {
  return sortedByLatestVersion(await listQuotationPackagesForLead(leadId, options)).find(activeQuotation) ?? null;
}

export function buildQuotationSendGate(quotation: QuotationPackage | null, lead: Lead | null | undefined) {
  const missing: string[] = [];
  if (!lead) missing.push("lead is missing");
  if (lead && !isQaE2EMode() && isProductionHiddenLead(lead)) missing.push("lead is test/demo/spam/archived/deleted");
  if (!quotation) missing.push("latest active quotation package is missing");
  if (quotation && quotation.status !== "Boss Approved") missing.push("latest active quotation version is not Boss Approved");
  if (quotation && (!quotation.fileId || !quotation.storagePath || !quotation.originalFileName)) missing.push("valid uploaded quotation file is missing");
  return {
    canMarkSent: missing.length === 0,
    missing
  };
}

async function saveQuotationPackage(quotation: QuotationPackage, before: QuotationPackage | null, audit: {
  action: string;
  summary: string;
  actorName: string;
  actorRole?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}) {
  const after = { ...quotation, updatedAt: nowIso() };

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_packages")
      .upsert(quotePackageToRow(after), { onConflict: "id" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Quotation package save failed: ${error.message}`);
    const saved = mapQuotationPackageRow(data);
    await auditQuotationAction({ ...audit, quotation: saved, before });
    return saved;
  }

  const store = getMockStore();
  const index = store.quotationPackages.findIndex((item) => item.id === quotation.id);
  if (index >= 0) store.quotationPackages[index] = after;
  else store.quotationPackages.unshift(after);
  await auditQuotationAction({ ...audit, quotation: after, before });
  return mockClone(after);
}

export async function createQuotationPackage(input: {
  lead: Lead;
  quotationNumber: string;
  quotationAmount: number;
  scopeSummary: string;
  preparedBy: string;
  expiryDate?: string | null;
  bossNotes?: string;
  internalCostEstimate?: number | null;
  marginEstimate?: number | null;
  actorName?: string;
}) {
  const existing = await listQuotationPackagesForLead(input.lead.id, { includeTestDemo: true });
  const versionNumber = Math.max(0, ...existing.map((quotation) => quotation.versionNumber)) + 1;
  const now = nowIso();
  const quotation: QuotationPackage = {
    id: `quote-${input.lead.id}-v${versionNumber}-${randomUUID()}`,
    leadId: input.lead.id,
    clientName: input.lead.clientName,
    quotationNumber: input.quotationNumber || `LIMM-Q-${now.slice(0, 10).replace(/-/g, "")}-${versionNumber}`,
    versionNumber,
    status: "Draft",
    preparedBy: input.preparedBy || input.actorName || "Marcus",
    preparedAt: now,
    submittedForBossReviewAt: null,
    bossReviewedAt: null,
    bossReviewedBy: "",
    approvedAt: null,
    rejectedAt: null,
    revisionRequestedAt: null,
    sentAt: null,
    sentBy: "",
    acceptedAt: null,
    rejectedByClientAt: null,
    quotationAmount: input.quotationAmount,
    internalCostEstimate: input.internalCostEstimate ?? null,
    marginEstimate: input.marginEstimate ?? null,
    expiryDate: input.expiryDate || null,
    scopeSummary: input.scopeSummary || input.lead.scopeSummary,
    bossNotes: input.bossNotes ?? "",
    revisionNotes: "",
    clientNotes: "",
    fileId: "",
    storageBucket: CLIENT_FILES_BUCKET,
    storagePath: "",
    originalFileName: "",
    mimeType: "",
    fileSizeBytes: 0,
    createdAt: now,
    updatedAt: now,
    qaRunId: input.lead.isTest ? QA_E2E_RUN_ID : "",
    isTest: input.lead.isTest
  };
  return saveQuotationPackage(quotation, null, {
    action: "quotation_package_created",
    summary: "Quotation package created manually. No price was generated by the system.",
    actorName: input.actorName ?? "Marcus",
    actorRole: "sales",
    metadata: { manualQuotationPackage: true }
  });
}

export async function uploadDraftQuotation(input: {
  lead: Lead;
  quotationNumber: string;
  quotationAmount: number;
  scopeSummary: string;
  preparedBy: string;
  expiryDate?: string | null;
  bossNotes?: string;
  internalCostEstimate?: number | null;
  marginEstimate?: number | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
  actorName?: string;
}) {
  const validation = validateQuotationFileUpload({ fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const quotation = await createQuotationPackage(input);
  const storagePath = `quotations/${input.lead.id}/v${quotation.versionNumber}/${Date.now()}-${randomUUID()}-${safeFileName(input.fileName)}`;
  const fileId = randomUUID();
  const before = quotation;
  let after: QuotationPackage = {
    ...quotation,
    fileId,
    storageBucket: CLIENT_FILES_BUCKET,
    storagePath,
    originalFileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.sizeBytes
  };

  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { error } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
    if (error) throw new Error(`Private quotation upload failed: ${error.message}`);
  }

  after = await saveQuotationPackage(after, before, {
    action: "quotation_draft_uploaded",
    summary: "Draft quotation file uploaded to private storage.",
    actorName: input.actorName ?? "Marcus",
    actorRole: "sales",
    metadata: { privateBucket: true, signedUrlsOnly: true, originalFileName: input.fileName }
  });
  return after;
}

export async function submitQuotationForBossReview(id: string, actorName = "Marcus", note = "") {
  const before = await getQuotationPackageById(id);
  if (!before) return null;
  const after: QuotationPackage = {
    ...before,
    status: "Submitted for Boss Review",
    submittedForBossReviewAt: nowIso(),
    bossNotes: note || before.bossNotes
  };
  return saveQuotationPackage(after, before, {
    action: "quotation_submitted_for_boss_review",
    summary: "Quotation package submitted for boss review.",
    actorName,
    actorRole: "sales",
    note
  });
}

export async function recordQuotationBossDecision(input: {
  quotationId: string;
  actionKey: string;
  actorName: string;
  actorRole: string;
  note: string;
}) {
  const before = await getQuotationPackageById(input.quotationId);
  if (!before) return null;
  const now = nowIso();
  let status: QuotationPackageStatus = before.status;
  let action = "quotation_boss_note_recorded";
  let summary = "Boss note recorded against quotation package.";
  const patch: Partial<QuotationPackage> = {
    bossReviewedAt: now,
    bossReviewedBy: input.actorName
  };

  if (input.actionKey === "approve_quote") {
    status = "Boss Approved";
    patch.approvedAt = now;
    action = "quotation_boss_approved";
    summary = "Boss approved this exact quotation version for manual sending.";
  } else if (input.actionKey === "request_revision" || input.actionKey === "ask_for_more_info" || input.actionKey === "need_site_visit_first") {
    status = "Revision Requested";
    patch.revisionRequestedAt = now;
    patch.revisionNotes = input.note;
    action = input.actionKey === "need_site_visit_first" ? "quotation_site_visit_required" : "quotation_revision_requested";
    summary = input.actionKey === "need_site_visit_first"
      ? "Boss requires site visit before this quotation can proceed."
      : "Boss requested quotation revision or more information.";
  } else if (input.actionKey === "reject_quote" || input.actionKey === "reject_hold") {
    status = "Rejected / Hold";
    patch.rejectedAt = now;
    patch.revisionNotes = input.note;
    action = "quotation_rejected_hold";
    summary = "Boss rejected or held this quotation version.";
  }

  const after = await saveQuotationPackage(
    { ...before, ...patch, status },
    before,
    {
      action,
      summary,
      actorName: input.actorName,
      actorRole: input.actorRole,
      note: input.note,
      metadata: { bossAction: input.actionKey }
    }
  );

  if (input.actionKey === "approve_quote") {
    await createAuditLog({
      actorType: input.actorRole,
      actorName: input.actorName,
      action: "boss_quote_approved",
      entityType: "lead",
      entityId: before.leadId,
      summary: "Boss approved a specific quotation package version. Manual send is still required.",
      beforeData: { quotationId: before.id, quotationVersion: before.versionNumber, status: before.status },
      afterData: { quotationId: after.id, quotationVersion: after.versionNumber, status: after.status },
      metadata: {
        quotationId: after.id,
        quotationVersion: after.versionNumber,
        quotationAmount: after.quotationAmount,
        ...qaE2eSafetyMetadata()
      }
    });
  }

  return after;
}

export async function markQuotationSent(quotationId: string, lead: Lead, actorName = "Marcus") {
  const before = await getQuotationPackageById(quotationId);
  const gate = buildQuotationSendGate(before, lead);
  if (!before || !gate.canMarkSent) {
    await createAuditLog({
      actorType: "boss",
      actorName,
      action: "quotation_send_blocked",
      entityType: "quotation_package",
      entityId: quotationId || "missing",
      summary: "Quotation Sent was blocked by the package send gate.",
      beforeData: before ? { status: before.status, versionNumber: before.versionNumber } : null,
      afterData: null,
      metadata: { leadId: lead.id, missing: gate.missing, ...qaE2eSafetyMetadata() }
    });
    return { ok: false, error: gate.missing.join("; "), quotation: before };
  }

  const after: QuotationPackage = {
    ...before,
    status: "Sent to Client",
    sentAt: nowIso(),
    sentBy: actorName
  };
  const saved = await saveQuotationPackage(after, before, {
    action: "quotation_marked_sent_manual",
    summary: "Quotation marked sent manually after boss approval gate.",
    actorName,
    actorRole: "sales",
    metadata: { manualOnly: true }
  });
  return { ok: true, error: "", quotation: saved };
}

export async function markQuotationClientAccepted(quotationId: string, actorName = "Marcus", clientNotes = "") {
  const before = await getQuotationPackageById(quotationId);
  if (!before) return null;
  const after: QuotationPackage = {
    ...before,
    status: "Accepted",
    acceptedAt: nowIso(),
    clientNotes: clientNotes || before.clientNotes
  };
  return saveQuotationPackage(after, before, {
    action: "quotation_client_accepted",
    summary: "Client acceptance recorded manually for quotation package.",
    actorName,
    actorRole: "sales",
    note: clientNotes,
    metadata: { createsProjectAndPaymentSchedule: true, nonGst: true }
  });
}

export async function markQuotationClientRejected(quotationId: string, actorName = "Marcus", clientNotes = "") {
  const before = await getQuotationPackageById(quotationId);
  if (!before) return null;
  const after: QuotationPackage = {
    ...before,
    status: "Client Rejected",
    rejectedByClientAt: nowIso(),
    clientNotes: clientNotes || before.clientNotes
  };
  return saveQuotationPackage(after, before, {
    action: "quotation_client_rejected",
    summary: "Client rejection recorded manually for quotation package.",
    actorName,
    actorRole: "sales",
    note: clientNotes
  });
}

export async function voidQuotationPackage(quotationId: string, actorName = "Marcus", reason = "") {
  const before = await getQuotationPackageById(quotationId);
  if (!before) return null;
  const after: QuotationPackage = {
    ...before,
    status: "Voided",
    voidedAt: nowIso(),
    voidedBy: actorName,
    voidReason: reason || "Voided from quotation workflow."
  };
  return saveQuotationPackage(after, before, {
    action: "quotation_voided",
    summary: "Quotation package voided instead of hard-deleted.",
    actorName,
    actorRole: "boss",
    note: reason,
    metadata: { hardDelete: false }
  });
}

export async function getSignedQuotationUrl(quotationId: string, expiresInSeconds = 300) {
  const quotation = await getQuotationPackageById(quotationId);
  if (!quotation || quotation.status === "Voided" || !quotation.storagePath) return "";
  if (getDataMode() !== "Supabase Mode") return "#";
  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from(quotation.storageBucket || CLIENT_FILES_BUCKET)
    .createSignedUrl(quotation.storagePath, expiresInSeconds, {
      download: safeFileName(quotation.originalFileName)
    });
  if (error) return "";
  await auditQuotationAction({
    action: "quotation_signed_url_created",
    quotation,
    before: quotation,
    actorName: "System",
    actorRole: "system",
    summary: "Short-lived signed URL created for quotation package.",
    metadata: { signedUrl: true, expiresInSeconds }
  }).catch(() => undefined);
  return data.signedUrl;
}
