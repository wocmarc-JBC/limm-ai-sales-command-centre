import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PLAYWRIGHT_PORT ?? "3203";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const runId = process.env.V4_2_QA_RUN_ID ?? `v4_3_auth_boss_browser_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const screenshotDir = process.env.V4_2_SCREENSHOT_DIR ?? path.join(root, "screenshots", runId);
const summaryDir = process.env.V4_2_QA_SUMMARY_DIR ?? path.join(root, "test-results", "v4_2_qa_summary");
const outputFile = path.join(summaryDir, "v4-3-playwright-output.txt");

function fail(message, status = 1, output = "") {
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.writeFileSync(outputFile, output || message, "utf8");
  console.error(`FAIL: ${message}`);
  process.exit(status);
}

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

if (!fs.existsSync(playwrightCli)) {
  fail("Playwright package is not installed. Run npm.cmd install first.");
}

if (!fs.existsSync(nextCli)) {
  fail("Next.js package is not installed. Run npm.cmd install first.");
}

fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(summaryDir, { recursive: true });

let server = null;
let serverOutput = "";
let result;

try {
  server = spawn(process.execPath, [nextCli, "dev", "-H", "127.0.0.1", "-p", port], {
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

  result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      "test",
      "tests/e2e/v4-3-auth-boss-write.spec.ts",
      "--project=desktop-chromium"
    ],
    {
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
    }
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1, serverOutput);
} finally {
  stopServer(server);
}

const output = `${serverOutput}\n${result?.stdout ?? ""}${result?.stderr ?? ""}`;
fs.writeFileSync(outputFile, output, "utf8");
if (result?.stdout) process.stdout.write(result.stdout);
if (result?.stderr) process.stderr.write(result.stderr);

process.exit(result?.status ?? 1);
