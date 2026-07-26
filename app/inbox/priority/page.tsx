import { PageHeader } from "@/components/PageHeader";
import { MarcusPriorityPanel } from "@/components/inbox/MarcusPriorityPanel";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function MarcusPriorityQueuePage() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return (
      <>
        <PageHeader title="Marcus Priority Queue" eyebrow="Protected inbox" />
        <section className="mission-panel rounded-2xl p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Login required</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Protected conversation data</h2>
          <p className="mt-2 text-sm text-command-muted">Sign in before loading the priority queue.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Marcus Priority Queue" eyebrow="Boss triage" />
      <MarcusPriorityPanel />
    </>
  );
}
