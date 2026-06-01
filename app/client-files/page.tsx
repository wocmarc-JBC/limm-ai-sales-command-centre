import { PageHeader } from "@/components/PageHeader";

export default function ClientFilesPage() {
  return (
    <>
      <PageHeader title="Client Files" eyebrow="Coming soon" />
      <section className="mission-panel rounded-3xl p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Storage disabled</p>
        <h2 className="mt-2 text-3xl font-semibold text-command-text">Client file upload is not enabled yet.</h2>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-command-muted">
          Real client storage will only be shown after Supabase Storage and approved upload handling are implemented. No fake folders, mock clients, or placeholder upload links are shown in the live UI. No real client files are exposed here yet.
        </p>
        <div className="mt-6 rounded-2xl border border-command-line bg-command-bg/55 p-4 text-base text-command-muted">
          For now, ask clients to send floor plans, site photos, or drawings through WhatsApp. They will remain visible in the lead conversation and audit trail.
        </div>
      </section>
    </>
  );
}
