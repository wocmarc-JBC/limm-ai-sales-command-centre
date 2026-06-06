import "server-only";

import { Buffer } from "node:buffer";
import {
  classifyLeadFileCategory,
  createLeadFileMetadataOnly,
  uploadLeadFile,
  validateLeadFileUpload
} from "@/lib/data/lead-files-repository";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";
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

async function fetchWhatsAppMediaBuffer(mediaId: string) {
  const runtime = getWhatsAppRuntime();
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !runtime.phoneNumberIdConfigured) throw new Error("WhatsApp media credentials are not configured.");

  const metadataResponse = await fetch(`https://graph.facebook.com/${runtime.graphVersion}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!metadataResponse.ok) throw new Error(`WhatsApp media metadata fetch failed with status ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json();
  const url = typeof metadata?.url === "string" ? metadata.url : "";
  if (!url) throw new Error("WhatsApp media metadata did not include a download URL.");

  const mediaResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!mediaResponse.ok) throw new Error(`WhatsApp media download failed with status ${mediaResponse.status}.`);
  const arrayBuffer = await mediaResponse.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    mimeType: String(metadata?.mime_type ?? mediaResponse.headers.get("content-type") ?? ""),
    sizeBytes: Number(metadata?.file_size ?? arrayBuffer.byteLength)
  };
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
    const media = await fetchWhatsAppMediaBuffer(input.message.mediaId);
    const mimeType = input.message.mimeType || media.mimeType || "application/octet-stream";
    const validation = validateLeadFileUpload({ fileName, mimeType, sizeBytes: media.sizeBytes });
    if (!validation.ok) {
      const file = await createLeadFileMetadataOnly({
        leadId: input.leadId,
        fileCategory: category,
        fileName,
        mimeType,
        source: "whatsapp",
        whatsappMessageId: input.message.providerMessageId,
        whatsappMediaId: input.message.mediaId,
        notes: `WhatsApp media validation failed: ${validation.errors.join(" ")}`
      });
      return { attempted: true, stored: false, file, category, reason: validation.errors.join(" ") };
    }
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
