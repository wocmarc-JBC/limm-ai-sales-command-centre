import { getCalendarRuntime } from "@/lib/calendar-config";
import type { Lead } from "@/lib/types";

export type BookingReadinessStatus =
  | "not_ready"
  | "needs_info"
  | "ready_for_boss_review"
  | "approved_for_booking"
  | "booked"
  | "declined"
  | "reschedule_required";

export type CalendarAppointmentType =
  | "initial_project_review"
  | "site_visit"
  | "phone_review"
  | "zoom_review"
  | "landed_aa_review"
  | "condo_renovation_review"
  | "commercial_renovation_review"
  | "unknown";

export interface BookingReadiness {
  status: BookingReadinessStatus;
  appointmentIntent: boolean;
  appointmentType: CalendarAppointmentType;
  missingInfo: string[];
  preferredDateTime: string;
  bossApprovalRequired: boolean;
  calendarEnabled: boolean;
  autoBookingEnabled: boolean;
  canCreateCalendarEvent: boolean;
  safetyNote: string;
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function detectAppointmentIntent(text = "") {
  return hasAny(text, [
    /\bsite\s*(visit|discussion)\b/i,
    /\bappointment\b/i,
    /\bcome\s+(down|site|tomorrow|today)\b/i,
    /\bmeet\b/i,
    /\bschedule\b/i,
    /\bbook\b/i,
    /\bcall me\b/i
  ]);
}

export function inferAppointmentType(text = "", lead?: Lead): CalendarAppointmentType {
  const combined = `${text} ${lead?.propertyType ?? ""} ${lead?.serviceType ?? ""} ${lead?.scopeSummary ?? ""}`;
  if (/\ba\s*&\s*a\b|\baa\b|addition|alteration|extension|landed/i.test(combined)) return "landed_aa_review";
  if (/commercial|clinic|office|shop|restaurant/i.test(combined)) return "commercial_renovation_review";
  if (/condo|apartment/i.test(combined)) return "condo_renovation_review";
  if (/zoom/i.test(combined)) return "zoom_review";
  if (/call|phone/i.test(combined)) return "phone_review";
  if (/site\s*(visit|discussion)|come\s+(down|site)/i.test(combined)) return "site_visit";
  return "initial_project_review";
}

export function evaluateBookingReadiness(input: {
  lead: Lead;
  latestText?: string;
  preferredDateTime?: string;
  bossApproved?: boolean;
  calendarEventId?: string;
  declined?: boolean;
}): BookingReadiness {
  const calendar = getCalendarRuntime();
  const latestText = input.latestText ?? input.lead.lastClientMessage ?? "";
  const appointmentIntent = detectAppointmentIntent(latestText);
  const appointmentType = inferAppointmentType(latestText, input.lead);
  const missingInfo: string[] = [];

  if (!input.lead.phone) missingInfo.push("client_phone");
  if (!input.lead.propertyType) missingInfo.push("property_type");
  if (!input.lead.scopeSummary || /pending review|not provided/i.test(input.lead.scopeSummary)) missingInfo.push("scope");
  if (appointmentType === "site_visit" && !/address|area|location|street|road|ave|drive|jalan/i.test(latestText)) {
    missingInfo.push("address_or_area");
  }
  if (["site_visit", "landed_aa_review", "commercial_renovation_review"].includes(appointmentType)) {
    const known = [...input.lead.missingInfo, ...missingInfo];
    if (known.includes("floor_plan") || known.includes("site_photos")) missingInfo.push("floor_plan_or_site_photos");
  }
  if (appointmentIntent && !input.preferredDateTime && !/today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm)/i.test(latestText)) {
    missingInfo.push("preferred_date_time");
  }

  let status: BookingReadinessStatus = appointmentIntent ? "needs_info" : "not_ready";
  if (input.declined) status = "declined";
  else if (input.calendarEventId) status = "booked";
  else if (appointmentIntent && missingInfo.length === 0 && input.bossApproved) status = "approved_for_booking";
  else if (appointmentIntent && missingInfo.length === 0) status = "ready_for_boss_review";

  return {
    status,
    appointmentIntent,
    appointmentType,
    missingInfo: [...new Set(missingInfo)],
    preferredDateTime: input.preferredDateTime ?? "",
    bossApprovalRequired: calendar.bossApprovalRequired,
    calendarEnabled: calendar.bookingEnabled,
    autoBookingEnabled: calendar.autoBookingEnabled,
    canCreateCalendarEvent: status === "approved_for_booking" && calendar.liveBookingAvailable && !calendar.autoBookingEnabled,
    safetyNote: "Do not confirm booking until event is created."
  };
}

export function canUseCalendarConfirmation(calendarEventId?: string) {
  return Boolean(calendarEventId);
}
