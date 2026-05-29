import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { saveAppointmentSettingsAction } from "@/lib/actions";
import { getAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { humanizeAppointmentType, humanizeDay } from "@/lib/labels";

export default async function AppointmentSettingsPage() {
  const auth = await getCurrentProfile();
  const canEdit = Boolean(auth.profile && can(auth.profile.role, "edit_appointment_settings"));
  const settings = await getAppointmentSettings();
  const days = Object.entries(settings.days);
  const types = Object.entries(settings.appointmentTypes);

  return (
    <>
      <PageHeader title="Appointment Settings" eyebrow="Configurable rules" />
      <form action={saveAppointmentSettingsAction} className="grid gap-6 xl:grid-cols-2">
        <div className="rounded border border-command-line bg-command-panel p-5 shadow-command">
          <h3 className="text-lg font-semibold">Allowed Days</h3>
          <p className="mt-1 text-sm text-command-muted">Sunday is controlled only by this setting. No permanent Sunday block is coded.</p>
          <div className="mt-4 space-y-3">
            {days.map(([day, config]) => (
              <div key={day} className="grid gap-3 rounded border border-command-line bg-command-panel2 p-3 2xl:grid-cols-[minmax(0,1fr)_7rem_7rem_minmax(10rem,12rem)] 2xl:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">{humanizeDay(day)}</p>
                  <p className="break-words text-sm text-command-muted">{config.slots.map((slot) => `${slot.start}-${slot.end}`).join(", ")}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`day_enabled_${day}`} defaultChecked={config.enabled} disabled={!canEdit} />
                  Allowed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`day_approval_${day}`} defaultChecked={config.approvalRequired} disabled={!canEdit} />
                  Approval
                </label>
                <input
                  name={`day_slots_${day}`}
                  defaultValue={config.slots.map((slot) => `${slot.start}-${slot.end}`).join(", ")}
                  disabled={!canEdit}
                  className="w-full min-w-0 rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded border border-command-line bg-command-panel p-5 shadow-command">
            <h3 className="text-lg font-semibold">Appointment Types</h3>
            <div className="mt-4 space-y-3">
              {types.map(([type, config]) => (
                <div key={type} className="flex justify-between border-b border-command-line pb-3 text-sm">
                  <span>{humanizeAppointmentType(type)}</span>
                  <span>{config.durationMinutes} min | {config.approvalRequired ? "approval" : "standard"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-command-line bg-command-panel p-5 shadow-command">
            <h3 className="text-lg font-semibold">Booking Rules</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <label className="grid gap-1"><span>Timezone</span><input name="timezone" defaultValue={settings.timezone} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2" /></label>
              <label className="grid gap-1"><span>Minimum notice hours</span><input name="minimum_notice_hours" type="number" defaultValue={settings.minimumNoticeHours} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2" /></label>
              <label className="grid gap-1"><span>Max per day</span><input name="max_per_day" type="number" defaultValue={settings.maxAppointmentsPerDay} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2" /></label>
              <label className="grid gap-1"><span>Buffer minutes</span><input name="buffer_minutes" type="number" defaultValue={settings.bufferBetweenAppointmentsMinutes} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2" /></label>
              <label className="grid gap-1">
                <span>Same-day rule</span>
                <select name="same_day_rule" defaultValue={settings.sameDayBookingRule} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2">
                  <option value="allowed">allowed</option>
                  <option value="approval_required">approval_required</option>
                  <option value="blocked">blocked</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span>Public holiday rule</span>
                <select name="public_holiday_rule" defaultValue={settings.publicHolidayRule} disabled={!canEdit} className="rounded border border-command-line bg-command-bg px-3 py-2">
                  <option value="allowed">allowed</option>
                  <option value="approval_required">approval_required</option>
                  <option value="blocked">blocked</option>
                </select>
              </label>
            </dl>
            <div className="mt-5">
              <ActionButton type="submit" disabled={!canEdit}>{canEdit ? "Save Appointment Settings" : "Boss Access Required"}</ActionButton>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
