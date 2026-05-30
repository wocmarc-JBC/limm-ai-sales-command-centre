const target = process.argv[2];
const sender = process.argv[3] ?? "6599999999";

if (!target) {
  console.error("Usage: node scripts/test_v4_8_whatsapp_live_payload.mjs <webhook-url> [sender-phone]");
  process.exit(1);
}

const providerMessageId = `wamid.v4_8_live_payload_${Date.now()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "test_waba",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "6500000000",
              phone_number_id: "test_phone_number_id"
            },
            contacts: [
              {
                profile: { name: "Closed Test Client" },
                wa_id: sender
              }
            ],
            messages: [
              {
                from: sender,
                id: providerMessageId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: {
                  body: "Hi, I want to renovate my landed house."
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

const response = await fetch(target, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const body = await response.text();
let parsed = body;
try {
  parsed = JSON.parse(body);
} catch {
  // Keep body as text for non-JSON diagnostics.
}

console.log(JSON.stringify(
  {
    status: response.status,
    providerMessageId,
    response: parsed
  },
  null,
  2
));

process.exit(response.status >= 200 && response.status < 600 ? 0 : 1);
