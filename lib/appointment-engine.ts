import type { AppointmentSettings, AppointmentSlot, AppointmentType } from "./types";

export const defaultAppointmentSettings: AppointmentSettings = {
  timezone: "Asia/Singapore",
  minimumNoticeHours: 24,
  maxAppointmentsPerDay: 3,
  bufferBetweenAppointmentsMinutes: 30,
  sameDayBookingRule: "approval_required",
  publicHolidayRule: "approval_required",
  bossApprovalRules: ["weekend", "same_day", "public_holiday", "risky_scope"],
  days: {
    monday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] },
    tuesday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] },
    wednesday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] },
    thursday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] },
    friday: { enabled: true, approvalRequired: false, slots: [{ start: "09:00", end: "18:00" }] },
    saturday: { enabled: true, approvalRequired: true, slots: [{ start: "10:00", end: "16:00" }] },
    sunday: { enabled: false, approvalRequired: true, slots: [{ start: "10:00", end: "15:00" }] }
  },
  appointmentTypes: {
    initial_project_review: { enabled: true, durationMinutes: 60, approvalRequired: false },
    site_discussion: { enabled: true, durationMinutes: 60, approvalRequired: false },
    manager_call: { enabled: true, durationMinutes: 30, approvalRequired: false },
    quotation_review: { enabled: true, durationMinutes: 45, approvalRequired: true },
    site_visit: { enabled: true, durationMinutes: 60, approvalRequired: true },
    phone_review: { enabled: true, durationMinutes: 30, approvalRequired: false },
    zoom_review: { enabled: true, durationMinutes: 45, approvalRequired: false },
    landed_aa_review: { enabled: true, durationMinutes: 75, approvalRequired: true },
    condo_renovation_review: { enabled: true, durationMinutes: 60, approvalRequired: false },
    commercial_renovation_review: { enabled: true, durationMinutes: 60, approvalRequired: true }
  },
  publicHolidays: []
};

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMinutes(hm: string, minutes: number) {
  const [hour, minute] = hm.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function minutesFromHm(hm: string) {
  const [hour, minute] = hm.split(":").map(Number);
  return hour * 60 + minute;
}

export function findAppointmentSlots(
  settings: AppointmentSettings,
  appointmentType: AppointmentType,
  startDate: string,
  days = 7,
  existingHolds: Array<{ date: string; start: string; end: string }> = []
): AppointmentSlot[] {
  const typeConfig = settings.appointmentTypes[appointmentType];
  if (!typeConfig?.enabled) return [];

  const slots: AppointmentSlot[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const dayName = dayNames[day.getDay()];
    const dayConfig = settings.days[dayName];
    if (!dayConfig?.enabled) continue;

    const date = toDateKey(day);
    const holdsForDay = existingHolds.filter((hold) => hold.date === date);
    if (holdsForDay.length >= settings.maxAppointmentsPerDay) continue;

    for (const window of dayConfig.slots) {
      let cursor = window.start;
      while (minutesFromHm(cursor) + typeConfig.durationMinutes <= minutesFromHm(window.end)) {
        const end = addMinutes(cursor, typeConfig.durationMinutes);
        const conflict = holdsForDay.some((hold) => cursor < hold.end && end > hold.start);
        if (!conflict) {
          const approvalReasons = [];
          if (dayConfig.approvalRequired) approvalReasons.push(`${dayName} requires boss approval`);
          if (typeConfig.approvalRequired) approvalReasons.push("appointment type requires boss approval");
          if (settings.publicHolidays.includes(date) && settings.publicHolidayRule === "approval_required") {
            approvalReasons.push("public holiday requires boss approval");
          }
          slots.push({
            date,
            day: dayName,
            start: cursor,
            end,
            appointmentType,
            approvalRequired: approvalReasons.length > 0,
            approvalReason: approvalReasons.join("; ")
          });
        }
        cursor = addMinutes(cursor, 30 + settings.bufferBetweenAppointmentsMinutes);
      }
    }
  }
  return slots;
}
