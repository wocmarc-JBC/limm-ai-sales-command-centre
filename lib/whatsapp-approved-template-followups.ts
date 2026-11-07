import "server-only";

import { WhatsAppCloudApiSendError } from "@/lib/adapters/whatsapp-adapter";
import { getWhatsAppRuntime, normalizeWhatsAppPhone } from "@/lib/whatsapp-config";

export const FOLLOWUP_TEMPLATE_NAME = "limm_renovation_followup_v1";
export const FOLLOWUP_TEMPLATE_LANGUAGE = "en_US";
export const FOLLOWUP_TEMPLATE_CATEGORY = "MARKETING";

export const FOLLOWUP_TEMPLATE_BODY =
  "Hi, this is LIMM Works following up on your renovation enquiry. If you would like us to continue with an initial project review, please reply here and our team will assist. Reply STOP if you do not want further follow-ups.";

export type MetaFollowupTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  approved: boolean;
};

function metaConfig() {
  const wabaId = normalizeWhatsAppPhone(process.env.WHATSAPP_WABA_ID ?? "");
  const phoneId = normalizeWhatsAppPhone(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "");
  const token = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const graphVersion = getWhatsAppRuntime().graphVersion;
  if (!wabaId || !phoneId || !token || !/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("whatsapp_template_provider_not_configured");
  }
  return { wabaId, phoneId, token, graphVersion };
}

async function graphRequest(
  path: string, 
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
): Promise<Record<string, any>> {
  const config = metaConfig();
  const response = await fetch("https://graph.facebook.com/" + config.graphVersion + "/" + path, {
    method: options.method ?? "GET",
    headers: {
      Authorization: "Bearer " + config.token,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  const raw = await response.text().catch(() => "");
  let json: Record<string, any> = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new WhatsAppCloudApiSendError({
      status: response.status,
      metaCode: json.error?.code === undefined ? undefined : String(json.error.code),
      metaType: typeof json.error?.type === "string" ? json.error.type : undefined,
      metaMessage: typeof json.error?.message === "string" ? json.error.message.slice(0, 140) : undefined
    });
  }
  return json;
}

function readableTemplate(record: Record<string, any>): MetaFollowupTemplate {
  const body = Array.isArray(record.components)
    ? (record.components.find((part: any) => String(part?.type).toUpperCase() === "BODY")?.text ?? "")
    : "";
  const name = String(record.name ?? "");
  const language = String(record.language ?? "");
  const category = String(record.category ?? "").toUpperCase();
  const status = String(record.status ?? "").toUpperCase();
  return {
    name,
    language,
    category,
    status,
    body: String(body),
    approved: name === FOLLOWUP_TEMPLATE_NAME
      && language === FOLLOWUP_TEMPLATE_LANGUAGE
      && category === FOLLOWUP_TEMPLATE_CATEGORY
      && status === "APPROVED"
      && !/\{\{\s*\d+\s*\}\}/.test(String(body))
      && Boolean(body)
  };
}

/** Always read Meta live: a template can be paused or rejected after initial approval. */
export async function getMetaFollowupTemplate(): Promise<MetaFollowupTemplate | null> {
  const { wabaId } = metaConfig();
  let cursor = wabaId + "/message_templates?fields=name,language,category,status,components&limit=100";
  for (let page = 0; page < 3; page++) {
    const response = await graphRequest(cursor);
    for (const template of Array.isArray(response.data) ? response.data : []) {
      if (template?.name === FOLLOWUP_TEMPLATE_NAME && template?.language === FOLLOWUP_TEMPLATE_LANGUAGE) {
        return readableTemplate(template);
      }
    }
    // Only follow Graph paging cursors obtained from Meta. Never trust user-supplied URLs.
    const after = response.paging?.cursors?.after;
    if (!response.paging?.next || typeof after !== "string" || !after) break;
    cursor = wabaId + "/message_templates?fields=name,language,category,status,components&limit=100&after=" + encodeURIComponent(after);
  }
  return null;
}

/** Submission only: approval is entirely controlled by Meta. */
export async function submitMetaFollowupTemplate() {
  const existing = await getMetaFollowupTemplate();
  if (existing) return { alreadyExists: true, status: existing.status };
  const { wabaId } = metaConfig();
  const response = await graphRequest(wabaId + "/message_templates", {
    method: "POST",
    body: {
      name: FOLLOWUP_TEMPLATE_NAME,
      language: FOLLOWUP_TEMPLATE_LANGUAGE,
      category: FOLLOWUP_TEMPLATE_CATEGORY,
      components: [{ type: "BODY", text: FOLLOWUP_TEMPLATE_BODY }]
    }
  });
  return { alreadyExists: false, status: String(response.status ?? "PENDING"), id: String(response.id ?? "") };
}

export function buildApprovedFollowupPayload(to: string) {
  const recipient = normalizeWhatsAppPhone(to);
  if (!/^\d{8,15}$/.test(recipient)) throw new Error("invalid_whatsapp_recipient");
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: recipient,
    type: "template" as const,
    template: {
      name: FOLLOWUP_TEMPLATE_NAME,
      language: { code: FOLLOWUP_TEMPLATE_LANGUAGE }
    }
  };
}

export async function sendMetaApprovedFollowup(to: string) {
  const { phoneId } = metaConfig();
  const payload = buildApprovedFollowupPayload(to);
  const response = await graphRequest(phoneId + "/messages", { method: "POST", body: payload });
  const id = response.messages?.[0]?.id;
  if (typeof id !== "string" || !id) {
    throw new Error("whatsapp_template_provider_receipt_missing");
  }
  return { providerMessageId: id, to: payload.to };
}
