import type {
  Lead,
  ManualQuotationStatus,
  MonthlySalesTarget,
  PaymentRecord,
  PaymentStatus,
  ProjectAccount,
  SalesStage
} from "@/lib/types";
import {
  addSingaporeDays,
  daysBetweenSingaporeDates,
  isDueOnOrBeforeSingaporeDate,
  overdueDaysSingapore,
  singaporeDateKey
} from "@/lib/date-safety";

export const nonGstNote = "LIMM Works Pte Ltd is not GST-registered. No GST charged.";

export const salesStages: SalesStage[] = [
  "New Lead",
  "Qualified",
  "Info Requested",
  "Floor Plan / Scope Received",
  "Initial Project Review",
  "Site Visit Needed",
  "Site Visit Booked",
  "Quotation Needed",
  "Quotation Sent",
  "Follow-Up Due",
  "Negotiation",
  "Won",
  "Lost",
  "Archived"
];

export const manualQuotationStatuses: ManualQuotationStatus[] = [
  "Not Ready",
  "Ready to Quote",
  "Preparing",
  "Sent",
  "Client Reviewing",
  "Revision Requested",
  "Accepted",
  "Rejected",
  "Expired"
];

export const paymentStatuses: PaymentStatus[] = [
  "No Payment Yet",
  "Deposit Requested",
  "Deposit Received",
  "Progress Payment Due",
  "Progress Payment Received",
  "Final Payment Due",
  "Fully Paid",
  "Overdue",
  "Disputed"
];

export const lostReasons = [
  "Too expensive",
  "Client disappeared",
  "Competitor chosen",
  "Wrong scope",
  "Too small job",
  "Price shopper",
  "No floor plan",
  "No appointment",
  "Bad fit",
  "Other"
];

export const wonReasons = [
  "Fast follow-up",
  "Good design fit",
  "Landed expertise",
  "Project photos helped",
  "Referral",
  "Existing client",
  "Good quotation",
  "Other"
];

export function currentMonthKey(date = new Date()) {
  return singaporeDateKey(date).slice(0, 7);
}

export function defaultMonthlyTarget(month = currentMonthKey()): MonthlySalesTarget {
  return {
    id: `target-${month}`,
    targetMonth: month,
    monthlySalesTarget: 0,
    monthlyConfirmedJobsTarget: 0,
    monthlySiteVisitTarget: 0,
    monthlyQuotationTarget: 0,
    monthlyLandedLeadTarget: 0,
    monthlyCommercialLeadTarget: 0,
    monthlyCollectionTarget: 0,
    notes: "",
    updatedAt: new Date().toISOString()
  };
}

export function salesStageForLead(lead: Lead): SalesStage {
  if (lead.salesStage) return lead.salesStage;
  if (lead.deletedAt || lead.archivedAt) return "Archived";
  if (lead.status === "Not Suitable") return "Lost";
  if (lead.status === "Quotation Readiness") return "Quotation Needed";
  if (lead.status === "Follow Up Due") return "Follow-Up Due";
  if (lead.status === "Ready To Book") return "Site Visit Needed";
  if (lead.status === "Appointment Pending") return "Initial Project Review";
  if (lead.status === "Awaiting Client") return "Info Requested";
  if (lead.status === "Waiting Boss Approval") return "Qualified";
  return "New Lead";
}

export function quotationStatusForLead(lead: Lead): ManualQuotationStatus {
  if (lead.quotationStatus) return lead.quotationStatus;
  if (lead.status === "Quotation Readiness") return "Ready to Quote";
  if (lead.quotationReadiness >= 70) return "Ready to Quote";
  return "Not Ready";
}

export function daysLeftInMonth(date = new Date()) {
  const key = singaporeDateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0));
  return Math.max(1, end.getUTCDate() - day + 1);
}

export function money(value = 0) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0
  }).format(Number.isFinite(value) ? value : 0);
}

export function weightedForecastForLead(lead: Lead) {
  const potentialValue = lead.potentialValue ?? 0;
  const probability = Math.max(0, Math.min(100, lead.probabilityPercent ?? 0));
  return Math.round((potentialValue * probability) / 100);
}

export function activePayments(payments: PaymentRecord[]) {
  return payments.filter((payment) => !payment.voidedAt);
}

export function amountCollected(payments: PaymentRecord[]) {
  return activePayments(payments)
    .filter((payment) => payment.receivedDate || /received|fully paid/i.test(payment.status))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function outstandingForProject(project: ProjectAccount, payments: PaymentRecord[]) {
  return Math.max(0, (project.confirmedValue ?? 0) - amountCollected(payments.filter((payment) => payment.projectId === project.id)));
}

export function overdueAmountForProject(project: ProjectAccount, payments: PaymentRecord[], today = new Date()) {
  return activePayments(payments)
    .filter((payment) => payment.projectId === project.id)
    .filter((payment) => overdueDaysSingapore(payment.dueDate, today) > 0)
    .filter((payment) => !payment.receivedDate && payment.status !== "Fully Paid" && payment.status !== "Disputed")
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function buildSalesCollectionSummary(leads: Lead[], projects: ProjectAccount[], payments: PaymentRecord[], target: MonthlySalesTarget, today = new Date()) {
  const confirmedSales = projects.reduce((sum, project) => sum + (project.confirmedValue ?? 0), 0);
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.potentialValue ?? 0), 0);
  const weightedForecast = leads.reduce((sum, lead) => sum + weightedForecastForLead(lead), 0);
  const collected = amountCollected(payments);
  const outstanding = projects.reduce((sum, project) => sum + outstandingForProject(project, payments), 0);
  const overdue = projects.reduce((sum, project) => sum + overdueAmountForProject(project, payments, today), 0);
  const daysLeft = daysLeftInMonth(today);

  return {
    targetAmount: target.monthlySalesTarget,
    confirmedSales,
    pipelineValue,
    weightedForecast,
    remainingToTarget: Math.max(0, target.monthlySalesTarget - confirmedSales),
    neededPerDay: Math.ceil(Math.max(0, target.monthlySalesTarget - confirmedSales) / daysLeft),
    collectionTarget: target.monthlyCollectionTarget,
    currentMonthCollected: collected,
    outstandingAmount: outstanding,
    overdueAmount: overdue,
    remainingCollectionTarget: Math.max(0, target.monthlyCollectionTarget - collected),
    overdueProjectsCount: projects.filter((project) => overdueAmountForProject(project, payments, today) > 0).length,
    daysLeft
  };
}

export function buildQuotationPaymentFollowUps(leads: Lead[], projects: ProjectAccount[], payments: PaymentRecord[], today = new Date()) {
  const reminders: Array<{ title: string; reason: string; href: string; tone: "gold" | "amber" | "red" | "cyan" }> = [];
  for (const lead of leads) {
    const quoteStatus = quotationStatusForLead(lead);
    if (quoteStatus === "Sent" && lead.quoteFollowUpDate && isDueOnOrBeforeSingaporeDate(lead.quoteFollowUpDate, today)) {
      reminders.push({ title: "Quotation follow-up due", reason: `${lead.clientName} has a sent quotation awaiting follow-up.`, href: `/leads/${lead.id}`, tone: "amber" });
    }
    if (!lead.salesNextAction && salesStageForLead(lead) !== "Archived") {
      reminders.push({ title: "Lead has no next action", reason: `${lead.clientName} needs a sales next action.`, href: `/leads/${lead.id}`, tone: "cyan" });
    }
  }
  for (const project of projects) {
    const projectPayments = activePayments(payments).filter((payment) => payment.projectId === project.id);
    if (!projectPayments.length && project.confirmedValue > 0) {
      reminders.push({ title: "Deposit not received", reason: `${project.clientName} is won but has no payment record yet.`, href: "/sales-collection", tone: "amber" });
    }
    for (const payment of projectPayments) {
      if (payment.dueDate && !payment.receivedDate) {
        const overdueDays = overdueDaysSingapore(payment.dueDate, today);
        const dueTomorrow = daysBetweenSingaporeDates(payment.dueDate, today) === 1 || singaporeDateKey(payment.dueDate) === addSingaporeDays(today, 1);
        if (overdueDays > 0) reminders.push({ title: "Payment overdue", reason: `${project.clientName} has overdue ${payment.paymentType} payment.`, href: "/sales-collection", tone: "red" });
        else if (dueTomorrow) reminders.push({ title: "Payment due tomorrow", reason: `${project.clientName} has ${payment.paymentType} payment due tomorrow.`, href: "/sales-collection", tone: "amber" });
      }
    }
  }
  return reminders.slice(0, 12);
}

export function buildBossMonthlyReport(leads: Lead[], projects: ProjectAccount[], payments: PaymentRecord[], target: MonthlySalesTarget) {
  const summary = buildSalesCollectionSummary(leads, projects, payments, target);
  const wonLeads = leads.filter((lead) => salesStageForLead(lead) === "Won");
  const lostLeads = leads.filter((lead) => salesStageForLead(lead) === "Lost");
  const sourceCounts = new Map<string, number>();
  const propertyCounts = new Map<string, number>();
  const lostReasonCounts = new Map<string, number>();
  for (const lead of leads) {
    sourceCounts.set(lead.source || lead.leadSource || "Unknown", (sourceCounts.get(lead.source || lead.leadSource || "Unknown") ?? 0) + 1);
    propertyCounts.set(lead.propertyType || "Unknown", (propertyCounts.get(lead.propertyType || "Unknown") ?? 0) + 1);
    if (salesStageForLead(lead) === "Lost") lostReasonCounts.set(lead.wonLostReason || "Other", (lostReasonCounts.get(lead.wonLostReason || "Other") ?? 0) + 1);
  }
  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No data yet";

  return {
    newLeads: leads.filter((lead) => salesStageForLead(lead) === "New Lead").length,
    qualifiedLeads: leads.filter((lead) => salesStageForLead(lead) === "Qualified").length,
    siteVisitsBooked: leads.filter((lead) => salesStageForLead(lead) === "Site Visit Booked").length,
    quotationsSent: leads.filter((lead) => quotationStatusForLead(lead) === "Sent").length,
    wonJobs: wonLeads.length,
    lostJobs: lostLeads.length,
    confirmedSales: summary.confirmedSales,
    pipelineValue: summary.pipelineValue,
    weightedForecast: summary.weightedForecast,
    collectionsReceived: summary.currentMonthCollected,
    outstandingReceivables: summary.outstandingAmount,
    overduePayments: summary.overdueAmount,
    bestLeadSource: top(sourceCounts),
    bestProjectType: top(propertyCounts),
    commonLostReason: top(lostReasonCounts),
    topFollowUpItems: buildQuotationPaymentFollowUps(leads, projects, payments).slice(0, 5)
  };
}
