import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const reportScript = path.join(root, "scripts", "generate_v4_2_browser_report.mjs");
const runId = process.env.V4_2_QA_RUN_ID ?? `v4_2_browser_human_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const screenshotDir = process.env.V4_2_SCREENSHOT_DIR ?? path.join(root, "screenshots", runId);
const summaryDir = path.join(root, "test-results", "v4_2_qa_summary");
const outputFile = path.join(summaryDir, "playwright-output.txt");
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

function writeFailureReport(reason, status = 1, output = "") {
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.writeFileSync(outputFile, output || reason, "utf8");
  spawnSync(process.execPath, [reportScript], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      V4_2_QA_RUN_ID: runId,
      V4_2_SCREENSHOT_DIR: screenshotDir,
      V4_2_BROWSER_QA_EXIT_CODE: String(status),
      V4_2_BROWSER_QA_FAILURE_REASON: reason
    }
  });
  console.error(`FAIL: ${reason}`);
  process.exit(status);
}

if (!fs.existsSync(playwrightCli)) {
  writeFailureReport(
    "Playwright package is not installed. Run: npm.cmd install, then npx.cmd playwright install chromium.",
    1
  );
}

if (!fs.existsSync(nextCli)) {
  writeFailureReport(
    "Next.js package is not installed. Run: npm.cmd install, then npx.cmd playwright install chromium.",
    1
  );
}

fs.mkdirSync(screenshotDir, { recursive: true });
fs.rmSync(summaryDir, { recursive: true, force: true });
fs.mkdirSync(summaryDir, { recursive: true });

function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on("error", retry);
      request.setTimeout(2_000, () => {
        request.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for app server at ${url}`));
        return;
      }
      setTimeout(attempt, 1000);
    }

    attempt();
  });
}

function stopServer(server) {
  if (!server || server.killed) return;
  if (process.platform === "win32" && server.pid) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
      shell: false
    });
    return;
  }
  server.kill("SIGTERM");
}

let server = null;
let serverOutput = "";
let result;
try {
  server = spawn(process.execPath, [nextCli, "dev", "-p", port], {
    cwd: root,
    shell: false,
    env: { ...process.env, PLAYWRIGHT_PORT: port }
  });
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
    if (serverOutput.length > 500_000) serverOutput = serverOutput.slice(-500_000);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
    if (serverOutput.length > 500_000) serverOutput = serverOutput.slice(-500_000);
  });
  await waitForServer(`${baseURL}/login`);

  result = spawnSync(process.execPath, [playwrightCli, "test"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: port,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_SKIP_WEB_SERVER: "1",
      V4_2_QA_RUN_ID: runId,
      V4_2_SCREENSHOT_DIR: screenshotDir,
      V4_2_QA_SUMMARY_DIR: summaryDir
    }
  });
} catch (error) {
  writeFailureReport(
    error instanceof Error ? error.message : String(error),
    1,
    serverOutput
  );
} finally {
  stopServer(server);
}

const output = `${serverOutput}\n${result?.stdout ?? ""}${result?.stderr ?? ""}`;
fs.mkdirSync(summaryDir, { recursive: true });
fs.writeFileSync(outputFile, output, "utf8");
if (result?.stdout) process.stdout.write(result.stdout);
if (result?.stderr) process.stderr.write(result.stderr);

const exitCode = result?.status ?? 1;
spawnSync(process.execPath, [reportScript], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    V4_2_QA_RUN_ID: runId,
    V4_2_SCREENSHOT_DIR: screenshotDir,
    V4_2_BROWSER_QA_EXIT_CODE: String(exitCode),
    V4_2_BROWSER_QA_FAILURE_REASON: exitCode === 0 ? "" : "Playwright browser QA exited non-zero. See V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md and test-results/playwright."
  }
});

process.exit(exitCode);
