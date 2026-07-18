import { defaultAppointmentSettings } from "@/lib/appointment-engine";
import type { AppointmentSettings } from "@/lib/types";
import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapAppointmentSettingsRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";

export async function getAppointmentSettings() {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("appointment_rules")
      .select("*")
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return mapAppointmentSettingsRow(data);
  }

  return mockClone(getMockStore().appointmentSettings);
}

export async function saveAppointmentSettings(settings: AppointmentSettings, auditMetadata: Record<string, unknown> = {}) {
  const before = await getAppointmentSettings();
  const normalized = {
    ...defaultAppointmentSettings,
    ...settings,
    days: { ...defaultAppointmentSettings.days, ...settings.days },
    appointmentTypes: { ...defaultAppointmentSettings.appointmentTypes, ...settings.appointmentTypes }
  };

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase!.from("appointment_rules").upsert(
      {
        name: "default",
        appointment_type: "default",
        timezone: normalized.timezone,
        allowed_days: normalized.days,
        standard_slots: normalized.days,
        minimum_notice_hours: normalized.minimumNoticeHours,
        max_per_day: normalized.maxAppointmentsPerDay,
        buffer_minutes: normalized.bufferBetweenAppointmentsMinutes,
        same_day_rule: normalized.sameDayBookingRule,
        public_holiday_rule: normalized.publicHolidayRule,
        boss_approval_required: normalized.bossApprovalRules.length > 0,
        boss_approval_rules: normalized.bossApprovalRules,
        day_settings: normalized.days,
        appointment_type_settings: normalized.appointmentTypes,
        active: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "name" }
    );
    if (!error) {
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "appointment_settings_saved",
        entityType: "appointment_rules",
        entityId: "default",
        summary: "Appointment settings saved. Sunday remains controlled by settings.",
        beforeData: { sunday: before.days.sunday },
        afterData: { sunday: normalized.days.sunday },
        metadata: auditMetadata
      });
      return normalized;
    }
  }

  getMockStore().appointmentSettings = mockClone(normalized);
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "appointment_settings_saved",
    entityType: "appointment_rules",
    entityId: "default",
    summary: "Appointment settings saved. Sunday remains controlled by settings.",
    beforeData: { sunday: before.days.sunday },
    afterData: { sunday: normalized.days.sunday },
    metadata: auditMetadata
  });
  return mockClone(normalized);
}
