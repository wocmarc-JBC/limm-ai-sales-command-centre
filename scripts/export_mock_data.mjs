import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = path.join(root, "exports");
fs.mkdirSync(exportDir, { recursive: true });

const mockLeads = [
  { id: "lead-001", clientName: "Demo Landed Lead", phone: "+65 DEMO 0001", source: "WhatsApp", division: "LIMM Works", propertyType: "Old inter-terrace", serviceType: "Landed A&A", leadScore: 94, status: "Waiting Boss Approval" },
  { id: "lead-002", clientName: "Demo Condo Lead", phone: "+65 DEMO 0002", source: "Website", division: "LIMM Works", propertyType: "Condo", serviceType: "Full renovation", leadScore: 76, status: "Ready To Book" },
  { id: "lead-003", clientName: "Demo Commercial Lead", phone: "+65 DEMO 0003", source: "Referral", division: "LIMM Works", propertyType: "Commercial clinic", serviceType: "Commercial renovation", leadScore: 88, status: "Quotation Readiness" }
];

const followUps = [
  { id: "follow-001", leadId: "lead-004", clientName: "Demo Follow-Up 1", dueAt: "2026-05-28T17:00:00+08:00", followupType: "awaiting_photos", status: "Due" }
];

const auditLogs = [
  { id: "audit-001", actorName: "System", action: "decision_created", entityType: "lead", entityId: "lead-001", summary: "Demo audit export row.", createdAt: "2026-05-28T11:18:00+08:00" }
];

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(fileName, rows, columns) {
  const lines = [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ];
  fs.writeFileSync(path.join(exportDir, fileName), lines.join("\n"), "utf8");
}

writeCsv("mock_leads.csv", mockLeads, ["id", "clientName", "phone", "source", "division", "propertyType", "serviceType", "leadScore", "status"]);
writeCsv("mock_followups.csv", followUps, ["id", "leadId", "clientName", "dueAt", "followupType", "status"]);
writeCsv("mock_audit_logs.csv", auditLogs, ["id", "actorName", "action", "entityType", "entityId", "summary", "createdAt"]);

console.log(`Exported mock CSV files to ${exportDir}`);
