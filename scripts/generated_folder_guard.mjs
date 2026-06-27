import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const generatedFolderNames = Object.freeze([
  "node_modules",
  ".next",
  "out",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".swc",
  ".vercel",
  "test-results",
  "playwright-report",
  "tmp",
  "temp"
]);

export const generatedFilePatterns = Object.freeze([
  /\.py[co]$/i,
  /^tsconfig\.tsbuildinfo$/i,
  /^\.eslintcache$/i
]);

export const defaultReleaseOutputRoots = Object.freeze([
  "release",
  "releases",
  "package",
  "package-output",
  "packaged",
  "release-package",
  "artifacts/release",
  "artifacts/releases",
  "artifacts/package",
  "artifacts/packages"
]);

export function normalizeRelativePath(relativePath) {
  return String(relativePath)
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/");
}

export function isGeneratedFolderPath(relativePath) {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  return segments.some((segment) => generatedFolderNames.includes(segment));
}

export function isGeneratedFilePath(relativePath) {
  const basename = path.posix.basename(normalizeRelativePath(relativePath));
  return generatedFilePatterns.some((pattern) => pattern.test(basename));
}

export function isGeneratedArtifactPath(relativePath) {
  return isGeneratedFolderPath(relativePath) || isGeneratedFilePath(relativePath);
}

function gitPaths(root, args) {
  try {
    const output = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output.split("\0").filter(Boolean).map(normalizeRelativePath);
  } catch {
    return [];
  }
}

function walk(root, current, output) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    output.push(normalizeRelativePath(path.relative(root, full)));
    if (entry.isDirectory()) walk(root, full, output);
  }
}

export function listGitTrackedGeneratedArtifacts(root) {
  return gitPaths(root, ["ls-files", "-z"]).filter(isGeneratedArtifactPath);
}

export function listGitStagedGeneratedArtifacts(root) {
  return gitPaths(root, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]).filter(isGeneratedArtifactPath);
}

export function listReleaseGeneratedArtifacts(root, releaseRoots = defaultReleaseOutputRoots) {
  const output = [];

  for (const releaseRoot of releaseRoots) {
    const absolute = path.join(root, releaseRoot);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    const normalizedRoot = normalizeRelativePath(releaseRoot);

    if (isGeneratedArtifactPath(normalizedRoot)) {
      output.push(normalizedRoot);
    }

    if (stat.isDirectory()) {
      walk(root, absolute, output);
    } else if (isGeneratedArtifactPath(normalizedRoot)) {
      output.push(normalizedRoot);
    }
  }

  return [...new Set(output.filter(isGeneratedArtifactPath))].sort();
}

export function findGeneratedArtifactViolations({ root, releaseRoots = defaultReleaseOutputRoots }) {
  return {
    tracked: [...new Set(listGitTrackedGeneratedArtifacts(root))].sort(),
    staged: [...new Set(listGitStagedGeneratedArtifacts(root))].sort(),
    release: listReleaseGeneratedArtifacts(root, releaseRoots)
  };
}

function sample(paths, limit = 8) {
  const visible = paths.slice(0, limit).join(", ");
  return paths.length > limit ? `${visible}, and ${paths.length - limit} more` : visible;
}

export function assertNoTrackedOrPackagedGeneratedArtifacts({ root, assert, releaseRoots = defaultReleaseOutputRoots }) {
  const violations = findGeneratedArtifactViolations({ root, releaseRoots });
  const messages = [];

  if (violations.tracked.length > 0) {
    messages.push(`Generated artifacts tracked by git/index: ${sample(violations.tracked)}.`);
  }

  if (violations.staged.length > 0) {
    messages.push(`Generated artifacts staged for commit: ${sample(violations.staged)}.`);
  }

  if (violations.release.length > 0) {
    messages.push(`Generated artifacts included in release/package output: ${sample(violations.release)}.`);
  }

  assert(messages.length === 0, messages.join(" "));
}
