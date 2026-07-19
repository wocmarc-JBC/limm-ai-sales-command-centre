const baseUrl = process.env.LIMM_PRODUCTION_URL?.replace(/\/$/, "");
const readinessOnly = process.argv.includes("--readiness-only");
if (!baseUrl) {
  console.error("FAIL: set LIMM_PRODUCTION_URL to the deployed HTTPS origin.");
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
try {
  const response = await fetch(`${baseUrl}/api/whatsapp/health`, {
    headers: { Accept: "application/json" },
    signal: controller.signal
  });
  if (!response.ok) throw new Error(`health_http_${response.status}`);
  const health = await response.json();
  const required = {
    ok: true,
    version: "v11_1_3_outbound_hotfix",
    productionSchemaDeploymentGateAvailable: true,
    bossOnlyFailureRecoveryWorkspaceAvailable: true,
    noSendFailureRecoveryAvailable: true,
    authenticatedQaReleaseGateAvailable: true,
    trustedWebhookLeadControlReadAvailable: true,
    unexpectedNoSendTelemetryAvailable: true,
    outboundTerminalProofRequired: true,
    migration031Ready: true,
    intakeProfileSchemaReady: true,
    inboundFailureRecoveryAvailable: true,
    whatsappRecoveryProofSchemaReady: true,
    whatsappProductionSafetyReady: true
  };
  const failed = Object.entries(required).filter(([key, value]) => health[key] !== value);
  if (failed.length) throw new Error(`health_contract_failed:${failed.map(([key]) => key).join(",")}`);
  console.log("PASS: deployed v11.1.3 trusted webhook state, schema, recovery, and WhatsApp safety contract is healthy.");
  if (health.freshV1113RealInboundProofObserved) {
    console.log(`PASS: fresh v11.1.3 real inbound observed at ${health.freshV1113RealInboundProofAt}.`);
  } else {
    console.log("PENDING: the first real inbound after v11.1.3 has not yet been observed.");
  }
  if (health.freshV1113RealOutboundProofObserved) {
    console.log(`PASS: fresh v11.1.3 real outbound terminal proof observed at ${health.freshV1113RealOutboundProofAt}.`);
  } else if (readinessOnly) {
    console.log("PENDING: deployment is ready, but a real reply must complete before outbound proof is closed.");
  } else {
    throw new Error("fresh_v11_1_3_outbound_terminal_proof_missing");
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : "deployed_proof_failed";
  console.error(`FAIL: deployed production proof did not pass (${reason.slice(0, 180)}).`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
