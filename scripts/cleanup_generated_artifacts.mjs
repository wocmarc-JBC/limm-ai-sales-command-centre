import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const removable = ["node_modules", ".next", "test-results", "playwright-report", ".codex-tools"];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeWithRetries(target) {
  let lastError = null;
  let stoppedNodeProcesses = false;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      fs.rmSync(target, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 250
      });
      if (!fs.existsSync(target)) return;
    } catch (error) {
      lastError = error;
    }
    if (
      !stoppedNodeProcesses &&
      process.platform === "win32" &&
      process.env.LIMM_CLEANUP_STOP_NODE === "true" &&
      path.basename(target).toLowerCase() === "node_modules"
    ) {
      stoppedNodeProcesses = true;
      stopOtherNodeProcesses();
    }
    sleep(500);
  }
  if (lastError) throw lastError;
  if (fs.existsSync(target)) throw new Error(`Unable to remove generated folder after retries: ${target}`);
}

function stopOtherNodeProcesses() {
  const keep = new Set(
    [
      process.pid,
      process.ppid,
      ...(process.env.LIMM_CLEANUP_KEEP_PIDS ?? "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter(Boolean)
    ].map(String)
  );
  const keepExpression = `@(${[...keep].map((pid) => `"${pid}"`).join(",")})`;
  const command = [
    `$keep = ${keepExpression}`,
    "Get-Process node -ErrorAction SilentlyContinue |",
    "Where-Object { $keep -notcontains ([string]$_.Id) } |",
    "Stop-Process -Force -ErrorAction SilentlyContinue"
  ].join(" ");
  spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: root,
    stdio: "ignore",
    shell: false
  });
  sleep(1500);
}

for (const name of removable) {
  const target = path.join(root, name);
  if (!fs.existsSync(target)) continue;
  const real = fs.realpathSync(target);
  if (!real.startsWith(root + path.sep) || path.basename(real).toLowerCase() !== name.toLowerCase()) {
    throw new Error(`Refusing to remove unexpected path: ${real}`);
  }
  removeWithRetries(real);
  console.log(`Removed generated folder: ${real}`);
}
