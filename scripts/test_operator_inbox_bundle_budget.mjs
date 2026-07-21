import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const manifestPath = path.join(root, ".next", "app-build-manifest.json");
assert.ok(fs.existsSync(manifestPath), "Run `next build` before the operator inbox bundle budget check.");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routeFiles = manifest.pages?.["/inbox/page"];
assert.ok(Array.isArray(routeFiles) && routeFiles.length > 0, "Inbox production bundle is missing from the app build manifest.");

const measured = routeFiles.map((relativePath) => {
  const absolutePath = path.join(root, ".next", relativePath);
  assert.ok(fs.existsSync(absolutePath), `Initial Inbox chunk is missing: ${relativePath}`);
  return {
    relativePath,
    gzipBytes: gzipSync(fs.readFileSync(absolutePath)).length
  };
});

const totalGzipBytes = measured.reduce((sum, file) => sum + file.gzipBytes, 0);
const routeSpecific = measured.filter((file) => file.relativePath.includes("/app/inbox/page-"));
const initialBudgetBytes = 136 * 1024;
const routeBudgetBytes = 27 * 1024;

assert.ok(totalGzipBytes <= initialBudgetBytes, `Inbox initial JS is ${(totalGzipBytes / 1024).toFixed(1)} KB gzip; budget is 136 KB.`);
assert.equal(routeSpecific.length, 1, "Expected exactly one route-specific Inbox chunk.");
assert.ok(routeSpecific[0].gzipBytes <= routeBudgetBytes, `Inbox route chunk is ${(routeSpecific[0].gzipBytes / 1024).toFixed(1)} KB gzip; budget is 27 KB.`);

console.log(`PASS: Inbox initial JS ${(totalGzipBytes / 1024).toFixed(1)} KB gzip; route chunk ${(routeSpecific[0].gzipBytes / 1024).toFixed(1)} KB gzip.`);
