import { AppointmentSlotActions } from "@/components/AppointmentSlotActions";
import { PageHeader } from "@/components/PageHeader";
import { findAppointmentSlots } from "@/lib/appointment-engine";
import { getAppointmentSettings } from "@/lib/data/appointment-settings-repository";
import { humanizeDay } from "@/lib/labels";

function slotMessage(slot: { day: string; date: string; start: string; end: string }) {
  return `We can check availability for ${humanizeDay(slot.day)}, ${slot.date}, ${slot.start} to ${slot.end}. Would this timing work for you?`;
}

export default async function AppointmentCommandCentrePage({ searchParams }: { searchParams?: { lead?: string } }) {
  const settings = await getAppointmentSettings();
  const startDate = new Date().toISOString().slice(0, 10);
  const slots = findAppointmentSlots(settings, "site_discussion", startDate, 7).slice(0, 8);
  const leadId = searchParams?.lead;

  return (
    <>
      <PageHeader title="Appointment Command Centre" eyebrow="Manual booking control">
        <a
          href="/settings#appointment-settings"
          className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60"
        >
          Open Appointment Settings
        </a>
      </PageHeader>
      <p className="mb-4 text-sm text-command-muted">
        Slots are generated from appointment settings. Calendar auto-booking remains off; Marcus offers or copies timing text manually.
      </p>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {slots.map((slot) => (
          <article key={`${slot.date}-${slot.start}`} className="rounded-2xl border border-command-line bg-command-panel p-4 shadow-command">
            <p className="text-sm text-command-muted">{humanizeDay(slot.day)}</p>
            <h3 className="mt-1 text-xl font-semibold">{slot.date}</h3>
            <p className="mt-2">{slot.start} to {slot.end}</p>
            <p className="mt-3 text-sm text-command-muted">{slot.approvalRequired ? slot.approvalReason : "Can be offered after lead review"}</p>
            <AppointmentSlotActions leadId={leadId} message={slotMessage(slot)} />
          </article>
        ))}
      </section>
    </>
  );
}
