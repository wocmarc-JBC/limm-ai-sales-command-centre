import "server-only";

export type ReliabilityAlertIncident = {
  severity: "warning" | "critical";
  component: string;
  title: string;
  safeSummary: string;
  firstDetectedAt: string;
};

export type ReliabilityAlertResult = {
  sent: boolean;
  status: "sent" | "disabled" | "provider_missing" | "failed";
  providerMessageId: string;
};

function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

export function getReliabilityAlertRuntime() {
  const recipients = (process.env.RELIABILITY_ALERT_EMAIL_TO || process.env.HANDOFF_EMAIL_TO || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    enabled: envFlag("RELIABILITY_ALERT_EMAIL_ENABLED", false),
    providerConfigured: Boolean(process.env.RESEND_API_KEY),
    recipientsConfigured: recipients.length > 0,
    recipients
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function operationsUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    if (!configured) return "https://limm-ai-sales-command-centre.vercel.app/operations";
    const url = new URL(configured.startsWith("http") ? configured : `https://${configured}`);
    if (url.protocol !== "https:") throw new Error("https_required");
    url.pathname = "/operations";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "https://limm-ai-sales-command-centre.vercel.app/operations";
  }
}

export async function sendReliabilityIncidentAlert(
  incidents: ReliabilityAlertIncident[]
): Promise<ReliabilityAlertResult> {
  const runtime = getReliabilityAlertRuntime();
  if (!runtime.enabled) return { sent: false, status: "disabled", providerMessageId: "" };
  if (!runtime.providerConfigured || !runtime.recipientsConfigured) {
    return { sent: false, status: "provider_missing", providerMessageId: "" };
  }
  if (!incidents.length) return { sent: false, status: "disabled", providerMessageId: "" };

  const criticalCount = incidents.filter((incident) => incident.severity === "critical").length;
  const rows = incidents.slice(0, 20).map((incident) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #ddd;font-weight:700">${escapeHtml(incident.severity.toUpperCase())}</td>
      <td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(incident.component)}</td>
      <td style="padding:10px;border-bottom:1px solid #ddd"><strong>${escapeHtml(incident.title)}</strong><br>${escapeHtml(incident.safeSummary)}</td>
    </tr>`).join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.RELIABILITY_ALERT_EMAIL_FROM || process.env.HANDOFF_EMAIL_FROM || "LIMM Reliability <onboarding@resend.dev>",
        to: runtime.recipients,
        subject: `[LIMM ${criticalCount ? "CRITICAL" : "WARNING"}] ${incidents.length} active reliability incident${incidents.length === 1 ? "" : "s"}`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#171717;max-width:760px;margin:auto">
            <h1>Recovery readiness alert</h1>
            <p>The no-send watchdog detected ${incidents.length} condition${incidents.length === 1 ? "" : "s"}. No client message was sent.</p>
            <table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Severity</th><th align="left">Component</th><th align="left">Incident</th></tr></thead><tbody>${rows}</tbody></table>
            <p style="margin-top:22px"><a href="${escapeHtml(operationsUrl())}">Open the recovery control plane</a></p>
          </div>`
      }),
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return { sent: false, status: "failed", providerMessageId: "" };
    const payload = await response.json().catch(() => ({})) as { id?: string };
    return { sent: true, status: "sent", providerMessageId: String(payload.id || "").slice(0, 160) };
  } catch {
    return { sent: false, status: "failed", providerMessageId: "" };
  }
}
