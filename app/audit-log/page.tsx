import { PageHeader } from "@/components/PageHeader";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/data/audit-repository";

export default async function AuditLogPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ entity_type?: string; action?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const auth = await getCurrentProfile();
  const canViewAudit = Boolean(auth.profile && can(auth.profile.role, "view_audit"));
  if (!canViewAudit) {
    return (
      <>
        <PageHeader title="Audit Log" eyebrow="Traceability" />
        <div className="rounded border border-command-line bg-command-panel p-5 text-command-muted shadow-command">
          Audit log access is restricted to boss/admin roles.
        </div>
      </>
    );
  }
  const auditLogs = await listAuditLogs({ entityType: searchParams?.entity_type, action: searchParams?.action });
  return (
    <>
      <PageHeader title="Audit Log" eyebrow="Traceability" />
      <form className="mb-4 grid gap-3 rounded border border-command-line bg-command-panel p-4 sm:grid-cols-[1fr_1fr_8rem]">
        <input name="entity_type" placeholder="entity type" defaultValue={searchParams?.entity_type ?? ""} className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm" />
        <input name="action" placeholder="action" defaultValue={searchParams?.action ?? ""} className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm" />
        <button className="rounded border border-command-line bg-command-panel2 px-3 py-2 text-sm font-semibold">Filter</button>
      </form>
      <div className="rounded border border-command-line bg-command-panel shadow-command">
        {auditLogs.map((log) => (
          <div key={log.id} className="grid gap-3 border-b border-command-line p-4 last:border-b-0 lg:grid-cols-[10rem_12rem_1fr_12rem]">
            <p className="font-semibold">{log.actorName}</p>
            <p className="text-command-muted">{log.action}</p>
            <p>{log.summary}</p>
            <p className="text-sm text-command-muted">{log.createdAt}</p>
          </div>
        ))}
      </div>
    </>
  );
}
