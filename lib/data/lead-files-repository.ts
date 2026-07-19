import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { getDataMode } from "./data-source";
import { mapLeadFileRow, mapLeadUploadLinkRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { createAuditLog } from "@/lib/data/audit-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { getLeadById, updateLeadIntakeProfile } from "@/lib/data/leads-repository";
import { buildLeadIntakePlan } from "@/lib/lead-intake";
import type { Lead, LeadFile, LeadFileCategory, LeadFileSource, LeadFileStatus, LeadUploadLink } from "@/lib/types";

export const CLIENT_FILES_BUCKET = "client-files";
export const MAX_CLIENT_FILE_BYTES = 20 * 1024 * 1024;
export const LEAD_FILE_CATEGORIES: LeadFileCategory[] = [
  "floor_plan",
  "site_photos",
  "reference_images",
  "existing_quotation",
  "building_rules",
  "other_documents"
];
export const LEAD_FILE_STATUSES: LeadFileStatus[] = [
  "missing",
  "received",
  "reviewed",
  "needs_clarification",
  "archived",
  "voided"
];

const CATEGORY_FOLDER: Record<LeadFileCategory, string> = {
  floor_plan: "floor-plan",
  site_photos: "site-photos",
  reference_images: "reference-images",
  existing_quotation: "existing-quotation",
  building_rules: "building-rules",
  other_documents: "other-documents"
};

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf"
]);

function adminClient() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase server-only admin credentials are required for private client file storage.");
  return supabase;
}

function normalizeText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9\s.-]/g, " ").replace(/\s+/g, " ").trim();
}

function safeFileName(value = "client-file") {
  const cleaned = value
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return cleaned || "client-file";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildStoragePath(input: { leadId: string; category: LeadFileCategory; fileName: string }) {
  return `leads/${input.leadId}/${CATEGORY_FOLDER[input.category]}/${Date.now()}-${randomUUID()}-${safeFileName(input.fileName)}`;
}

export function getClientFilesStorageRuntime() {
  return {
    bucketName: CLIENT_FILES_BUCKET,
    maxFileBytes: MAX_CLIENT_FILE_BYTES,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    privateBucketRequired: true,
    signedUrlsRequired: true
  };
}

export function classifyLeadFileCategory(input: {
  messageType?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
}): LeadFileCategory {
  const text = normalizeText(`${input.messageType ?? ""} ${input.mimeType ?? ""} ${input.caption ?? ""} ${input.filename ?? ""}`);
  if (/\b(floor\s*plan|floorplan|layout|drawing|plan\.pdf|site\s*plan)\b/i.test(text)) return "floor_plan";
  if (/\b(reference|design|moodboard|pinterest|theme|style)\b/i.test(text)) return "reference_images";
  if (/\b(quotation|quote|existing quote|contract|proposal)\b/i.test(text)) return "existing_quotation";
  if (/\b(mcst|building rules?|management|house rules?|renovation rules?|by[-\s]?laws)\b/i.test(text)) return "building_rules";
  if (/^image\b|image\//i.test(text)) return "site_photos";
  return "other_documents";
}

export function validateLeadFileUpload(input: { fileName: string; mimeType: string; sizeBytes: number }) {
  const errors: string[] = [];
  if (!ALLOWED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    errors.push("Only JPG, PNG, WEBP, HEIC images and PDF documents are allowed in this version.");
  }
  if (input.sizeBytes > MAX_CLIENT_FILE_BYTES) {
    errors.push(`File is too large. Maximum size is ${Math.round(MAX_CLIENT_FILE_BYTES / 1024 / 1024)}MB.`);
  }
  if (input.sizeBytes <= 0) errors.push("File is empty.");
  return { ok: errors.length === 0, errors };
}

async function auditFileAction(input: {
  action: string;
  leadId: string;
  fileId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await createAuditLog({
    actorType: "system",
    actorName: "Client Files",
    action: input.action,
    entityType: "lead",
    entityId: input.leadId,
    summary: input.summary,
    metadata: {
      leadId: input.leadId,
      fileId: input.fileId ?? "",
      privateBucket: true,
      signedUrlsOnly: true,
      hardDeleteDefault: false,
      ...(input.metadata ?? {})
    }
  });
}

async function updateReadinessFromFile(leadId: string, category: LeadFileCategory) {
  const lead = await getLeadById(leadId);
  if (!lead) return;
  const leadMessages = await listLeadMessages(leadId);
  const profile = {
    ...(lead.intakeProfile ?? {}),
    floorPlanStatus: category === "floor_plan" ? "Received" : lead.intakeProfile?.floorPlanStatus ?? "",
    sitePhotosStatus: category === "site_photos" ? "Received" : lead.intakeProfile?.sitePhotosStatus ?? "",
    updatedAt: new Date().toISOString(),
    updatedBy: "Client Files"
  };
  const plan = buildLeadIntakePlan({ ...lead, intakeProfile: profile }, leadMessages);
  await updateLeadIntakeProfile(leadId, { ...plan.profile, updatedAt: profile.updatedAt, updatedBy: profile.updatedBy }, {
    source: "client_file_received",
    fileCategory: category,
    floorPlanReceived: category === "floor_plan",
    sitePhotosReceived: category === "site_photos",
    referenceImagesReceived: category === "reference_images",
    meetingReadinessFileConnection: true,
    quotationReadinessFileConnection: true
  });
}

export async function listLeadFiles(leadId: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_files")
      .select("*")
      .eq("lead_id", leadId)
      .order("uploaded_at", { ascending: false });
    if (!error && data) return data.map(mapLeadFileRow);
  }

  return mockClone(getMockStore().leadFiles)
    .filter((file) => file.leadId === leadId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function listAllLeadFiles() {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_files")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (!error && data) return data.map(mapLeadFileRow);
  }

  return mockClone(getMockStore().leadFiles).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getLeadFileById(fileId: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();
    if (error || !data) return null;
    return mapLeadFileRow(data);
  }
  const file = getMockStore().leadFiles.find((item) => item.id === fileId);
  return file ? mockClone(file) : null;
}

export async function createLeadUploadLink(input: { leadId: string; createdBy?: string; expiresInDays?: number; maxUploads?: number }) {
  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInDays ?? 14) * 24 * 60 * 60 * 1000).toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_upload_links")
      .insert({
        lead_id: input.leadId,
        token_hash: hash,
        expires_at: expiresAt,
        created_by: input.createdBy ?? "Marcus",
        max_uploads: input.maxUploads ?? 20
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Upload link creation failed: ${error.message}`);
    const record = mapLeadUploadLinkRow(data);
    await auditFileAction({
      action: "client_upload_link_created",
      leadId: input.leadId,
      summary: "Secure client upload link created.",
      metadata: { uploadLinkId: record.id, tokenHashStored: true, rawTokenStored: false, expiresAt }
    });
    return { uploadLink: record, token: rawToken };
  }

  const uploadLink: LeadUploadLink = {
    id: randomUUID(),
    leadId: input.leadId,
    tokenHash: hash,
    expiresAt,
    isActive: true,
    createdBy: input.createdBy ?? "Marcus",
    createdAt: now.toISOString(),
    usedAt: null,
    maxUploads: input.maxUploads ?? 20,
    notes: null
  };
  getMockStore().leadUploadLinks.unshift(uploadLink);
  await auditFileAction({
    action: "client_upload_link_created",
    leadId: input.leadId,
    summary: "Secure client upload link created in mock mode.",
    metadata: { uploadLinkId: uploadLink.id, tokenHashStored: true, rawTokenStored: false, expiresAt }
  });
  return { uploadLink: mockClone(uploadLink), token: rawToken };
}

export async function listLeadUploadLinks(leadId: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("lead_upload_links")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (!error && data) return data.map(mapLeadUploadLinkRow);
  }
  return mockClone(getMockStore().leadUploadLinks).filter((link) => link.leadId === leadId);
}

export async function getUploadLinkByToken(token: string) {
  const hash = tokenHash(token);
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_upload_links")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !data) return null;
    const record = mapLeadUploadLinkRow(data);
    if (!record.isActive || record.expiresAt < now) return null;
    return record;
  }
  const record = getMockStore().leadUploadLinks.find((link) => link.tokenHash === hash && link.isActive && link.expiresAt >= now) ?? null;
  return record ? mockClone(record) : null;
}

export async function uploadLeadFile(input: {
  leadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
  fileCategory: LeadFileCategory;
  source: LeadFileSource;
  uploadedBy?: string;
  whatsappMessageId?: string;
  whatsappMediaId?: string;
  notes?: string;
}) {
  const validation = validateLeadFileUpload({ fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const now = new Date().toISOString();
  const storagePath = buildStoragePath({ leadId: input.leadId, category: input.fileCategory, fileName: input.fileName });

  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { error: uploadError } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .upload(storagePath, input.bytes, {
        contentType: input.mimeType,
        upsert: false
      });
    if (uploadError) throw new Error(`Private file upload failed: ${uploadError.message}`);

    const { data, error } = await supabase
      .from("lead_files")
      .insert({
        lead_id: input.leadId,
        file_category: input.fileCategory,
        file_status: "received",
        original_file_name: input.fileName,
        storage_bucket: CLIENT_FILES_BUCKET,
        storage_path: storagePath,
        mime_type: input.mimeType,
        file_size_bytes: input.sizeBytes,
        source: input.source,
        whatsapp_message_id: input.whatsappMessageId || null,
        whatsapp_media_id: input.whatsappMediaId || null,
        uploaded_by: input.uploadedBy ?? input.source,
        uploaded_at: now,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Lead file record insert failed: ${error.message}`);
    const file = mapLeadFileRow(data);
    await auditFileAction({
      action: input.source === "whatsapp" ? "whatsapp_media_stored" : "client_file_uploaded",
      leadId: input.leadId,
      fileId: file.id,
      summary: input.source === "whatsapp" ? "WhatsApp media stored in private client-files bucket." : "Client file uploaded to private storage.",
      metadata: { fileCategory: input.fileCategory, fileSource: input.source, storageBucket: CLIENT_FILES_BUCKET, storagePath }
    });
    await updateReadinessFromFile(input.leadId, input.fileCategory);
    return file;
  }

  const file: LeadFile = {
    id: randomUUID(),
    leadId: input.leadId,
    projectId: null,
    fileCategory: input.fileCategory,
    fileStatus: "received",
    originalFileName: input.fileName,
    storageBucket: CLIENT_FILES_BUCKET,
    storagePath,
    mimeType: input.mimeType,
    fileSizeBytes: input.sizeBytes,
    source: input.source,
    whatsappMessageId: input.whatsappMessageId ?? null,
    whatsappMediaId: input.whatsappMediaId ?? null,
    uploadedBy: input.uploadedBy ?? input.source,
    uploadedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    notes: input.notes ?? null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: now,
    updatedAt: now
  };
  getMockStore().leadFiles.unshift(file);
  await auditFileAction({
    action: input.source === "whatsapp" ? "whatsapp_media_stored" : "client_file_uploaded",
    leadId: input.leadId,
    fileId: file.id,
    summary: "Client file recorded in mock mode.",
    metadata: { fileCategory: input.fileCategory, fileSource: input.source, mockMode: true }
  });
  await updateReadinessFromFile(input.leadId, input.fileCategory);
  return mockClone(file);
}

export async function createLeadFileMetadataOnly(input: {
  leadId: string;
  fileCategory: LeadFileCategory;
  fileName: string;
  mimeType: string;
  source: LeadFileSource;
  whatsappMessageId?: string;
  whatsappMediaId?: string;
  notes: string;
}) {
  const now = new Date().toISOString();
  const storagePath = `media-received-but-not-stored/${input.leadId}/${input.whatsappMediaId || randomUUID()}`;
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .insert({
        lead_id: input.leadId,
        file_category: input.fileCategory,
        file_status: "needs_clarification",
        original_file_name: input.fileName,
        storage_bucket: CLIENT_FILES_BUCKET,
        storage_path: storagePath,
        mime_type: input.mimeType,
        file_size_bytes: 0,
        source: input.source,
        whatsapp_message_id: input.whatsappMessageId || null,
        whatsapp_media_id: input.whatsappMediaId || null,
        uploaded_by: input.source,
        uploaded_at: now,
        notes: input.notes,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Lead file metadata insert failed: ${error.message}`);
    const file = mapLeadFileRow(data);
    await auditFileAction({
      action: "whatsapp_media_received_but_not_stored",
      leadId: input.leadId,
      fileId: file.id,
      summary: "WhatsApp media metadata was saved but private storage failed.",
      metadata: { fileCategory: input.fileCategory, reason: input.notes }
    });
    return file;
  }
  const file: LeadFile = {
    id: randomUUID(),
    leadId: input.leadId,
    projectId: null,
    fileCategory: input.fileCategory,
    fileStatus: "needs_clarification",
    originalFileName: input.fileName,
    storageBucket: CLIENT_FILES_BUCKET,
    storagePath,
    mimeType: input.mimeType,
    fileSizeBytes: 0,
    source: input.source,
    whatsappMessageId: input.whatsappMessageId ?? null,
    whatsappMediaId: input.whatsappMediaId ?? null,
    uploadedBy: input.source,
    uploadedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    notes: input.notes,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: now,
    updatedAt: now
  };
  getMockStore().leadFiles.unshift(file);
  return mockClone(file);
}

export async function getSignedLeadFileUrl(
  fileId: string,
  expiresInSeconds = 300,
  options: { download?: boolean } = { download: true }
) {
  let file: LeadFile | undefined;
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .select("*")
      .eq("id", fileId)
      .neq("file_status", "voided")
      .maybeSingle();
    if (!error && data) file = mapLeadFileRow(data);
  } else {
    file = (await listAllLeadFiles()).find((item) => item.id === fileId && item.fileStatus !== "voided");
  }
  if (!file || file.fileStatus === "needs_clarification" || file.fileSizeBytes <= 0 || !file.storagePath) return "";
  if (getDataMode() !== "Supabase Mode") return "#";
  const supabase = adminClient();
  const bucket = supabase.storage.from(file.storageBucket || CLIENT_FILES_BUCKET);
  const signed = options.download === false
    ? await bucket.createSignedUrl(file.storagePath, expiresInSeconds)
    : await bucket.createSignedUrl(file.storagePath, expiresInSeconds, {
        download: safeFileName(file.originalFileName)
      });
  const { data, error } = signed;
  if (error) return "";
  await auditFileAction({
    action: "client_file_signed_url_created",
    leadId: file.leadId,
    fileId: file.id,
    summary: "Short-lived signed URL created for client file view/download.",
    metadata: { expiresInSeconds, signedUrl: true }
  }).catch(() => undefined);
  return data.signedUrl;
}

export async function markLeadFileReviewed(input: { fileId: string; reviewedBy?: string }) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .update({ file_status: "reviewed", reviewed_at: now, reviewed_by: input.reviewedBy ?? "Marcus" })
      .eq("id", input.fileId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`File review update failed: ${error.message}`);
    const file = mapLeadFileRow(data);
    await auditFileAction({
      action: "client_file_marked_reviewed",
      leadId: file.leadId,
      fileId: file.id,
      summary: "Client file marked reviewed.",
      metadata: { fileCategory: file.fileCategory, reviewedBy: input.reviewedBy ?? "Marcus" }
    });
    return file;
  }
  const store = getMockStore();
  const index = store.leadFiles.findIndex((file) => file.id === input.fileId);
  if (index < 0) return null;
  store.leadFiles[index] = { ...store.leadFiles[index], fileStatus: "reviewed", reviewedAt: now, reviewedBy: input.reviewedBy ?? "Marcus", updatedAt: now };
  return mockClone(store.leadFiles[index]);
}

export async function voidLeadFile(input: { fileId: string; voidedBy?: string; reason: string }) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .update({
        file_status: "voided",
        voided_at: now,
        voided_by: input.voidedBy ?? "Marcus",
        void_reason: input.reason || "Voided by Marcus"
      })
      .eq("id", input.fileId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`File void update failed: ${error.message}`);
    const file = mapLeadFileRow(data);
    await auditFileAction({
      action: "client_file_voided",
      leadId: file.leadId,
      fileId: file.id,
      summary: "Client file record voided instead of hard-deleted.",
      metadata: { fileCategory: file.fileCategory, reason: input.reason, hardDelete: false }
    });
    return file;
  }
  const store = getMockStore();
  const index = store.leadFiles.findIndex((file) => file.id === input.fileId);
  if (index < 0) return null;
  store.leadFiles[index] = { ...store.leadFiles[index], fileStatus: "voided", voidedAt: now, voidedBy: input.voidedBy ?? "Marcus", voidReason: input.reason, updatedAt: now };
  return mockClone(store.leadFiles[index]);
}

export async function restoreLeadFile(input: { fileId: string; restoredBy?: string }) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("lead_files")
      .update({
        file_status: "received",
        voided_at: null,
        voided_by: "",
        void_reason: "",
        updated_at: now
      })
      .eq("id", input.fileId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`File restore update failed: ${error.message}`);
    const file = mapLeadFileRow(data);
    await auditFileAction({
      action: "client_file_restored",
      leadId: file.leadId,
      fileId: file.id,
      summary: "Client file restored after data hygiene review.",
      metadata: { restoredBy: input.restoredBy ?? "Marcus", hardDelete: false }
    });
    return file;
  }
  const store = getMockStore();
  const index = store.leadFiles.findIndex((file) => file.id === input.fileId);
  if (index < 0) return null;
  store.leadFiles[index] = {
    ...store.leadFiles[index],
    fileStatus: "received",
    voidedAt: null,
    voidedBy: "",
    voidReason: "",
    updatedAt: now
  };
  await auditFileAction({
    action: "client_file_restored",
    leadId: store.leadFiles[index].leadId,
    fileId: store.leadFiles[index].id,
    summary: "Client file restored after data hygiene review.",
    metadata: { restoredBy: input.restoredBy ?? "Marcus", hardDelete: false, mockMode: true }
  });
  return mockClone(store.leadFiles[index]);
}

export async function markUploadLinkUsed(uploadLinkId: string) {
  const now = new Date().toISOString();
  if (getDataMode() === "Supabase Mode") {
    const supabase = adminClient();
    await supabase.from("lead_upload_links").update({ used_at: now }).eq("id", uploadLinkId);
    return;
  }
  const link = getMockStore().leadUploadLinks.find((item) => item.id === uploadLinkId);
  if (link) link.usedAt = now;
}
