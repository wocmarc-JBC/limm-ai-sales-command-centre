import "server-only";

import { getWhatsAppRuntime } from "@/lib/whatsapp-config";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-config";

export interface WhatsAppReply {
  to: string;
  body: string;
  mode: "safe_preview" | "live_auto_reply_send";
  providerMessageId?: string;
}

export interface WhatsAppAdapter {
  sendReply(to: string, body: string): Promise<WhatsAppReply>;
}

export class SafeModeWhatsAppAdapter implements WhatsAppAdapter {
  async sendReply(to: string, body: string): Promise<WhatsAppReply> {
    return {
      to,
      body,
      mode: "safe_preview"
    };
  }
}

export type WhatsAppTextPayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: {
    preview_url: false;
    body: string;
  };
};

export type WhatsAppSendPayloadSummary = {
  phoneNumberIdPresent: boolean;
  toDigitsLength: number;
  bodyLength: number;
  hasMessagingProduct: boolean;
  hasRecipientType: boolean;
  hasTextBody: boolean;
  graphVersion: string;
};

export class WhatsAppCloudApiSendError extends Error {
  status: number;
  metaCode?: string;
  metaMessage?: string;
  metaType?: string;

  constructor(input: { status: number; metaCode?: string; metaMessage?: string; metaType?: string }) {
    super(`WhatsApp Cloud API send failed with status ${input.status}`);
    this.name = "WhatsAppCloudApiSendError";
    this.status = input.status;
    this.metaCode = input.metaCode;
    this.metaMessage = input.metaMessage;
    this.metaType = input.metaType;
  }
}

export function buildWhatsAppTextPayload(to: string, body: string): WhatsAppTextPayload {
  const toDigits = normalizeWhatsAppPhone(to);
  const safeBody = String(body ?? "").trim();

  if (!toDigits) {
    throw new Error("WhatsApp recipient is empty after digit normalization.");
  }

  if (!safeBody) {
    throw new Error("WhatsApp text body is empty.");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toDigits,
    type: "text",
    text: {
      preview_url: false,
      body: safeBody
    }
  };
}

export function getWhatsAppSendPayloadSummary(to: string, body: string): WhatsAppSendPayloadSummary {
  const runtime = getWhatsAppRuntime();
  const payload = buildWhatsAppTextPayload(to, body);

  return {
    phoneNumberIdPresent: runtime.phoneNumberIdConfigured,
    toDigitsLength: payload.to.length,
    bodyLength: payload.text.body.length,
    hasMessagingProduct: payload.messaging_product === "whatsapp",
    hasRecipientType: payload.recipient_type === "individual",
    hasTextBody: Boolean(payload.text.body),
    graphVersion: runtime.graphVersion
  };
}

async function readMetaError(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: unknown;
        code?: unknown;
        type?: unknown;
      };
    };
    return {
      metaMessage: typeof parsed.error?.message === "string" ? parsed.error.message : undefined,
      metaCode: parsed.error?.code === undefined ? undefined : String(parsed.error.code),
      metaType: typeof parsed.error?.type === "string" ? parsed.error.type : undefined
    };
  } catch {
    return {
      metaMessage: raw.slice(0, 240)
    };
  }
}

export class WhatsAppCloudApiAdapter implements WhatsAppAdapter {
  async sendReply(to: string, body: string): Promise<WhatsAppReply> {
    const runtime = getWhatsAppRuntime();
    if (!runtime.credentialsReady) {
      throw new Error("WhatsApp credentials are not configured for auto-reply send.");
    }
    const phoneNumberId = normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "");
    const payload = buildWhatsAppTextPayload(to, body);

    const response = await fetch(
      `https://graph.facebook.com/${runtime.graphVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await response.text().catch(() => "{}");
    let result: { messages?: Array<{ id?: string }> } = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = {};
    }
    if (!response.ok) {
      const metaError = await readMetaError(new Response(responseText, { status: response.status }));
      throw new WhatsAppCloudApiSendError({ status: response.status, ...metaError });
    }

    return {
      to: payload.to,
      body: payload.text.body,
      mode: "live_auto_reply_send",
      providerMessageId: result?.messages?.[0]?.id ?? ""
    };
  }
}
