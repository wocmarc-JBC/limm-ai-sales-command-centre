import "server-only";

import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

export interface WhatsAppReply {
  to: string;
  body: string;
  mode: "safe_preview" | "closed_test_live_send";
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

export class WhatsAppCloudApiAdapter implements WhatsAppAdapter {
  async sendReply(to: string, body: string): Promise<WhatsAppReply> {
    const runtime = getWhatsAppRuntime();
    if (!runtime.credentialsReady) {
      throw new Error("WhatsApp credentials are not configured for auto-reply send.");
    }

    const response = await fetch(
      `https://graph.facebook.com/${runtime.graphVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: false,
            body
          }
        })
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`WhatsApp Cloud API send failed with status ${response.status}`);
    }

    return {
      to,
      body,
      mode: "closed_test_live_send",
      providerMessageId: result?.messages?.[0]?.id ?? ""
    };
  }
}
