import { randomUUID } from "node:crypto";
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
import {
  buildSalesCollectionSummary,
  currentMonthKey,
  defaultMonthlyTarget,
  quotationStatusForLead,
  salesStageForLead
} from "@/lib/sales-collection";
import { qaWorkflowSafetyMetadata } from "@/lib/qa-workflow-test-mode";
import type { Lead, MonthlySalesTarget, PaymentRecord, ProjectAccount, QuotationPackage } from "@/lib/types";

function auditPayload<T extends object>(value: T) {
  return value as unknown as Record<string, unknown>;
}

function leadIsAcceptedOrWon(lead: Lead | undefined) {
  if (!lead) return false;
  return salesStageForLead(lead) === "Won" || quotationStatusForLead(lead) === "Accepted";
}

function projectIsLinkedToAcceptedWonLead(project: ProjectAccount, leadById: Map<string, Lead>) {
  const lead = leadById.get(project.leadId) ?? leadById.get(project.sourceLeadId);
  if (!leadIsAcceptedOrWon(lead)) return false;
  if (project.deletedAt || project.archivedAt || project.isTest) return false;
  if (project.status === "Cancelled") return false;
  return true;
}

function defaultFiftyFortyTenSchedule(confirmedValue: number) {
  const value = Math.max(0, confirmedValue || 0);
  const deposit = Math.round(value * 0.5);
  const progress = Math.round(value * 0.4);
  return [
    { label: "Deposit 50%", amount: deposit },
    { label: "Progress 40%", amount: progress },
    { label: "Final 10%", amount: Math.max(0, value - deposit - progress) }
  ];
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
    isTest: Boolean(lead.isTest),
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
        location_notes: project.locationNotes,
        is_test: project.isTest ?? false,
        created_at: project.createdAt,
        updated_at: project.updatedAt
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
        metadata: { sourceLeadId: lead.id, nonGst: true, isTest: Boolean(saved.isTest) }
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
    metadata: { sourceLeadId: lead.id, nonGst: true, isTest: Boolean(project.isTest) }
  });
  return project;
}

export async function addPaymentRecord(payment: PaymentRecord, actorName = "Marcus") {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("payment_records")
      .insert({
        id: payment.id,
        project_id: payment.projectId,
        lead_id: payment.leadId,
        payment_type: payment.paymentType,
        amount: payment.amount,
        due_date: payment.dueDate,
        received_date: payment.receivedDate,
        status: payment.status,
        notes: payment.notes,
        is_test: payment.isTest ?? false,
        created_at: payment.createdAt,
        updated_at: payment.updatedAt
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
        metadata: { moneyChangeAudit: true, nonGst: true, isTest: Boolean(saved.isTest) }
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
    metadata: { moneyChangeAudit: true, nonGst: true, isTest: Boolean(payment.isTest) }
  });
  return payment;
}

export async function markPaymentRecordReceived(paymentId: string, actorName = "Marcus") {
  const before = (await listPaymentRecords({ includeTestDemo: true })).find((payment) => payment.id === paymentId) ?? null;
  if (!before) return null;
  const now = new Date().toISOString();
  const status = before.paymentType === "deposit"
    ? "Deposit Received"
    : before.paymentType === "progress"
      ? "Progress Payment Received"
      : before.paymentType === "final"
        ? "Fully Paid"
        : "Fully Paid";

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("payment_records")
      .update({ received_date: now, status, updated_at: now })
      .eq("id", paymentId)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapPaymentRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "payment_received_recorded",
        entityType: "payment_record",
        entityId: saved.id,
        summary: `${saved.paymentType} payment marked received manually.`,
        beforeData: auditPayload(before),
        afterData: auditPayload(saved),
        metadata: { moneyChangeAudit: true, manualOnly: true, nonGst: true }
      });
      return saved;
    }
  }

  const store = getMockStore();
  const index = store.paymentRecords.findIndex((payment) => payment.id === paymentId);
  if (index < 0) return null;
  store.paymentRecords[index] = { ...store.paymentRecords[index], receivedDate: now, status, updatedAt: now };
  const after = store.paymentRecords[index];
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "payment_received_recorded",
    entityType: "payment_record",
    entityId: after.id,
    summary: `${after.paymentType} payment marked received manually.`,
    beforeData: auditPayload(before),
    afterData: auditPayload(after),
    metadata: { moneyChangeAudit: true, manualOnly: true, nonGst: true }
  });
  return mockClone(after);
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

export async function restoreVoidedPaymentRecord(paymentId: string, actorName = "Marcus") {
  const before = (await listPaymentRecords({ includeTestDemo: true })).find((payment) => payment.id === paymentId) ?? null;
  if (!before) return null;
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("payment_records")
      .update({ voided_at: null, voided_by: "", void_reason: "", updated_at: now })
      .eq("id", paymentId)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const saved = mapPaymentRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "payment_restored_from_void",
        entityType: "payment_record",
        entityId: saved.id,
        summary: "Payment record restored after data hygiene review.",
        beforeData: auditPayload(before),
        afterData: auditPayload(saved),
        metadata: { restoreInsteadOfHardDelete: true }
      });
      return saved;
    }
  }

  const store = getMockStore();
  const index = store.paymentRecords.findIndex((payment) => payment.id === paymentId);
  if (index < 0) return null;
  store.paymentRecords[index] = { ...store.paymentRecords[index], voidedAt: null, voidedBy: "", voidReason: "", updatedAt: now };
  const after = store.paymentRecords[index];
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "payment_restored_from_void",
    entityType: "payment_record",
    entityId: after.id,
    summary: "Payment record restored after data hygiene review.",
    beforeData: auditPayload(before),
    afterData: auditPayload(after),
    metadata: { restoreInsteadOfHardDelete: true }
  });
  return mockClone(after);
}

export async function createDefaultPaymentScheduleForProject(project: ProjectAccount, lead: Lead, actorName = "Marcus") {
  const existing = (await listPaymentRecords({ includeTestDemo: true })).filter((payment) => payment.projectId === project.id && !payment.voidedAt);
  if (existing.length) return existing;

  const now = new Date().toISOString();
  const dueDates = [
    now,
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  ];
  const types: PaymentRecord["paymentType"][] = ["deposit", "progress", "final"];
  const schedule = defaultFiftyFortyTenSchedule(project.confirmedValue || lead.confirmedValue || lead.quotedAmount || 0);
  const records: PaymentRecord[] = schedule.map((milestone, index) => ({
    id: `payment-${project.id}-${types[index]}-${randomUUID()}`,
    projectId: project.id,
    leadId: lead.id,
    paymentType: types[index],
    amount: milestone.amount,
    dueDate: dueDates[index],
    receivedDate: null,
    status: index === 0 ? "Deposit Requested" : index === 1 ? "Progress Payment Due" : "Final Payment Due",
    notes: `${lead.division === "Carpentry Works" ? "JBC default 50/40/10" : "LIMM Works editable non-GST"} milestone: ${milestone.label}.`,
    isTest: Boolean(project.isTest || lead.isTest),
    createdAt: now,
    updatedAt: now
  }));

  const saved: PaymentRecord[] = [];
  for (const record of records) {
    const payment = await addPaymentRecord(record, actorName);
    if (payment) saved.push(payment);
  }
  return saved;
}

export async function createQaTestProjectForQuotation(lead: Lead, quotation: QuotationPackage, actorName = "Marcus") {
  const existing = (await listProjectAccounts({ includeTestDemo: true })).find((project) => project.sourceLeadId === lead.id);
  const now = new Date().toISOString();
  const project: ProjectAccount = {
    id: existing?.id ?? `qa-project-${lead.id}`,
    leadId: lead.id,
    clientName: lead.clientName,
    phone: lead.phone,
    propertyType: lead.propertyType,
    scopeSummary: quotation.scopeSummary || lead.scopeSummary,
    quotedAmount: quotation.quotationAmount,
    confirmedValue: quotation.quotationAmount,
    notes: "QA TEST RECORD - NOT REAL CLIENT. Created for downstream workflow testing only.",
    status: "Deposit Pending",
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
    isTest: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
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
        location_notes: project.locationNotes,
        is_test: true,
        created_at: project.createdAt,
        updated_at: project.updatedAt
      }, { onConflict: "source_lead_id" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`QA test project creation failed: ${error.message}`);
    if (data) {
      const saved = mapProjectRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName,
        action: "qa_delivery_gate_created",
        entityType: "project_account",
        entityId: saved.id,
        summary: "QA test delivery gate created. This is not a real client project.",
        beforeData: existing ? auditPayload(existing) : null,
        afterData: auditPayload(saved),
        metadata: { quotationId: quotation.id, ...qaWorkflowSafetyMetadata }
      });
      return saved;
    }
  }

  const store = getMockStore();
  const index = store.projectAccounts.findIndex((item) => item.sourceLeadId === lead.id);
  if (index >= 0) store.projectAccounts[index] = project;
  else store.projectAccounts.push(project);
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "qa_delivery_gate_created",
    entityType: "project_account",
    entityId: project.id,
    summary: "QA test delivery gate created. This is not a real client project.",
    beforeData: existing ? auditPayload(existing) : null,
    afterData: auditPayload(project),
    metadata: { quotationId: quotation.id, ...qaWorkflowSafetyMetadata }
  });
  return mockClone(project);
}

export async function createQaTestCollectionSchedule(project: ProjectAccount, lead: Lead, actorName = "Marcus") {
  const payments = await createDefaultPaymentScheduleForProject({ ...project, isTest: true }, { ...lead, isTest: true }, actorName);
  await createAuditLog({
    actorType: "boss",
    actorName,
    action: "qa_collection_schedule_created",
    entityType: "project_account",
    entityId: project.id,
    summary: "QA test collection schedule created. Payment records are test-marked and hidden by default.",
    beforeData: null,
    afterData: { projectId: project.id, paymentCount: payments.length },
    metadata: { paymentIds: payments.map((payment) => payment.id), ...qaWorkflowSafetyMetadata }
  });
  return payments;
}

export async function getSalesCollectionData(month = currentMonthKey(), options: ProductionVisibilityOptions = {}) {
  const [leads, rawProjects, rawPayments, target] = await Promise.all([
    listLeads({ includeTest: options.includeTestDemo }),
    listProjectAccounts({ includeTestDemo: true }),
    listPaymentRecords({ includeTestDemo: true }),
    getMonthlySalesTarget(month)
  ]);
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const projects = filterProjectsForProductionVisibility(rawProjects, { ...options, visibleLeadIds })
    .filter((project) => options.includeTestDemo || projectIsLinkedToAcceptedWonLead(project, leadById));
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const payments = filterPaymentsForProductionVisibility(rawPayments, { ...options, visibleLeadIds, visibleProjectIds })
    .filter((payment) => options.includeTestDemo || (
      payment.amount > 0 &&
      !payment.voidedAt &&
      payment.status !== "Disputed" &&
      visibleProjectIds.has(payment.projectId) &&
      visibleLeadIds.has(payment.leadId)
    ));
  return {
    leads,
    projects,
    payments,
    target,
    summary: buildSalesCollectionSummary(leads, projects, payments, target)
  };
}
