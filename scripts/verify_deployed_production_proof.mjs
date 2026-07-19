const baseUrl = process.env.LIMM_PRODUCTION_URL?.replace(/\/$/, "");
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
    version: "v11_1_2_production_proof",
    productionSchemaDeploymentGateAvailable: true,
    bossOnlyFailureRecoveryWorkspaceAvailable: true,
    noSendFailureRecoveryAvailable: true,
    authenticatedQaReleaseGateAvailable: true,
    migration031Ready: true,
    intakeProfileSchemaReady: true,
    inboundFailureRecoveryAvailable: true,
    whatsappRecoveryProofSchemaReady: true,
    whatsappProductionSafetyReady: true
  };
  const failed = Object.entries(required).filter(([key, value]) => health[key] !== value);
  if (failed.length) throw new Error(`health_contract_failed:${failed.map(([key]) => key).join(",")}`);
  console.log("PASS: deployed v11.1.2 production schema, recovery, and WhatsApp safety contract is healthy.");
  console.log(health.freshV1112RealInboundProofObserved
    ? `PASS: fresh v11.1.2 real inbound proof observed at ${health.freshV1112RealInboundProofAt}.`
    : "PENDING: the deployment is ready; the first real inbound after v11.1.2 has not yet been observed.");
} catch (error) {
  const reason = error instanceof Error ? error.message : "deployed_proof_failed";
  console.error(`FAIL: deployed production proof did not pass (${reason.slice(0, 180)}).`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
