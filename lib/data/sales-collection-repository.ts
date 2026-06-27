import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { listLeads } from "./leads-repository";
import { mapMonthlyTargetRow, mapPaymentRow, mapProjectRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import {
  filterPaymentsForProductionVisibility,
  filterProjectsForProductionVisibility,
  type ProductionVisibilityOptions
} from "@/lib/production-visibility";
import { buildSalesCollectionSummary, currentMonthKey, defaultMonthlyTarget } from "@/lib/sales-collection";
import type { Lead, MonthlySalesTarget, PaymentRecord, ProjectAccount } from "@/lib/types";

function auditPayload<T extends object>(value: T) {
  return value as unknown as Record<string, unknown>;
}

function targetToRow(target: MonthlySalesTarget) {
  return {
    id: target.id,
    target_month: target.targetMonth,
    monthly_sales_target: target.monthlySalesTarget,
    monthly_confirmed_jobs_target: target.monthlyConfirmedJobsTarget,
    monthly_site_visit_target: target.monthlySiteVisitTarget,
    monthly_quotation_target: target.monthlyQuotationTarget,
    monthly_landed_lead_target: target.monthlyLandedLeadTarget,
    monthly_commercial_lead_target: target.monthlyCommercialLeadTarget,
    monthly_collection_target: target.monthlyCollectionTarget,
    notes: target.notes,
    updated_at: new Date().toISOString()
  };
}

export async function listProjectAccounts(options: ProductionVisibilityOptions = {}) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("project_accounts").select("*").order("updated_at", { ascending: false });
    if (!error && data) return filterProjectsForProductionVisibility(data.map(mapProjectRow), options);
  }
  return filterProjectsForProductionVisibility(mockClone(getMockStore().projectAccounts), options);
}

export async function listPaymentRecords(options: ProductionVisibilityOptions = {}) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("payment_records").select("*").order("created_at", { ascending: false });
    if (!error && data) return filterPaymentsForProductionVisibility(data.map(mapPaymentRow), options);
  }
  return filterPaymentsForProductionVisibility(mockClone(getMockStore().paymentRecords), options);
}

export async function getMonthlySalesTarget(month = currentMonthKey()) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!.from("monthly_targets").select("*").eq("target_month", month).maybeSingle();
    if (!error && data) return mapMonthlyTargetRow(data);
  }

  const store = getMockStore();
  const saved = store.monthlyTargets.find((target) => target.targetMonth === month) || store.settings[`monthly_target_${month}`] as MonthlySalesTarget | undefined;
  return saved ? mockClone(saved) : defaultMonthlyTarget(month);
}

export async function saveMonthlySalesTarget(target: MonthlySalesTarget, actorName = "Marcus") {
  const before = await getMonthlySalesTarget(target.targetMonth);
  const after = { ...target, updatedAt: new Date().toISOString() };

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("monthly_targets")
      .upsert(targetToRow(after), { onConflict: "target_month" })
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapMonthlyTargetRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "sales_collection_target_changed",
        entityType: "monthly_targets",
        entityId: saved.id,
        summary: "Monthly sales and collection targets updated.",
        beforeData: auditPayload(before),
        afterData: auditPayload(saved),
        metadata: { moneyChangeAudit: true, nonGst: true }
      });
      return saved;
    }
  }

  const store = getMockStore();
  store.settings[`monthly_target_${target.targetMonth}`] = after;
  const existingTargetIndex = store.monthlyTargets.findIndex((item) => item.targetMonth === target.targetMonth);
  if (existingTargetIndex >= 0) store.monthlyTargets[existingTargetIndex] = after;
  else store.monthlyTargets.push(after);
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "sales_collection_target_changed",
    entityType: "monthly_targets",
    entityId: after.id,
    summary: "Monthly sales and collection targets updated.",
    beforeData: auditPayload(before),
    afterData: auditPayload(after),
    metadata: { moneyChangeAudit: true, nonGst: true }
  });
  return mockClone(after);
}

export async function createProjectFromWonLead(lead: Lead, actorName = "Marcus") {
  if (lead.projectId) return null;
  const project: ProjectAccount = {
    id: `project-${lead.id}`,
    leadId: lead.id,
    clientName: lead.clientName,
    phone: lead.phone,
    propertyType: lead.propertyType,
    scopeSummary: lead.scopeSummary,
    quotedAmount: lead.quotedAmount ?? 0,
    confirmedValue: lead.confirmedValue ?? 0,
    notes: lead.stageNotes ?? "",
    status: "Active",
    sourceLeadId: lead.id,
    propertyArea: lead.propertyArea ?? "",
    postalCode: lead.postalCode ?? "",
    projectAddress: lead.projectAddress ?? "",
    planningRegion: lead.planningRegion ?? "",
    planningArea: lead.planningArea ?? "",
    mapLat: lead.mapLat ?? null,
    mapLng: lead.mapLng ?? null,
    locationConfidence: lead.locationConfidence ?? "unknown",
    locationSource: lead.locationSource ?? "unknown",
    locationNotes: lead.locationNotes ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("project_accounts")
      .upsert({
        id: project.id,
        lead_id: project.leadId,
        source_lead_id: project.sourceLeadId,
        client_name: project.clientName,
        phone: project.phone,
        property_type: project.propertyType,
        scope_summary: project.scopeSummary,
        quoted_amount: project.quotedAmount,
        confirmed_value: project.confirmedValue,
        notes: project.notes,
        status: project.status,
        property_area: project.propertyArea,
        postal_code: project.postalCode,
        project_address: project.projectAddress,
        planning_region: project.planningRegion,
        planning_area: project.planningArea,
        map_lat: project.mapLat,
        map_lng: project.mapLng,
        location_confidence: project.locationConfidence,
        location_source: project.locationSource,
        location_notes: project.locationNotes
      }, { onConflict: "source_lead_id" })
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapProjectRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "project_created_from_lead",
        entityType: "project_account",
        entityId: saved.id,
        summary: "Won lead converted into project/account record.",
        beforeData: null,
        afterData: auditPayload(saved),
        metadata: { sourceLeadId: lead.id, nonGst: true }
      });
      return saved;
    }
  }

  const store = getMockStore();
  const existingProjectIndex = store.projectAccounts.findIndex((item) => item.sourceLeadId === lead.id);
  if (existingProjectIndex >= 0) store.projectAccounts[existingProjectIndex] = project;
  else store.projectAccounts.push(project);
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "project_created_from_lead",
    entityType: "project_account",
    entityId: project.id,
    summary: "Won lead converted into project/account record.",
    beforeData: null,
    afterData: auditPayload(project),
    metadata: { sourceLeadId: lead.id, nonGst: true }
  });
  return project;
}

export async function addPaymentRecord(payment: PaymentRecord, actorName = "Marcus") {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("payment_records")
      .insert({
        project_id: payment.projectId,
        lead_id: payment.leadId,
        payment_type: payment.paymentType,
        amount: payment.amount,
        due_date: payment.dueDate,
        received_date: payment.receivedDate,
        status: payment.status,
        notes: payment.notes
      })
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapPaymentRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "payment_added",
        entityType: "payment_record",
        entityId: saved.id,
        summary: "Manual payment record added.",
        beforeData: null,
        afterData: auditPayload(saved),
        metadata: { moneyChangeAudit: true, nonGst: true }
      });
      return saved;
    }
  }
  const store = getMockStore();
  store.paymentRecords.push(payment);
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "payment_added",
    entityType: "payment_record",
    entityId: payment.id,
    summary: "Manual payment record added.",
    beforeData: null,
    afterData: auditPayload(payment),
    metadata: { moneyChangeAudit: true, nonGst: true }
  });
  return payment;
}

export async function voidPaymentRecord(payment: PaymentRecord, reason: string, actorName = "Marcus") {
  const after = { ...payment, voidedAt: new Date().toISOString(), voidedBy: actorName, voidReason: reason };
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("payment_records")
      .update({ voided_at: after.voidedAt, voided_by: actorName, void_reason: reason })
      .eq("id", payment.id)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapPaymentRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "payment_voided",
        entityType: "payment_record",
        entityId: saved.id,
        summary: "Payment record voided with reason. It was not deleted.",
        beforeData: auditPayload(payment),
        afterData: auditPayload(saved),
        metadata: { moneyChangeAudit: true, voidInsteadOfDelete: true, reason }
      });
      return saved;
    }
  }
  const store = getMockStore();
  const existingPaymentIndex = store.paymentRecords.findIndex((item) => item.id === payment.id);
  if (existingPaymentIndex >= 0) store.paymentRecords[existingPaymentIndex] = after;
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "payment_voided",
    entityType: "payment_record",
    entityId: after.id,
    summary: "Payment record voided with reason. It was not deleted.",
    beforeData: auditPayload(payment),
    afterData: auditPayload(after),
    metadata: { moneyChangeAudit: true, voidInsteadOfDelete: true, reason }
  });
  return after;
}

export async function getSalesCollectionData(month = currentMonthKey(), options: ProductionVisibilityOptions = {}) {
  const [leads, rawProjects, rawPayments, target] = await Promise.all([
    listLeads({ includeTest: options.includeTestDemo }),
    listProjectAccounts({ includeTestDemo: options.includeTestDemo }),
    listPaymentRecords({ includeTestDemo: options.includeTestDemo }),
    getMonthlySalesTarget(month)
  ]);
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const projects = filterProjectsForProductionVisibility(rawProjects, { ...options, visibleLeadIds });
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const payments = filterPaymentsForProductionVisibility(rawPayments, { ...options, visibleLeadIds, visibleProjectIds });
  return {
    leads,
    projects,
    payments,
    target,
    summary: buildSalesCollectionSummary(leads, projects, payments, target)
  };
}
