import { PageHeader } from "@/components/PageHeader";
import { ConversationExportPanel } from "@/components/settings/ConversationExportPanel";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function ConversationExportPage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Conversation Export" eyebrow="Protected data" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Boss access required</h2>
          <p className="mt-2 text-sm text-command-muted">Sign in with the boss account before exporting conversation data.</p>
        </section>
      </>
    );
  }

  if (auth.profile.role !== "boss") {
    return (
      <>
        <PageHeader title="Conversation Export" eyebrow="Protected data" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Boss only</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Permission denied</h2>
          <p className="mt-2 text-sm text-command-muted">Conversation exports are restricted to Marcus’s boss account.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Conversation Export" eyebrow="Data & privacy" />
      <ConversationExportPanel />
    </>
  );
}
