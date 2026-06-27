import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertNoTrackedOrPackagedGeneratedArtifacts,
  findGeneratedArtifactViolations,
  isGeneratedArtifactPath,
  isGeneratedFolderPath
} from "./generated_folder_guard.mjs";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertThrows(fn, expectedMessage) {
  try {
    fn();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `Expected "${expectedMessage}" in "${error.message}".`);
    return;
  }
  fail(`Expected function to throw: ${expectedMessage}`);
}

function write(root, relativePath, content = "test") {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function runGit(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

assert(isGeneratedFolderPath("node_modules/next/index.js"), "node_modules must be treated as generated.");
assert(isGeneratedFolderPath(".next/cache/build-manifest.json"), ".next must be treated as generated.");
assert(isGeneratedFolderPath("out/index.html"), "out must be treated as generated.");
assert(isGeneratedFolderPath("dist/app.js"), "dist must be treated as generated.");
assert(isGeneratedFolderPath("coverage/index.html"), "coverage must be treated as generated.");
assert(isGeneratedArtifactPath("tsconfig.tsbuildinfo"), "TypeScript build info must be treated as generated.");
assert(!isGeneratedFolderPath("docs/node_modules_notes.md"), "Similar filenames must not be treated as generated folders.");
assert(!isGeneratedArtifactPath("artifacts/reply-quality-report.md"), "Normal project artifacts must not be treated as generated.");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "limm-generated-folder-guard-"));

try {
  write(tempRoot, "node_modules/pkg/index.js");
  write(tempRoot, ".next/cache/build-manifest.json");
  write(tempRoot, "coverage/index.html");
  write(tempRoot, "tsconfig.tsbuildinfo");

  assertNoTrackedOrPackagedGeneratedArtifacts({ root: tempRoot, assert });
  const localViolations = findGeneratedArtifactViolations({ root: tempRoot });
  assert(localViolations.tracked.length === 0, "Ignored local generated folders must not be reported as tracked.");
  assert(localViolations.staged.length === 0, "Ignored local generated folders must not be reported as staged.");
  assert(localViolations.release.length === 0, "Ignored local generated folders must not be reported as release output.");

  write(tempRoot, "release/node_modules/pkg/index.js");
  const releaseViolations = findGeneratedArtifactViolations({ root: tempRoot });
  assert(releaseViolations.release.includes("release/node_modules/pkg/index.js"), "Release output must report nested generated folders.");
  assertThrows(
    () => assertNoTrackedOrPackagedGeneratedArtifacts({ root: tempRoot, assert }),
    "Generated artifacts included in release/package output"
  );
  fs.rmSync(path.join(tempRoot, "release"), { recursive: true, force: true });

  runGit(tempRoot, ["init"]);
  write(tempRoot, ".gitignore", ["node_modules/", ".next/", "coverage/", "tsconfig.tsbuildinfo", ""].join("\n"));
  runGit(tempRoot, ["add", ".gitignore"]);
  runGit(tempRoot, ["add", "-f", "node_modules/pkg/index.js"]);

  const gitViolations = findGeneratedArtifactViolations({ root: tempRoot });
  assert(gitViolations.tracked.includes("node_modules/pkg/index.js"), "Git-indexed generated files must be reported.");
  assert(gitViolations.staged.includes("node_modules/pkg/index.js"), "Staged generated files must be reported.");
  assertThrows(
    () => assertNoTrackedOrPackagedGeneratedArtifacts({ root: tempRoot, assert }),
    "Generated artifacts tracked by git/index"
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("PASS: generated folder guard tests passed.");
