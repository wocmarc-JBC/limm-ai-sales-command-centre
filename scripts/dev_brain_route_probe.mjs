const baseURL = process.env.DEV_BRAIN_BASE_URL ?? "http://localhost:3000";

const routes = [
  "/",
  "/login",
  "/leads",
  "/leads/lead-001",
  "/appointments",
  "/appointment-settings",
  "/approvals",
  "/followups",
  "/quotation-readiness",
  "/client-files",
  "/reports",
  "/settings",
  "/audit-log",
  "/review-chatgpt-ui"
];

const results = [];
for (const route of routes) {
  try {
    const response = await fetch(`${baseURL}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(Number(process.env.DEV_BRAIN_ROUTE_TIMEOUT_MS ?? 12000))
    });
    const html = await response.text();
    results.push({
      route,
      status: response.status,
      ok: response.status < 500,
      hasServerError: /Unhandled Runtime Error|Application error|Internal Server Error|NEXT_/i.test(html),
      hasUnsafeCopy: /free consultation|quote range|rough estimate|price estimate|estimated price/i.test(html),
      loginRequired: />\s*Login required\s*</i.test(html),
      logoutVisible: />\s*Logout\s*</i.test(html),
      reviewMode: /Mock UI Review Mode/i.test(html)
    });
  } catch (error) {
    results.push({
      route,
      status: "FETCH_ERROR",
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log(JSON.stringify({ baseURL, results }, null, 2));

if (results.some((result) => !result.ok || result.hasServerError || result.hasUnsafeCopy)) {
  process.exit(1);
}
