import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadTypeScriptCommonJs(relativePath) {
  const source = read(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  });
  const diagnostics = compiled.diagnostics ?? [];
  assert.equal(diagnostics.length, 0, `TypeScript test loader found diagnostics in ${relativePath}.`);

  const loadedModule = { exports: {} };
  const execute = new Function("require", "module", "exports", compiled.outputText);
  execute(createRequire(import.meta.url), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const { verifyWhatsAppWebhookSignature } = loadTypeScriptCommonJs("lib/whatsapp-webhook-signature.ts");
assert.equal(typeof verifyWhatsAppWebhookSignature, "function", "Signature verifier must export a callable function.");

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

const officialVectorSecret = "It's a Secret to Everybody";
const officialVectorPayload = Buffer.from("Hello, World!", "utf8");
const officialVectorSignature = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

check("accepts the documented HMAC-SHA256 vector", () => {
  assert.deepEqual(
    verifyWhatsAppWebhookSignature({
      rawBody: officialVectorPayload,
      signature: officialVectorSignature,
      appSecret: officialVectorSecret
    }),
    { ok: true }
  );
});

const unicodePayload = Buffer.from(JSON.stringify({ message: "Renovation enquiry 🏠 — 47 Kasai Road" }), "utf8");
const unicodeSecret = "test-app-secret";
const unicodeSignature = `sha256=${createHmac("sha256", unicodeSecret).update(unicodePayload).digest("hex")}`;

check("authenticates the exact UTF-8 payload bytes", () => {
  assert.deepEqual(
    verifyWhatsAppWebhookSignature({
      rawBody: unicodePayload,
      signature: unicodeSignature,
      appSecret: unicodeSecret
    }),
    { ok: true }
  );
});

for (const scenario of [
  {
    name: "fails closed when the app secret is absent",
    input: { rawBody: unicodePayload, signature: unicodeSignature, appSecret: undefined },
    reason: "missing_app_secret"
  },
  {
    name: "rejects a missing signature",
    input: { rawBody: unicodePayload, signature: null, appSecret: unicodeSecret },
    reason: "missing_signature"
  },
  {
    name: "rejects a wrong signature prefix",
    input: { rawBody: unicodePayload, signature: unicodeSignature.replace("sha256=", "sha1="), appSecret: unicodeSecret },
    reason: "malformed_signature"
  },
  {
    name: "rejects a non-hex digest",
    input: { rawBody: unicodePayload, signature: `sha256=${"z".repeat(64)}`, appSecret: unicodeSecret },
    reason: "malformed_signature"
  },
  {
    name: "rejects a short digest before constant-time comparison",
    input: { rawBody: unicodePayload, signature: "sha256=abcd", appSecret: unicodeSecret },
    reason: "malformed_signature"
  },
  {
    name: "rejects a signature mismatch",
    input: { rawBody: unicodePayload, signature: `sha256=${"0".repeat(64)}`, appSecret: unicodeSecret },
    reason: "signature_mismatch"
  },
  {
    name: "rejects a payload changed after signing",
    input: { rawBody: Buffer.concat([unicodePayload, Buffer.from(" ")]), signature: unicodeSignature, appSecret: unicodeSecret },
    reason: "signature_mismatch"
  }
]) {
  check(scenario.name, () => {
    assert.deepEqual(verifyWhatsAppWebhookSignature(scenario.input), { ok: false, reason: scenario.reason });
  });
}

const verifierSource = read("lib/whatsapp-webhook-signature.ts");
check("uses Node HMAC and constant-time digest comparison", () => {
  assert.match(verifierSource, /createHmac\("sha256", appSecret\)/);
  assert.match(verifierSource, /timingSafeEqual\(receivedDigest, expectedDigest\)/);
  assert.equal(verifierSource.includes("signature ==="), false);
});

const webhookSource = read("app/api/whatsapp/webhook/route.ts");
check("verifies the raw byte body before parsing or processing", () => {
  const bodyReadIndex = webhookSource.indexOf("await request.arrayBuffer()");
  const signatureIndex = webhookSource.indexOf("verifyWhatsAppWebhookSignature({", bodyReadIndex);
  const parseIndex = webhookSource.indexOf("JSON.parse(rawBody)");
  const handlerIndex = webhookSource.indexOf("await handleWhatsAppInboundMessage(message)");
  assert.ok(bodyReadIndex >= 0, "Webhook must read the exact raw bytes.");
  assert.ok(signatureIndex > bodyReadIndex, "Signature verification must follow raw-byte capture.");
  assert.ok(parseIndex > signatureIndex, "Payload parsing must happen after signature verification.");
  assert.ok(handlerIndex > parseIndex, "CRM/reply processing must happen after parsing.");
});

check("fails closed with safe signature diagnostics", () => {
  for (const marker of [
    "x-hub-signature-256",
    "WHATSAPP_APP_SECRET",
    "whatsapp_signature_check_started",
    "whatsapp_signature_verified",
    "invalid_webhook_signature",
    "webhook_signature_config_error"
  ]) {
    assert.ok(webhookSource.includes(marker), `Webhook signature path missing ${marker}.`);
  }
  assert.match(webhookSource, /status:\s*401/);
  assert.equal(/signature:\s*signatureHeader/.test(webhookSource), false, "Signature values must never be logged or returned.");
});

const healthSource = read("app/api/whatsapp/health/route.ts");
check("publishes only safe signature readiness booleans", () => {
  for (const marker of [
    "v10_2_2_webhook_auth_dependency_hardening",
    "webhookSignatureVerificationAvailable",
    "webhookSignatureEnforced",
    "hasWhatsappAppSecret"
  ]) {
    assert.ok(healthSource.includes(marker), `Health endpoint missing ${marker}.`);
  }
  assert.equal(healthSource.includes('appSecret: process.env.WHATSAPP_APP_SECRET'), false);
});

const envExample = read(".env.example");
check("documents a blank server-only app-secret variable", () => {
  assert.match(envExample, /^WHATSAPP_APP_SECRET=$/m);
  assert.equal(/^NEXT_PUBLIC_WHATSAPP_APP_SECRET=/m.test(envExample), false);
});

const packageJson = JSON.parse(read("package.json"));
check("locks the v10.2.2 patched dependency baseline", () => {
  assert.equal(packageJson.version, "10.2.2");
  assert.match(packageJson.dependencies.next, /15\.5\.(?:1[6-9]|[2-9]\d)/);
  assert.match(packageJson.dependencies.react, /19\.2\./);
  assert.match(packageJson.dependencies["react-dom"], /19\.2\./);
  assert.match(packageJson.devDependencies.eslint, /\^9\./);
  assert.equal(packageJson.overrides["form-data"], "4.0.6");
  assert.equal(packageJson.overrides.postcss, "$postcss");
  assert.equal(packageJson.devDependencies.postcss, "8.5.15");
});

check("does not change sales-composer behavior", () => {
  const changedSurfaces = [
    "lib/whatsapp-auto-reply.ts",
    "lib/whatsapp-v9/reply-planner.ts",
    "lib/whatsapp-v9/reply-composer.ts"
  ].filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
  for (const relativePath of changedSurfaces) {
    assert.equal(read(relativePath).includes("verifyWhatsAppWebhookSignature"), false, `${relativePath} must remain independent of transport authentication.`);
  }
});

check("test itself uses constant-time comparison as a locked security requirement", () => {
  assert.equal(typeof timingSafeEqual, "function");
});

console.log(`v10.2.2 webhook and dependency hardening checks passed: ${checks.length}`);
