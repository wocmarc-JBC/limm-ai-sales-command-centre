import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export type WhatsAppWebhookSignatureFailureReason =
  | "missing_app_secret"
  | "missing_signature"
  | "malformed_signature"
  | "signature_mismatch";

export type WhatsAppWebhookSignatureResult =
  | { ok: true }
  | { ok: false; reason: WhatsAppWebhookSignatureFailureReason };

type VerifyWhatsAppWebhookSignatureInput = {
  rawBody: Buffer;
  signature: string | null;
  appSecret: string | undefined;
};

export function verifyWhatsAppWebhookSignature({
  rawBody,
  signature,
  appSecret
}: VerifyWhatsAppWebhookSignatureInput): WhatsAppWebhookSignatureResult {
  if (!appSecret) {
    return { ok: false, reason: "missing_app_secret" };
  }

  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const match = SIGNATURE_PATTERN.exec(signature);
  if (!match) {
    return { ok: false, reason: "malformed_signature" };
  }

  const receivedDigest = Buffer.from(match[1], "hex");
  const expectedDigest = createHmac("sha256", appSecret).update(rawBody).digest();

  if (receivedDigest.length !== expectedDigest.length || !timingSafeEqual(receivedDigest, expectedDigest)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}
