import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  LEAD_FILE_CATEGORIES,
  listAllLeadFiles,
  listLeadUploadLinks
} from "@/lib/data/lead-files-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { humanizeLabel } from "@/lib/labels";
import type { Lead, LeadFile, LeadFileCategory, LeadUploadLink } from "@/lib/types";

export const dynamic = "force-dynamic";

const categoryLabels: Record<LeadFileCategory, string> = {
  floor_plan: "Floor Plan",
  site_photos: "Site Photos",
  reference_images: "Reference Images",
  existing_quotation: "Existing Quotation",
  building_rules: "Building Rules",
  other_documents: "Other Documents"
};

const filters = [
  { key: "all", label: "All Leads" },
  { key: "missing-floor-plan", label: "Missing Floor Plan" },
  { key: "missing-site-photos", label: "Missing Site Photos" },
  { key: "files-received", label: "Files Received" },
  { key: "needs-review", label: "Needs Review" },
  { key: "reviewed", label: "Reviewed" },
  { key: "upload-link-active", label: "Upload Link Active" }
] as const;

function activeUploadLinks(links: LeadUploadLink[]) {
  const now = new Date().toISOString();
  return links.filter((link) => link.isActive && link.expiresAt >= now);
}

function filesForCategory(files: LeadFile[], category: LeadFileCategory) {
  return files.filter((file) => file.fileCategory === category && file.fileStatus !== "voided");
}

function categoryStatus(files: LeadFile[], category: LeadFileCategory) {
  const categoryFiles = filesForCategory(files, category);
  if (!categoryFiles.length) return { label: "Missing", tone: "missing", count: 0 };
  if (categoryFiles.some((file) => file.fileStatus === "needs_clarification")) {
    return { label: "Needs Clarification", tone: "needs_clarification", count: categoryFiles.length };
  }
  if (categoryFiles.every((file) => file.fileStatus === "reviewed")) {
    return { label: "Reviewed", tone: "reviewed", count: categoryFiles.length };
  }
  return { label: "Received", tone: "received", count: categoryFiles.length };
}

function shouldShowLead(input: {
  lead: Lead;
  files: LeadFile[];
  uploadLinks: LeadUploadLink[];
  filter: string;
}) {
  const activeLinks = activeUploadLinks(input.uploadLinks);
  const visibleFiles = input.files.filter((file) => file.fileStatus !== "voided");
  if (input.filter === "missing-floor-plan") return !filesForCategory(input.files, "floor_plan").length;
  if (input.filter === "missing-site-photos") return !filesForCategory(input.files, "site_photos").length;
  if (input.filter === "files-received") return visibleFiles.length > 0;
  if (input.filter === "needs-review") return visibleFiles.some((file) => ["received", "needs_clarification"].includes(file.fileStatus));
  if (input.filter === "reviewed") return visibleFiles.some((file) => file.fileStatus === "reviewed");
  if (input.filter === "upload-link-active") return activeLinks.length > 0;
  return true;
}

export default async function ClientFilesPage({
  searchParams: searchParamsPromise
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const filter = searchParams?.filter || "all";
  const leads = await listLeads();
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const files = (await listAllLeadFiles()).filter((file) => visibleLeadIds.has(file.leadId));
  const uploadLinksByLead = new Map<string, LeadUploadLink[]>(
    await Promise.all(leads.map(async (lead) => [lead.id, await listLeadUploadLinks(lead.id)] as const))
  );
  const filesByLead = new Map<string, LeadFile[]>();
  for (const file of files) {
    const current = filesByLead.get(file.leadId) ?? [];
    current.push(file);
    filesByLead.set(file.leadId, current);
  }
  const visibleLeads = leads.filter((lead) => shouldShowLead({
    lead,
    files: filesByLead.get(lead.id) ?? [],
    uploadLinks: uploadLinksByLead.get(lead.id) ?? [],
    filter
  }));
  const totalActiveLinks = [...uploadLinksByLead.values()].flatMap(activeUploadLinks).length;
  const totalReceived = files.filter((file) => file.fileStatus !== "voided").length;
  const needsReview = files.filter((file) => ["received", "needs_clarification"].includes(file.fileStatus)).length;

  return (
    <>
      <PageHeader title="Client Files" eyebrow="Real client storage">
        <Link href="/leads" className="rounded-md border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-muted hover:text-command-text">
          Open Leads
        </Link>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-command-muted">Files received</p>
          <p className="mt-2 text-3xl font-semibold text-command-text">{totalReceived}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-command-muted">Needs review</p>
          <p className="mt-2 text-3xl font-semibold text-command-amber">{needsReview}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-command-muted">Active upload links</p>
          <p className="mt-2 text-3xl font-semibold text-command-cyan">{totalActiveLinks}</p>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <Link
              key={item.key}
              href={item.key === "all" ? "/client-files" : `/client-files?filter=${item.key}`}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                filter === item.key
                  ? "border-command-cyan/70 bg-command-cyan/10 text-command-text"
                  : "border-command-line bg-command-bg/60 text-command-muted hover:text-command-text"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-5 space-y-4">
        {visibleLeads.length ? visibleLeads.map((lead) => {
          const leadFiles = filesByLead.get(lead.id) ?? [];
          const activeLinks = activeUploadLinks(uploadLinksByLead.get(lead.id) ?? []);
          const otherCount = filesForCategory(leadFiles, "other_documents").length;
          return (
            <article key={lead.id} className="rounded-2xl border border-command-line bg-command-card p-5 shadow-premium">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-command-text">{formatLeadDisplayName(lead)}</h2>
                    <StatusBadge label={lead.status} />
                    {activeLinks.length ? <StatusBadge label="Upload link active" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-command-muted">{lead.phone} | {lead.source} | {lead.propertyType || "Property type not collected"}</p>
                </div>
                <Link href={`/leads/${lead.id}`} className="rounded-md border border-command-gold bg-command-gold px-3 py-2 text-sm font-semibold text-black">
                  Open Lead Files
                </Link>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {LEAD_FILE_CATEGORIES.filter((category) => category !== "other_documents").map((category) => {
                  const status = categoryStatus(leadFiles, category);
                  return (
                    <div key={category} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-command-text">{categoryLabels[category]}</p>
                        <StatusBadge label={status.label} />
                      </div>
                      <p className="mt-2 text-sm text-command-muted">
                        {status.count ? `${status.count} file${status.count === 1 ? "" : "s"}` : `${categoryLabels[category]} missing.`}
                      </p>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-command-text">{categoryLabels.other_documents}</p>
                    <StatusBadge label={otherCount ? "Received" : "Missing"} />
                  </div>
                  <p className="mt-2 text-sm text-command-muted">{otherCount ? `${otherCount} file${otherCount === 1 ? "" : "s"}` : "No other documents received yet."}</p>
                </div>
              </div>
              {leadFiles.filter((file) => file.fileStatus !== "voided").length ? (
                <div className="mt-5 overflow-hidden rounded-xl border border-command-line">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-command-bg text-command-muted">
                      <tr>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-command-line">
                      {leadFiles.filter((file) => file.fileStatus !== "voided").slice(0, 6).map((file) => (
                        <tr key={file.id} className="bg-command-panel2">
                          <td className="px-4 py-3 text-command-text">{file.originalFileName || "Client file"}</td>
                          <td className="px-4 py-3 text-command-muted">{categoryLabels[file.fileCategory] ?? humanizeLabel(file.fileCategory)}</td>
                          <td className="px-4 py-3 text-command-muted">{humanizeLabel(file.source)}</td>
                          <td className="px-4 py-3"><StatusBadge label={humanizeLabel(file.fileStatus)} /></td>
                          <td className="px-4 py-3 text-command-muted">{file.uploadedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm text-command-muted">
                  No files received yet. Create an upload link from the lead detail page or ask the client to send files by WhatsApp.
                </p>
              )}
            </article>
          );
        }) : (
          <div className="rounded-2xl border border-command-line bg-command-card p-6 text-command-muted shadow-premium">
            No leads match this file filter yet.
          </div>
        )}
      </section>
    </>
  );
}
