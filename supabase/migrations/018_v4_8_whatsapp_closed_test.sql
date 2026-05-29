-- v4.8 WhatsApp closed-test message metadata.
-- This keeps the live WhatsApp webhook idempotent and auditable without enabling public auto-reply.

alter table lead_messages add column if not exists provider_message_id text;
alter table lead_messages add column if not exists provider_timestamp timestamptz;
alter table lead_messages add column if not exists whatsapp_status text not null default '';
alter table lead_messages add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists lead_messages_provider_message_id_unique
on lead_messages(provider_message_id)
where provider_message_id is not null;

create index if not exists lead_messages_lead_created_at_idx
on lead_messages(lead_id, created_at desc);

create index if not exists lead_messages_whatsapp_status_idx
on lead_messages(whatsapp_status);

comment on column lead_messages.provider_message_id is
'WhatsApp Cloud API inbound/outbound message id used for closed-test dedupe.';

comment on column lead_messages.whatsapp_status is
'Closed-test WhatsApp processing status: received, sent, blocked, failed, or disabled.';
