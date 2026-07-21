import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const reporter = read("components/WebVitalsReporter.tsx");
const deferredReporter = read("components/InboxWebVitals.tsx");
const layout = read("app/layout.tsx");
const inbox = read("app/inbox/page.tsx");
const endpoint = read("app/api/analytics/events/route.ts");
const health = read("app/api/whatsapp/health/route.ts");
const visualSpec = read("tests/e2e/inbox-visual-baseline.spec.ts");
const workflow = read(".github/workflows/release-gate.yml");

for (const metric of ["LCP", "INP", "CLS"]) {
  assert.ok(reporter.includes(`"${metric}"`), `${metric} must be captured by the operator Web Vitals reporter.`);
}
assert.ok(reporter.includes("useReportWebVitals"), "Next.js Web Vitals reporting must be active.");
assert.ok(reporter.includes("window.location.pathname"), "Performance evidence must retain route attribution without query-string data.");
assert.ok(reporter.includes("deviceClass()"), "Performance evidence must distinguish mobile, tablet, and desktop.");
assert.ok(reporter.includes('eventName: "web_vital"'), "Core Web Vitals must use the authenticated operator analytics channel.");
assert.ok(inbox.includes("<InboxWebVitals />"), "The operator inbox must mount its route-specific Web Vitals reporter.");
assert.ok(deferredReporter.includes("dynamic("), "Inbox Web Vitals must load outside the initial route bundle.");
assert.ok(deferredReporter.includes("ssr: false"), "The deferred browser metrics collector must not run during server rendering.");
assert.ok(!layout.includes("<WebVitalsReporter />"), "Inbox measurements must not add route-specific analytics to every app page.");
assert.ok(layout.includes("<SpeedInsights />"), "Vercel Speed Insights must remain enabled in production.");
assert.ok(endpoint.includes('"web_vital"'), "The analytics endpoint must explicitly allow Core Web Vitals.");
for (const marker of [
  "operatorCoreWebVitalsAvailable: true",
  "operatorLcpGoodThresholdMs: 2500",
  "operatorInpGoodThresholdMs: 200",
  "operatorClsGoodThreshold: 0.1",
  "operatorResponsiveVisualRegressionAvailable: true"
]) {
  assert.ok(health.includes(marker), `Health proof is missing ${marker}.`);
}
for (const viewport of ["320", "390", "900", "1440"]) {
  assert.ok(visualSpec.includes(`width: ${viewport}`), `Visual evidence must include the ${viewport}px viewport.`);
}
assert.ok(workflow.includes("inbox-visual-baseline"), "Release Gate must retain responsive inbox visual evidence.");

console.log("PASS: operator Core Web Vitals, thresholds, and responsive visual evidence are release-gated.");
