import "server-only";

import { Buffer } from "node:buffer";
import {
  classifyLeadFileCategory,
  createLeadFileMetadataOnly,
  getLeadFileById,
  uploadLeadFile,
  validateLeadFileUpload,
  voidLeadFile
} from "@/lib/data/lead-files-repository";
import { getWhatsAppAccessToken, getWhatsAppPhoneNumberId, getWhatsAppRuntime } from "@/lib/whatsapp-config";
import type { ParsedWhatsAppMessage } from "@/lib/whatsapp-parser";
import type { LeadFile } from "@/lib/types";

export type WhatsAppMediaStorageResult = {
  attempted: boolean;
  stored: boolean;
  file?: LeadFile;
  category?: string;
  reason: string;
};

function safeFileName(message: ParsedWhatsAppMessage) {
  if (message.filename) return message.filename;
  const extension = message.mimeType.includes("pdf")
    ? "pdf"
    : message.mimeType.includes("png")
      ? "png"
      : message.mimeType.includes("webp")
        ? "webp"
        : message.mimeType.includes("heic")
          ? "heic"
          : "jpg";
  return `whatsapp-${message.type || "media"}-${message.providerMessageId || Date.now()}.${extension}`;
}

const MEDIA_FETCH_RETRY_DELAYS_MS = [0, 350, 900] as const;
const MEDIA_FETCH_TIMEOUT_MS = 6_000;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function safeMetaError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  const code = Number(payload?.error?.code ?? 0);
  const subcode = Number(payload?.error?.error_subcode ?? 0);
  return {
    code: Number.isFinite(code) && code > 0 ? code : 0,
    subcode: Number.isFinite(subcode) && subcode > 0 ? subcode : 0
  };
}

function mediaFetchError(stage: "metadata" | "download", status: number, meta: { code: number; subcode: number }) {
  const details = [meta.code ? `Meta code ${meta.code}` : "", meta.subcode ? `subcode ${meta.subcode}` : ""]
    .filter(Boolean)
    .join(", ");
  return new Error(`WhatsApp media ${stage} fetch failed with status ${status}${details ? ` (${details})` : ""}.`);
}

function retryableMediaStatus(status: number, metaCode: number) {
  if (metaCode === 190) return false;
  return status === 401 || status === 404 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchWhatsAppMediaBuffer(mediaId: string, businessPhoneNumberId = "") {
  const runtime = getWhatsAppRuntime();
  const token = getWhatsAppAccessToken();
  if (!token || !runtime.phoneNumberIdConfigured) throw new Error("WhatsApp media credentials are not configured.");
  const phoneNumberId = businessPhoneNumberId || getWhatsAppPhoneNumberId();
  const metadataUrl = new URL(`https://graph.facebook.com/${runtime.graphVersion}/${encodeURIComponent(mediaId)}`);
  if (phoneNumberId) metadataUrl.searchParams.set("phone_number_id", phoneNumberId);

  let lastError: Error = new Error("WhatsApp media retrieval failed.");
  for (const delayMs of MEDIA_FETCH_RETRY_DELAYS_MS) {
    if (delayMs) await wait(delayMs);
    try {
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS)
      });
      if (!metadataResponse.ok) {
        const meta = await safeMetaError(metadataResponse);
        const error = mediaFetchError("metadata", metadataResponse.status, meta);
        if (!retryableMediaStatus(metadataResponse.status, meta.code)) throw error;
        lastError = error;
        continue;
      }
      const metadata = await metadataResponse.json();
      const url = typeof metadata?.url === "string" ? metadata.url : "";
      if (!url) throw new Error("WhatsApp media metadata did not include a download URL.");

      const mediaResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS)
      });
      if (!mediaResponse.ok) {
        const meta = await safeMetaError(mediaResponse);
        const error = mediaFetchError("download", mediaResponse.status, meta);
        if (!retryableMediaStatus(mediaResponse.status, meta.code)) throw error;
        lastError = error;
        continue;
      }
      const arrayBuffer = await mediaResponse.arrayBuffer();
      return {
        bytes: Buffer.from(arrayBuffer),
        mimeType: String(metadata?.mime_type ?? mediaResponse.headers.get("content-type") ?? ""),
        sizeBytes: Number(metadata?.file_size ?? arrayBuffer.byteLength)
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown WhatsApp media retrieval failure.");
      if (lastError.name !== "TimeoutError" && lastError.name !== "AbortError") throw lastError;
    }
  }
  throw lastError;
}

async function downloadAndStoreWhatsAppMedia(input: { leadId: string; message: ParsedWhatsAppMessage }) {
  const category = classifyLeadFileCategory({
    messageType: input.message.type,
    mimeType: input.message.mimeType,
    caption: input.message.caption,
    filename: input.message.filename
  });
  const fileName = safeFileName(input.message);
  if (!input.message.mediaId) throw new Error("WhatsApp media id is missing.");
  const media = await fetchWhatsAppMediaBuffer(input.message.mediaId, input.message.businessPhoneNumberId);
  const mimeType = input.message.mimeType || media.mimeType || "application/octet-stream";
  const validation = validateLeadFileUpload({ fileName, mimeType, sizeBytes: media.sizeBytes });
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const file = await uploadLeadFile({
    leadId: input.leadId,
    fileName,
    mimeType,
    sizeBytes: media.sizeBytes,
    bytes: media.bytes,
    fileCategory: category,
    source: "whatsapp",
    uploadedBy: "WhatsApp",
    whatsappMessageId: input.message.providerMessageId,
    whatsappMediaId: input.message.mediaId,
    notes: input.message.caption || undefined
  });
  return { file, category };
}

export async function storeWhatsAppMediaForLead(input: {
  leadId: string;
  message: ParsedWhatsAppMessage;
}): Promise<WhatsAppMediaStorageResult> {
  const type = input.message.type.toLowerCase();
  if (!["image", "document"].includes(type)) {
    return { attempted: false, stored: false, reason: "not_image_or_document" };
  }
  const category = classifyLeadFileCategory({
    messageType: input.message.type,
    mimeType: input.message.mimeType,
    caption: input.message.caption,
    filename: input.message.filename
  });
  const fileName = safeFileName(input.message);
  if (!input.message.mediaId) {
    const file = await createLeadFileMetadataOnly({
      leadId: input.leadId,
      fileCategory: category,
      fileName,
      mimeType: input.message.mimeType,
      source: "whatsapp",
      whatsappMessageId: input.message.providerMessageId,
      whatsappMediaId: "",
      notes: "WhatsApp media id missing; file received but not stored."
    });
    return { attempted: true, stored: false, file, category, reason: "missing_media_id" };
  }

  try {
    const { file } = await downloadAndStoreWhatsAppMedia(input);
    return { attempted: true, stored: true, file, category, reason: "stored" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown WhatsApp media storage failure.";
    const file = await createLeadFileMetadataOnly({
      leadId: input.leadId,
      fileCategory: category,
      fileName,
      mimeType: input.message.mimeType,
      source: "whatsapp",
      whatsappMessageId: input.message.providerMessageId,
      whatsappMediaId: input.message.mediaId,
      notes: `WhatsApp media received but not stored: ${reason}`
    });
    return { attempted: true, stored: false, file, category, reason };
  }
}

export async function retryWhatsAppMediaForLeadFile(fileId: string, retriedBy = "Inbox operator") {
  const existing = await getLeadFileById(fileId);
  if (!existing || existing.fileStatus === "voided") throw new Error("WhatsApp media record was not found.");
  if (existing.source !== "whatsapp" || !existing.whatsappMediaId) throw new Error("WhatsApp media cannot be retried for this file record.");
  if (existing.fileSizeBytes > 0 && existing.fileStatus !== "needs_clarification") return existing;

  const type = existing.mimeType.toLowerCase().startsWith("image/") ? "image" : "document";
  const message: ParsedWhatsAppMessage = {
    senderPhone: "",
    providerMessageId: existing.whatsappMessageId || "",
    timestamp: null,
    text: "",
    type,
    caption: "",
    filename: existing.originalFileName,
    mimeType: existing.mimeType,
    mediaId: existing.whatsappMediaId,
    isVoiceMessage: false,
    contactName: "",
    businessPhoneNumberId: getWhatsAppPhoneNumberId()
  };
  const recovered = await downloadAndStoreWhatsAppMedia({ leadId: existing.leadId, message });
  await voidLeadFile({
    fileId: existing.id,
    voidedBy: retriedBy,
    reason: `Recovered into replacement file record ${recovered.file.id}.`
  }).catch(() => null);
  return recovered.file;
}
