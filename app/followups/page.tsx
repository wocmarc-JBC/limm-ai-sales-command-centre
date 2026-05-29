import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { updateFollowUpStatusAction } from "@/lib/actions";
import { listFollowUps } from "@/lib/data/followups-repository";

export default async function FollowUpQueuePage() {
  const followUps = await listFollowUps();
  return (
    <>
      <PageHeader title="Follow-Up Queue" eyebrow="Reply-only discipline" />
      <div className="rounded border border-command-line bg-command-panel shadow-command">
        {followUps.map((item) => (
          <div key={item.id} data-testid={`followup-${item.id}`} className="grid gap-3 border-b border-command-line p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_7rem] md:items-center xl:grid-cols-[minmax(0,1fr)_10rem_9rem_20rem]">
            <div className="min-w-0">
              <p className="font-semibold">{item.clientName}</p>
              <p className="text-sm text-command-muted">{item.templateType}</p>
              <p className="mt-1 break-words text-xs text-command-muted">{item.suggestedMessage}</p>
            </div>
            <p className="text-sm">{item.dueAt}</p>
            <p className="text-sm text-command-muted">{item.status}</p>
            <div className="flex flex-wrap gap-2 md:col-span-3 xl:col-span-1">
              <form action={updateFollowUpStatusAction}>
                <input type="hidden" name="followup_id" value={item.id} />
                <input type="hidden" name="status" value="Completed" />
                <ActionButton type="submit" tone="muted">Complete</ActionButton>
              </form>
              <form action={updateFollowUpStatusAction}>
                <input type="hidden" name="followup_id" value={item.id} />
                <input type="hidden" name="status" value="Snoozed" />
                <ActionButton type="submit" tone="muted">Snooze</ActionButton>
              </form>
              <form action={updateFollowUpStatusAction}>
                <input type="hidden" name="followup_id" value={item.id} />
                <input type="hidden" name="status" value="No Reply" />
                <ActionButton type="submit" tone="danger">No Reply</ActionButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
