import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapQuotationRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import type { QuotationReadinessRecord, QuotationReadinessRow } from "@/lib/types";

export async function listQuotationReadinessRows(): Promise<QuotationReadinessRow[]> {
  const store = getMockStore();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_readiness")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) {
      const records = data.map(mapQuotationRow);
      const { listLeads } = await import("./leads-repository");
      const leads = await listLeads();
      return records
        .map((readiness) => ({ readiness, lead: leads.find((lead) => lead.id === readiness.leadId) }))
        .filter((row): row is QuotationReadinessRow => Boolean(row.lead));
    }
  }

  return mockClone(
    store.quotationReadiness
      .map((readiness) => ({ readiness, lead: store.leads.find((lead) => lead.id === readiness.leadId) }))
      .filter((row): row is QuotationReadinessRow => Boolean(row.lead))
  );
}

export async function getQuotationReadinessForLead(leadId: string) {
  const rows = await listQuotationReadinessRows();
  return rows.find((row) => row.lead.id === leadId)?.readiness ?? null;
}

export async function updateQuotationReadinessStatus(
  id: string,
  status: QuotationReadinessRecord["status"],
  checklist?: QuotationReadinessRecord["quotePreparationChecklist"]
) {
  const rows = await listQuotationReadinessRows();
  const before = rows.find((row) => row.readiness.id === id)?.readiness ?? null;
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("quotation_readiness")
      .update({ status, quote_preparation_checklist: checklist, updated_at: now })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const after = mapQuotationRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "quotation_readiness_updated",
        entityType: "quotation_readiness",
        entityId: id,
        summary: "Quotation readiness updated without generating prices.",
        beforeData: before ? { status: before.status } : null,
        afterData: { status: after.status }
      });
      return after;
    }
  }

  const store = getMockStore();
  const index = store.quotationReadiness.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.quotationReadiness[index] = {
    ...store.quotationReadiness[index],
    status,
    quotePreparationChecklist: checklist ?? store.quotationReadiness[index].quotePreparationChecklist,
    updatedAt: now
  };
  const after = store.quotationReadiness[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "quotation_readiness_updated",
    entityType: "quotation_readiness",
    entityId: id,
    summary: "Quotation readiness updated without generating prices.",
    beforeData: before ? { status: before.status } : null,
    afterData: { status: after.status }
  });
  return mockClone(after);
}
