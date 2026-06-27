import { listAllLeadFiles } from "@/lib/data/lead-files-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import {
  buildCommandCoreLeadSummary,
  buildFollowUpProtectionSummary,
  buildQuotationReadinessGate,
  phase3SummarySort,
  type CommandCoreLeadSummary,
  type FollowUpProtectionSummary,
  type QuotationReadinessSummary
} from "@/lib/phase3-read-models";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import type { Lead, LeadFile, LeadMessage } from "@/lib/types";

type SummaryBundle = {
  leads: Lead[];
  filesByLead: Map<string, LeadFile[]>;
  messagesByLead: Map<string, LeadMessage[]>;
};

type SummaryOptions = {
  includeTestDemo?: boolean;
};

async function loadLightweightLeadSummaryBundle(messageLimit = 8, options: SummaryOptions = {}): Promise<SummaryBundle> {
  const [rawLeads, allFiles] = await Promise.all([
    listLeads({ includeTest: options.includeTestDemo }),
    listAllLeadFiles()
  ]);
  const messagesByLead = await listLatestLeadMessagesForInbox(rawLeads.map((lead) => lead.id), messageLimit);
  const filesByLead = new Map<string, LeadFile[]>();
  for (const file of allFiles) {
    const current = filesByLead.get(file.leadId) ?? [];
    current.push(file);
    filesByLead.set(file.leadId, current);
  }
  const leads = rawLeads.filter((lead) => isActiveProductionLeadForDailyScreens(
    lead,
    messagesByLead.get(lead.id) ?? []
  ));
  return { leads, filesByLead, messagesByLead };
}

export async function listCommandCoreLeadSummaries(limit = 50, options: SummaryOptions = {}): Promise<CommandCoreLeadSummary[]> {
  const { leads, filesByLead, messagesByLead } = await loadLightweightLeadSummaryBundle(8, options);
  return leads
    .map((lead) => buildCommandCoreLeadSummary(
      lead,
      messagesByLead.get(lead.id) ?? [],
      filesByLead.get(lead.id) ?? []
    ))
    .sort(phase3SummarySort)
    .slice(0, limit);
}

export async function listFollowUpProtectionSummaries(limit = 80, options: SummaryOptions = {}): Promise<FollowUpProtectionSummary[]> {
  const { leads, filesByLead, messagesByLead } = await loadLightweightLeadSummaryBundle(8, options);
  return leads
    .map((lead) => buildFollowUpProtectionSummary(
      lead,
      messagesByLead.get(lead.id) ?? [],
      filesByLead.get(lead.id) ?? []
    ))
    .filter((item) => item.status !== "Closed / not active")
    .sort((a, b) => {
      const rank = (item: FollowUpProtectionSummary) =>
        item.status === "Failed send unresolved" ? 0 :
          item.status === "Needs Marcus reply" ? 1 :
            item.status === "Overdue follow-up" ? 2 :
              item.status === "Follow-up due" ? 3 :
                item.status === "High-intent idle" ? 4 :
                  item.status === "Waiting for client" ? 5 :
                    6;
      const priority = rank(a) - rank(b);
      if (priority !== 0) return priority;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    })
    .slice(0, limit);
}

export async function listQuotationReadinessSummaries(limit = 80, options: SummaryOptions = {}): Promise<QuotationReadinessSummary[]> {
  const { leads, filesByLead, messagesByLead } = await loadLightweightLeadSummaryBundle(8, options);
  return leads
    .map((lead) => buildQuotationReadinessGate(
      lead,
      messagesByLead.get(lead.id) ?? [],
      filesByLead.get(lead.id) ?? []
    ))
    .sort((a, b) => {
      const rank = (item: QuotationReadinessSummary) =>
        item.readinessStatus === "Ready for Quotation Review" ? 0 :
          item.readinessStatus === "Boss Review Required" ? 1 :
            item.readinessStatus === "Files Needed" ? 2 :
              item.readinessStatus === "Location Needed" ? 3 :
                item.readinessStatus === "Site Review Needed" ? 4 :
                  5;
      const priority = rank(a) - rank(b);
      if (priority !== 0) return priority;
      return b.readinessScore - a.readinessScore;
    })
    .slice(0, limit);
}
