import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const reviewRoute = read("app/review-chatgpt-ui/page.tsx");
const shellChrome = read("components/ShellChrome.tsx");
const authGate = read("components/auth/AuthGate.tsx");
const reviewRouteFlag = read("lib/review-route.ts");

assert(reviewRouteFlag.includes("NEXT_PUBLIC_ENABLE_REVIEW_ROUTE"), "Review route flag helper missing env flag.");
assert(reviewRoute.includes("isReviewRouteEnabled") && reviewRoute.includes("notFound()"), "Review route must be disabled unless the review flag is enabled.");
assert(shellChrome.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "Review shell must only activate behind the review flag.");
assert(authGate.includes("isReviewRouteEnabled() && pathname === \"/review-chatgpt-ui\""), "AuthGate must only exempt review route when the review flag is enabled.");
assert(shellChrome.includes("Mock UI Review Mode"), "Review shell must show Mock UI Review Mode.");
assert(shellChrome.includes("No Login Required"), "Review shell must show No Login Required.");
assert(shellChrome.includes("No Live Actions"), "Review shell must show No Live Actions.");
assert(shellChrome.includes("Demo Data Only"), "Review shell must show Demo Data Only.");
assert(!reviewRoute.includes("Login required"), "Review route body must not show Login required.");
assert(!reviewRoute.includes("Logout"), "Review route body must not show Logout.");
assert(shellChrome.includes("reviewNavItems"), "Review route must use internal review nav.");
assert(shellChrome.includes("#dashboard") && shellChrome.includes("#client-files"), "Review route nav must use internal anchors.");
assert(!/reviewNavItems[\s\S]{0,900}href:\s*["']\/(leads|appointments|settings|audit-log)/.test(shellChrome), "Review route nav must not link to protected routes.");
assert(!/from\s+["']@\/lib\/actions["']|from\s+["']@\/lib\/data\/.*repository|from\s+["']@\/lib\/data\/supabase|<form/i.test(reviewRoute), "Review route must not import live writes.");
assert(reviewRoute.includes("(Preview Only)") && /<button[\s\S]{0,160}disabled/.test(reviewRoute), "Review actions must be disabled or Preview Only.");
assert(reviewRoute.includes("Client Files Preview"), "Client Files Preview missing.");
assert(reviewRoute.includes("2026-05-31"), "Sunday demo date missing.");
assert(new Date("2026-05-31T00:00:00").getDay() === 0, "Sunday demo date must be a Sunday.");
assert(reviewRoute.includes("new Date(`${slot.date}T00:00:00`).getDay() === 0"), "Review route must validate Sunday slot date.");
assert(!/free consultation/i.test(reviewRoute), "Review route contains forbidden consultation wording.");
for (const pattern of [/\bS\$\s*\d{2,}/i, /\bSGD\s*\d{2,}/i, /\bquote range\b/i, /\bprice estimate\b/i, /\bestimate range\b/i, /\brough estimate\b/i, /\bpackage price\b/i]) {
  assert(!pattern.test(reviewRoute), `Review route contains generated amount wording: ${pattern}`);
}

console.log("PASS: v3 review route static tests passed.");
