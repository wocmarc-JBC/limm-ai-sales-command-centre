import { PageHeader } from "@/components/PageHeader";
import { findAppointmentSlots } from "@/lib/appointment-engine";
import { getAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { humanizeDay } from "@/lib/labels";

export default async function AppointmentCommandCentrePage() {
  const settings = await getAppointmentSettings();
  const slots = findAppointmentSlots(settings, "site_discussion", "2026-05-31", 7).slice(0, 8);

  return (
    <>
      <PageHeader title="Appointment Command Centre" eyebrow="Booking control" />
      <p className="mb-4 text-sm text-command-muted">Slots are generated from appointment settings. Sunday appears only when enabled there.</p>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {slots.map((slot) => (
          <article key={`${slot.date}-${slot.start}`} className="rounded border border-command-line bg-command-panel p-4 shadow-command">
            <p className="text-sm text-command-muted">{humanizeDay(slot.day)}</p>
            <h3 className="mt-1 text-xl font-semibold">{slot.date}</h3>
            <p className="mt-2">{slot.start} to {slot.end}</p>
            <p className="mt-3 text-sm text-command-muted">{slot.approvalRequired ? slot.approvalReason : "Can be offered after lead review"}</p>
          </article>
        ))}
      </section>
    </>
  );
}
