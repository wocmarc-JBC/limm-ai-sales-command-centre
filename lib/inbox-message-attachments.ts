import type { LeadFile, LeadMessage, LeadMessageAttachment, LeadMessageAttachmentKind } from "@/lib/types";

function metadataText(message: LeadMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function attachmentKind(messageType: string, mimeType: string): LeadMessageAttachmentKind {
  return messageType === "image" || mimeType.toLowerCase().startsWith("image/") ? "image" : "document";
}

function displayFileName(input: { fileName: string; kind: LeadMessageAttachmentKind; mimeType: string }) {
  const raw = input.fileName.trim();
  if (raw && !/^whatsapp-(?:image|document)-wamid\./i.test(raw)) return raw;
  if (input.kind === "image") {
    const extension = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
    return `WhatsApp image.${extension}`;
  }
  return raw || "WhatsApp document";
}

function isReady(file: LeadFile) {
  return file.fileStatus !== "voided"
    && file.fileStatus !== "needs_clarification"
    && file.fileSizeBytes > 0
    && Boolean(file.storagePath);
}

function attachmentFromFile(message: LeadMessage, file: LeadFile): LeadMessageAttachment {
  const messageType = metadataText(message, "messageType");
  const mimeType = file.mimeType || metadataText(message, "mimeType") || "application/octet-stream";
  const kind = attachmentKind(messageType, mimeType);
  const ready = isReady(file);
  const baseUrl = `/api/inbox/attachments/${encodeURIComponent(file.id)}`;
  return {
    id: file.id,
    kind,
    fileName: displayFileName({ fileName: file.originalFileName || metadataText(message, "filename"), kind, mimeType }),
    mimeType,
    fileSizeBytes: file.fileSizeBytes,
    fileCategory: file.fileCategory,
    availability: ready ? "ready" : "unavailable",
    viewUrl: ready ? baseUrl : "",
    downloadUrl: ready ? `${baseUrl}?download=1` : "",
    retryable: !ready && Boolean(file.whatsappMediaId)
  };
}

function missingAttachment(message: LeadMessage): LeadMessageAttachment | null {
  const messageType = metadataText(message, "messageType").toLowerCase();
  if (messageType !== "image" && messageType !== "document") return null;
  const mimeType = metadataText(message, "mimeType") || (messageType === "image" ? "image/jpeg" : "application/octet-stream");
  const kind = attachmentKind(messageType, mimeType);
  return {
    id: `missing-${message.id}`,
    kind,
    fileName: displayFileName({ fileName: metadataText(message, "filename"), kind, mimeType }),
    mimeType,
    fileSizeBytes: 0,
    fileCategory: kind === "image" ? "site_photos" : "other_documents",
    availability: "unavailable",
    viewUrl: "",
    downloadUrl: "",
    retryable: false
  };
}

export function attachLeadFilesToMessages(messages: LeadMessage[], files: LeadFile[]) {
  const filesByProviderMessageId = new Map<string, LeadFile[]>();
  for (const file of files) {
    if (!file.whatsappMessageId || file.fileStatus === "voided") continue;
    const current = filesByProviderMessageId.get(file.whatsappMessageId) ?? [];
    current.push(file);
    filesByProviderMessageId.set(file.whatsappMessageId, current);
  }

  return messages.map((message) => {
    const linked = message.providerMessageId
      ? filesByProviderMessageId.get(message.providerMessageId) ?? []
      : [];
    const ready = linked.filter(isReady);
    const selected = ready.length ? ready : linked;
    const attachments = selected.map((file) => attachmentFromFile(message, file));
    const fallback = attachments.length ? null : missingAttachment(message);
    return {
      ...message,
      attachments: fallback ? [fallback] : attachments
    };
  });
}
