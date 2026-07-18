export type InboxActivityItem = {
  id: string;
  lastActivityAt: string;
};

export function inboxLeadFallbackActivityAt(lead: {
  createdAt: string;
  updatedAt?: string;
  lastReplyAt?: string | null;
}) {
  return lead.lastReplyAt || lead.updatedAt || lead.createdAt;
}

function activityTime(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function compareInboxLatestActivity(a: InboxActivityItem, b: InboxActivityItem) {
  const newestFirst = activityTime(b.lastActivityAt) - activityTime(a.lastActivityAt);
  if (newestFirst !== 0) return newestFirst;
  return a.id.localeCompare(b.id);
}

export function sortInboxLatestFirst<T extends InboxActivityItem>(items: T[]) {
  return [...items].sort(compareInboxLatestActivity);
}
