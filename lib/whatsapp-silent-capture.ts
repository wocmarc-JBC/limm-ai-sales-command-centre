import type { LeadMessage } from "@/lib/types";
import type { WhatsAppReplyDecision } from "@/lib/whatsapp-reply-decision";

export const SILENT_CAPTURE_EVENT_TYPE = "whatsapp_silent_capture";
export const SILENT_CAPTURE_REASON = "short_fact_suppressed_to_avoid_chatty_reply";

const FIELD_LABELS: Record<string, string> = {
  property_type: "Property type",
  flat_type: "Flat type",
  scope_summary: "Scope",
  project_type: "Project type",
  floor_plan_status: "Floor plan",
  site_photo_status: "Site photos",
  design_reference_status: "Design references",
  address: "Address / area",
  postal_code: "Postal code",
  appointment_preference: "Appointment preference"
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function cleanFields(value: unknown) {
  return Object.fromEntries(
    Object.entries(asRecord(value))
      .map(([key, item]) => [key, asString(item)])
      .filter(([, item]) => Boolean(item))
  );
}

export function isSilentCaptureTrace(trace: Record<string, unknown> | undefined) {
  return Boolean(trace?.burstIntakeSuppressed === true || trace?.silentCaptureInternalNoteRequired === true);
}

export function silentCaptureFieldsFromTrace(trace: Record<string, unknown> | undefined) {
  const direct = cleanFields(trace?.silentCaptureCapturedFields);
  if (Object.keys(direct).length) return direct;
  return cleanFields(trace?.silentCaptureNewValues);
}

export function formatSilentCaptureFieldSummary(fields: Record<string, string>) {
  const items = Object.entries(fields)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? key.replace(/_/g, " ")}: ${value}`)
    .filter(Boolean);
  return items.length ? items.join(" | ") : "Facts captured for this lead.";
}

export function buildSilentCaptureNoteFromDecision(
  decision: WhatsAppReplyDecision,
  options: { leadId: string; sourceMessageId?: string }
) {
  const trace = decision.blackBoxTrace ?? {};
  if (!isSilentCaptureTrace(trace)) return null;

  const capturedFields = silentCaptureFieldsFromTrace(trace);
  const previousValues = cleanFields(trace.silentCapturePreviousValues);
  const newValues = cleanFields(trace.silentCaptureNewValues);
  const nextAction = asString(trace.silentCaptureNextAction) || "Review captured facts and continue from the next useful question.";
  const fieldSummary = formatSilentCaptureFieldSummary(capturedFields);
  const createdAt = new Date().toISOString();

  return {
    leadId: options.leadId,
    direction: "internal" as const,
    body: `AI captured facts silently\n${fieldSummary}\nNext action: ${nextAction}`,
    safeToSend: false,
    whatsappStatus: "disabled" as const,
    metadata: {
      type: SILENT_CAPTURE_EVENT_TYPE,
      event: SILENT_CAPTURE_EVENT_TYPE,
      internalOnly: true,
      visible_to_client: false,
      visibleToClient: false,
      source_message_id: options.sourceMessageId || asString(trace.providerMessageId),
      sourceMessageId: options.sourceMessageId || asString(trace.providerMessageId),
      captured_fields: capturedFields,
      capturedFields,
      previous_values: previousValues,
      previousValues,
      new_values: newValues,
      newValues,
      confidence: decision.confidence,
      reason: SILENT_CAPTURE_REASON,
      created_at: createdAt,
      createdAt,
      nextAction,
      final_send_result: "internal_note_only",
      noClientSend: true
    }
  };
}

export function isSilentCaptureMessage(message: LeadMessage) {
  const metadata = message.metadata ?? {};
  return message.direction === "internal" && (
    metadata.type === SILENT_CAPTURE_EVENT_TYPE ||
    metadata.event === SILENT_CAPTURE_EVENT_TYPE ||
    metadata.reason === SILENT_CAPTURE_REASON
  );
}

export function silentCaptureSummary(message: LeadMessage) {
  const metadata = message.metadata ?? {};
  const capturedFields = cleanFields(metadata.capturedFields ?? metadata.captured_fields);
  const nextAction = asString(metadata.nextAction) || "Review captured facts and continue from the next useful question.";
  return {
    title: "AI captured facts silently",
    fieldSummary: formatSilentCaptureFieldSummary(capturedFields),
    capturedFields,
    nextAction,
    createdAt: message.createdAt
  };
}

export function latestSilentCapture(messages: LeadMessage[], withinHours = 24) {
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return [...messages]
    .filter(isSilentCaptureMessage)
    .filter((message) => {
      const time = Date.parse(message.createdAt);
      return Number.isFinite(time) && time >= cutoff;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function latestSilentCaptureWithoutNewerClientReply(messages: LeadMessage[], withinHours = 24) {
  const latest = latestSilentCapture(messages, withinHours);
  if (!latest) return null;
  const latestTime = Date.parse(latest.createdAt);
  const hasNewerClientFacingReply = messages.some((message) => {
    if (message.direction !== "outbound" || !message.safeToSend) return false;
    const time = Date.parse(message.createdAt);
    return Number.isFinite(time) && Number.isFinite(latestTime) && time > latestTime;
  });
  return hasNewerClientFacingReply ? null : latest;
}
