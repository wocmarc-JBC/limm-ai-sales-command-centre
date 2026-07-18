import "server-only";

export type WhatsAppRuntime = {
  liveInboundEnabled: boolean;
  testAutoReplyEnabled: boolean;
  publicAutoReplyEnabled: boolean;
  testMode: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessNumber: string;
  graphVersion: string;
  closedTestAutoReplyAllowed: boolean;
  liveAutoReplyApproved: boolean;
  autoReplyModeAllowed: boolean;
  credentialsReady: boolean;
  statusLabel: string;
};

function flag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "true";
}

export function normalizeWhatsAppPhone(value = "") {
  return value.replace(/[^\d]/g, "");
}

export function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? "";
}

export function getWhatsAppRuntime(): WhatsAppRuntime {
  const liveInboundEnabled = flag("WHATSAPP_LIVE_INBOUND_ENABLED", false);
  const testAutoReplyEnabled = flag("WHATSAPP_TEST_AUTO_REPLY_ENABLED", false);
  const publicAutoReplyEnabled = flag("WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED", false);
  const testMode = flag("WHATSAPP_TEST_MODE", true);
  const verifyTokenConfigured = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
  const appSecretConfigured = Boolean(process.env.WHATSAPP_APP_SECRET);
  const accessTokenConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberIdConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const credentialsReady = appSecretConfigured && accessTokenConfigured && phoneNumberIdConfigured;
  const closedTestAutoReplyAllowed =
    liveInboundEnabled &&
    testAutoReplyEnabled &&
    !publicAutoReplyEnabled &&
    testMode &&
    credentialsReady;
  const liveAutoReplyApproved =
    liveInboundEnabled &&
    testAutoReplyEnabled &&
    publicAutoReplyEnabled &&
    !testMode &&
    credentialsReady;
  const autoReplyModeAllowed =
    (!publicAutoReplyEnabled && testMode) ||
    (publicAutoReplyEnabled && !testMode);

  return {
    liveInboundEnabled,
    testAutoReplyEnabled,
    publicAutoReplyEnabled,
    testMode,
    verifyTokenConfigured,
    appSecretConfigured,
    accessTokenConfigured,
    phoneNumberIdConfigured,
    businessNumber: normalizeWhatsAppPhone(process.env.WHATSAPP_BUSINESS_NUMBER ?? ""),
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
    closedTestAutoReplyAllowed,
    liveAutoReplyApproved,
    autoReplyModeAllowed,
    credentialsReady,
    statusLabel: closedTestAutoReplyAllowed
      ? "WhatsApp live closed test mode"
      : liveAutoReplyApproved
        ? "WhatsApp Marcus-approved live auto-reply mode"
      : liveInboundEnabled
        ? "WhatsApp inbound enabled; auto-reply gated"
        : "WhatsApp disabled by default"
  };
}
