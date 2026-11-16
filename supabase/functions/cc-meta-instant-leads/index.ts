type Config = {
  appSecret: string;
  verifyToken: string;
  pageToken: string;
  pageId: string;
  formId: string;
  companyId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  testLeadId?: string;
};

type MetaNotification = {
  object?: string;
  entry?: Array<{
    id?: string | number;
    changes?: Array<{ field?: string; value?: { page_id?: string | number; form_id?: string | number; leadgen_id?: string | number } }>;
  }>;
};

type MetaLead = {
  id?: string;
  form_id?: string;
  ad_id?: string;
  platform?: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
};

const encoder = new TextEncoder();
const providerId = /^\d{5,30}$/;
const fieldKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

async function leadUuid(config: Config, leadId: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`meta-instant-lead:${config.companyId}:${leadId}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function validSignature(secret: string, raw: ArrayBuffer, signature: string | null) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature ?? "")) return false;
  const bytes = Uint8Array.from(signature!.slice(7).match(/../g)!, (hex) => Number.parseInt(hex, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, bytes, raw);
}

async function importLead(config: Config, leadId: string, request: typeof fetch) {
  const graphUrl = new URL(`https://graph.facebook.com/v27.0/${leadId}`);
  graphUrl.searchParams.set("fields", "id,form_id,ad_id,platform,created_time,field_data");
  const result = await request(graphUrl, {
    headers: { Authorization: `Bearer ${config.pageToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new Error("lead_retrieval_failed");
  const lead = await result.json() as MetaLead;
  if (lead.id !== leadId || String(lead.form_id ?? "") !== config.formId) throw new Error("lead_identity_mismatch");

  const fields = new Map((lead.field_data ?? []).map((field) => [fieldKey(field.name), field.values?.[0]?.trim() ?? ""]));
  const answer = (key: string) => [...fields].find(([name]) => name.startsWith(key))?.[1] ?? "";
  const name = fields.get("full name") || [fields.get("first name"), fields.get("last name")].filter(Boolean).join(" ");
  const phoneDigits = (fields.get("phone number") ?? "").replace(/\D/g, "");
  const phone = /^\d{8}$/.test(phoneDigits) ? `65${phoneDigits}` : phoneDigits;
  const property = answer("what type of home are you renovating");
  const scope = answer("what work would you like us to do");
  const budget = answer("what is your estimated renovation budget");
  const timing = answer("when are you collecting your keys or hoping to start");
  const isTest = config.testLeadId === leadId || /^<?test lead data\b/i.test(name);
  const missing = [["Name", name], ["Mobile", phone], ["Property type", property], ["Renovation scope", scope], ["Budget", budget], ["Project timing", timing]]
    .filter(([, value]) => !value).map(([label]) => label);
  const nextAction = "Review the Meta Instant Form submission and follow up about the renovation enquiry.";
  const write = await request(`${config.supabaseUrl}/rest/v1/leads?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: await leadUuid(config, leadId), company_id: config.companyId,
      client_name: name || "Meta renovation enquiry", phone,
      source: "Meta Instant Form", lead_source: "Meta Instant Form",
      property_type: property, scope_summary: scope, missing_info: missing,
      business_line: "RENOVATION", pipeline_classification: "RENOVATION",
      next_action: nextAction, sales_next_action: nextAction,
      is_test: isTest, bot_paused: true, bot_pause_reason: "Meta form enquiry for manual follow-up",
      intake_profile: { propertyType: property, scopeOfWork: scope, budgetExpectation: budget, timeline: timing },
      attribution: { provider: "meta", formId: config.formId, leadId, adId: lead.ad_id, platform: lead.platform, submittedAt: lead.created_time },
      attribution_source: "meta_instant_form", attribution_captured_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!write.ok) throw new Error("command_centre_write_failed");
}

export function createHandler(config: Config, request = fetch) {
  return async (incoming: Request) => {
    if (incoming.method === "GET") {
      const params = new URL(incoming.url).searchParams;
      const challenge = params.get("hub.challenge");
      if (config.verifyToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === config.verifyToken && challenge) {
        return new Response(challenge);
      }
      return new Response("Forbidden", { status: 403 });
    }
    if (incoming.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!config.appSecret) return new Response("Integration not configured", { status: 503 });
    const raw = await incoming.arrayBuffer();
    if (!await validSignature(config.appSecret, raw, incoming.headers.get("x-hub-signature-256"))) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      const event = JSON.parse(new TextDecoder().decode(raw), (key, value, context?: { source?: string }) => {
        if (typeof value === "number" && ["id", "page_id", "form_id", "leadgen_id"].includes(key)) {
          return context?.source ?? value;
        }
        return value;
      }) as MetaNotification;
      if (event.object !== "page") return new Response("Ignored");
      const ids = new Set<string>();
      for (const entry of event.entry ?? []) {
        if (String(entry.id ?? "") !== config.pageId) continue;
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const leadId = String(value?.leadgen_id ?? "");
          if (change.field === "leadgen" && String(value?.form_id ?? "") === config.formId && (!value?.page_id || String(value.page_id) === config.pageId) && providerId.test(leadId)) {
            ids.add(leadId);
          }
        }
      }
      if (ids.size && (!config.pageToken || !config.serviceRoleKey || !config.companyId || !config.supabaseUrl)) {
        throw new Error("integration_not_configured");
      }
      for (const id of ids) await importLead(config, id, request);
      return new Response("Accepted");
    } catch (error) {
      const known = ["lead_retrieval_failed", "lead_identity_mismatch", "command_centre_write_failed", "integration_not_configured"];
      const reason = error instanceof Error && known.includes(error.message) ? error.message : "invalid_or_unavailable";
      console.error(`Meta Instant Form intake: ${reason}`);
      return new Response("Intake failed", { status: 503 });
    }
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const env = (key: string) => Deno.env.get(key) ?? "";
  Deno.serve(createHandler({
    appSecret: env("CC_META_LEADS_APP_SECRET"), verifyToken: env("CC_META_LEADS_VERIFY_TOKEN"),
    pageToken: env("CC_META_LEADS_PAGE_TOKEN"), pageId: env("CC_META_LEADS_PAGE_ID"),
    formId: env("CC_META_LEADS_FORM_ID"), companyId: env("CC_META_LEADS_COMPANY_ID"),
    supabaseUrl: env("SUPABASE_URL"), serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    testLeadId: env("CC_META_LEADS_TEST_LEAD_ID"),
  }));
}
