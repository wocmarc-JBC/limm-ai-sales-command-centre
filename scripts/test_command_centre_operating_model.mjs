import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const shell = read("components/ShellChrome.tsx");
const login = read("components/auth/LoginForm.tsx");
const home = read("app/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const settings = read("app/settings/page.tsx");
const appointments = read("app/appointments/page.tsx");
const appointmentActions = read("components/AppointmentSlotActions.tsx");
const leadCard = read("components/LeadCard.tsx");
const commandCore = read("app/command-core/page.tsx");
const buttonAudit = read("scripts/audit_command_centre_buttons.mjs");

assert(/redirect\("\/command-core"\)/.test(home), "/ must redirect to /command-core.");
assert(/redirect\("\/command-core"\)/.test(dashboard), "/dashboard must redirect to /command-core.");
assert(/router\.push\("\/command-core"\)/.test(login), "Login must land on /command-core.");

assert(/label: "Command Core"/.test(shell), "Sidebar must contain Command Core.");
assert(/href: "\/inbox", label: "WhatsApp Inbox"/.test(shell), "Sidebar must contain WhatsApp Inbox.");
assert(!/Command Core Beta/.test(shell), "Command Core Beta label must be removed.");
assert(!/href: "\/dashboard"/.test(shell), "Old Dashboard route must not be a primary sidebar item.");
assert(!/href: "\/", label: "Dashboard"/.test(shell), "Old root Dashboard must not be a primary sidebar item.");
assert(!/AI Lead Inbox/.test(shell), "AI Lead Inbox must not remain as a primary sidebar item.");
assert(!/Mission Queue/.test(shell), "Mission Queue must not be shown in daily sidebar.");

for (const phrase of [
  "Business Settings",
  "Appointment Settings",
  "Targets",
  "Sales & Collection",
  "System Settings",
  "WhatsApp / Bot Settings",
  "Health / Diagnostics",
  "QA Centre",
  "Audit Log",
  "Data & Admin",
  "Client Files",
  "Cleanup",
  "Developer Tools",
  "Archived / Test Leads"
]) {
  assert(settings.includes(phrase), `Settings admin hub missing ${phrase}.`);
}

assert(/Copy Slot Message/.test(appointmentActions), "Appointments must include Copy Slot Message.");
assert(/Offer to Lead/.test(appointmentActions), "Appointments must include Offer to Lead.");
assert(/Reserve Slot/.test(appointmentActions), "Appointments must include Reserve Slot.");
assert(/Block Slot/.test(appointmentActions), "Appointments must include Block Slot.");
assert(/Open Appointment Settings/.test(appointmentActions), "Appointments must include Open Appointment Settings.");
assert(/Appointment message copied/.test(appointmentActions), "Copy Slot Message must show a success message.");
assert(/Select a lead first to offer this appointment slot/.test(appointmentActions), "Offer to Lead needs a disabled reason without lead selection.");
assert(/Reservation storage not enabled yet/.test(appointmentActions), "Reserve Slot must show disabled reason.");
assert(/Blocking slots is not enabled yet/.test(appointmentActions), "Block Slot must show disabled reason.");
assert(/Calendar auto-booking remains off/.test(appointments), "Appointments page must state calendar auto-booking remains off.");

assert(/Open WhatsApp Chat/.test(leadCard), "LeadCard must include Open WhatsApp Chat.");
assert(/\/inbox\?lead=\$\{encodeURIComponent\(lead\.id\)\}/.test(leadCard), "Open WhatsApp Chat must use /inbox?lead=<leadId>.");
assert(/View Lead Details/.test(leadCard), "LeadCard must include View Lead Details.");
assert(!/>[\s\r\n]*Open Lead[\s\r\n]*</.test(leadCard), "Open Lead label must be replaced on lead cards.");
assert(/Open WhatsApp Chat/.test(commandCore), "Command Core must include direct WhatsApp chat actions.");

assert(/likely_noop/.test(buttonAudit), "Button audit must report likely no-op controls.");
assert(/destructive_missing_confirmation/.test(buttonAudit), "Button audit must report destructive buttons without confirmation.");
assert(/disabled_missing_reason/.test(buttonAudit), "Button audit must report disabled controls without reasons.");

console.log("PASS: command centre operating model static test passed.");
