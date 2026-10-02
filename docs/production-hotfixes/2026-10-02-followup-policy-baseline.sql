CREATE OR REPLACE FUNCTION public.authorize_automated_whatsapp_send(p_company_id uuid, p_lead_id uuid, p_whatsapp_account_id uuid, p_kind text, p_reservation_id uuid DEFAULT NULL::uuid, p_lease_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_lead public.leads%rowtype; v_phone text; v_country text;
begin
  if p_kind not in ('AUTO_REPLY','FOLLOW_UP') then return jsonb_build_object('send_allowed',false,'reason_code','invalid_send_kind'); end if;
  select * into v_lead from public.leads where id=p_lead_id and company_id=p_company_id;
  if not found then return jsonb_build_object('send_allowed',false,'reason_code','lead_scope_missing'); end if;
  if v_lead.is_spam or v_lead.bot_paused or v_lead.needs_marcus or v_lead.boss_approval_needed
     or v_lead.deleted_at is not null or v_lead.archived_at is not null or not v_lead.lead_eligible then
    return jsonb_build_object('send_allowed',false,'reason_code','lead_automation_blocked');
  end if;
  select country_code into v_country from public.companies where id=p_company_id;
  v_phone := regexp_replace(coalesce(v_lead.phone,''),'[^0-9]','','g');
  if upper(coalesce(v_country,''))='SG' and length(v_phone)=8 and left(v_phone,1) in ('8','9') then v_phone := '65'||v_phone; end if;
  if exists(select 1 from public.whatsapp_blocklist b where b.company_id=p_company_id and b.whatsapp_account_id=p_whatsapp_account_id and b.normalized_phone=v_phone and b.active) then
    return jsonb_build_object('send_allowed',false,'reason_code','internal_number_blocked');
  end if;
  if not exists(select 1 from public.company_platform_profiles p where p.company_id=p_company_id and p.lifecycle='LIVE') then
    return jsonb_build_object('send_allowed',false,'reason_code','company_not_live');
  end if;
  if not exists(select 1 from public.company_runtime_controls c where c.company_id=p_company_id and c.whatsapp_outbound_enabled=true
      and case when p_kind='AUTO_REPLY' then c.ai_auto_reply_enabled and c.whatsapp_auto_reply_enabled else c.followups_enabled end) then
    return jsonb_build_object('send_allowed',false,'reason_code','company_automation_disabled');
  end if;
  if not exists(select 1 from public.whatsapp_accounts a where a.id=p_whatsapp_account_id and a.company_id=p_company_id and a.status='CONNECTED'
      and a.outbound_enabled=true and case when p_kind='AUTO_REPLY' then a.auto_reply_enabled else true end) then
    return jsonb_build_object('send_allowed',false,'reason_code','whatsapp_account_automation_disabled');
  end if;
  if p_reservation_id is not null then
    if p_kind='AUTO_REPLY' and not exists(
      select 1 from public.whatsapp_v16_1_reply_reservations r
      where r.id=p_reservation_id and r.company_id=p_company_id and r.lead_id=p_lead_id
        and r.status='sending' and r.lease_token=p_lease_token and r.lease_expires_at>now()
    ) then
      return jsonb_build_object('send_allowed',false,'reason_code','reply_reservation_not_current');
    elsif p_kind='FOLLOW_UP' and not exists(select 1 from public.whatsapp_v16_1_follow_ups f where f.follow_up_id=p_reservation_id and f.company_id=p_company_id and f.lead_id=p_lead_id and f.status='SENDING' and f.send_lease_token=p_lease_token and f.send_lease_expires_at>now()) then
      return jsonb_build_object('send_allowed',false,'reason_code','follow_up_reservation_not_current');
    end if;
  end if;
  return jsonb_build_object('send_allowed',true,'reason_code','authoritative_control_state_allows_send');
end;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_whatsapp_v16_1_follow_ups_for_inbound(p_lead_id uuid, p_inbound_created_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  update public.whatsapp_v16_1_follow_ups
     set status = 'CANCELLED_CLIENT_REPLIED',
         cancel_reason = case
           when status = 'BLOCKED_WHATSAPP_POLICY' then 'client_replied_after_whatsapp_policy_block'
           else 'client_replied'
         end,
         retry_eligible = false,
         retry_at = null,
         attention_required = false,
         attention_resolved_at = case when attention_required then v_now else attention_resolved_at end,
         attention_resolved_reason = case when attention_required then 'CLIENT_REPLIED_AFTER_FAILURE' else attention_resolved_reason end,
         updated_at = v_now,
         completed_at = v_now
   where lead_id = p_lead_id
     and status in ('PLANNED','SCHEDULED','DUE','GENERATING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL','BLOCKED_WHATSAPP_POLICY')
     and p_inbound_created_at > case
       when status = 'BLOCKED_WHATSAPP_POLICY' then coalesce(completed_at, updated_at, created_at)
       else coalesce(last_client_message_at, created_at)
     end;

  get diagnostics v_count = row_count;

  update public.whatsapp_v16_1_follow_ups
     set attention_required = false,
         attention_resolved_at = v_now,
         attention_resolved_reason = 'CLIENT_REPLIED_AFTER_FAILURE',
         attention_resolved_by = 'whatsapp_inbound',
         updated_at = v_now
   where lead_id = p_lead_id
     and attention_required = true
     and attention_resolved_at is null
     and p_inbound_created_at > coalesce(completed_at, created_at);

  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_follow_up_control()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Meta error 131047 / WhatsApp policy blocks are terminal for automation
  -- until a later valid client inbound reopens the conversation.
  if new.status in ('PROVIDER_FAILED','RETRY_SCHEDULED')
     and (
       upper(coalesce(new.failure_category, '')) = 'WHATSAPP_POLICY_BLOCK'
       or position('131047' in coalesce(new.provider_error, '')) > 0
     )
  then
    new.status := 'BLOCKED_WHATSAPP_POLICY';
    new.cancel_reason := 'blocked_until_client_reply_after_meta_24h';
    new.failure_category := 'WHATSAPP_POLICY_BLOCK';
    new.failure_safe_reason := coalesce(
      nullif(new.failure_safe_reason, ''),
      'Meta blocked this follow-up outside the allowed WhatsApp service window. Automated follow-ups remain blocked until the client replies.'
    );
    new.retry_eligible := false;
    new.retry_at := null;
    new.attention_required := false;
    new.completed_at := coalesce(new.completed_at, clock_timestamp());
  end if;

  if new.status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL')
     and exists(
       select 1
       from public.leads l
       where l.id = new.lead_id
         and l.company_id = new.company_id
         and (
           l.is_spam
           or l.is_test
           or l.bot_paused
           or l.needs_marcus
           or l.boss_approval_needed
           or not l.lead_eligible
           or l.deleted_at is not null
           or l.archived_at is not null
           or l.desk_section <> 'client'
           or l.conversation_route <> 'sales_lead'
           or exists(
             select 1
             from public.whatsapp_blocklist b
             where b.company_id = l.company_id
               and b.lead_id = l.id
               and b.active
           )
         )
     )
  then
    new.status := 'CANCELLED_STATE_CHANGED';
    new.cancel_reason := 'authoritative_automation_control_blocked';
    new.retry_eligible := false;
    new.attention_required := false;
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.reactivate_lead_on_valid_whatsapp_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lead public.leads%rowtype;
  v_old_deleted_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if new.channel <> 'whatsapp'
     or new.direction <> 'inbound'
     or new.company_id is null
     or new.whatsapp_account_id is null
     or coalesce(trim(new.provider_message_id), '') = ''
     or new.provider_message_id ~ '^missing-provider-id-' then
    return new;
  end if;

  select * into v_lead
  from public.leads
  where id = new.lead_id and company_id = new.company_id
  for update;
  if not found then return new; end if;

  if v_lead.deleted_at is not null
     and new.created_at > v_lead.deleted_at
     and v_lead.archived_at is null
     and coalesce(v_lead.is_spam, false) = false
     and coalesce(v_lead.is_test, false) = false
     and not exists (
       select 1 from public.whatsapp_blocklist b
       where b.company_id=new.company_id and b.lead_id=new.lead_id and b.active=true
     )
     and lower(coalesce(v_lead.status, '')) not in ('lost', 'won', 'not suitable')
     and lower(coalesce(v_lead.sales_stage, '')) not in ('lost', 'won')
     and coalesce(v_lead.lead_eligible, false) = true
     and coalesce(v_lead.conversation_route, '') = 'sales_lead'
     and coalesce(v_lead.desk_section, '') = 'client'
  then
    v_old_deleted_at := v_lead.deleted_at;
    update public.leads
       set deleted_at = null, deleted_by = null, delete_reason = null,
           restored_at = v_now, restored_by = 'whatsapp_inbound_reactivation', updated_at = v_now
     where id = new.lead_id and company_id = new.company_id;

    insert into public.audit_logs(
      actor, action, entity_type, entity_id, summary, payload, created_at,
      actor_type, actor_name, before_data, after_data, metadata, company_id
    ) values (
      'system', 'AUTO_RESTORE_ON_WHATSAPP_INBOUND', 'lead', new.lead_id::text,
      'Restored stale-deleted lead after new valid WhatsApp inbound',
      jsonb_build_object('message_id', new.id, 'source', 'whatsapp_inbound_reactivation'),
      v_now, 'SYSTEM', 'CC WhatsApp inbound reconciler',
      jsonb_build_object('deleted_at', v_old_deleted_at),
      jsonb_build_object('deleted_at', null, 'restored_at', v_now),
      jsonb_build_object('rule_version','cc_conversion_reactivation_v3','inbound_message_id',new.id,
        'provider_message_id_present',true,'whatsapp_account_id',new.whatsapp_account_id,
        'hard_delete',false,'terminal_override',false),
      new.company_id
    );
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.reconcile_whatsapp_follow_up_state_from_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_manual_success boolean;
  v_follow_up_success boolean;
begin
  if new.channel = 'whatsapp'
     and new.direction = 'inbound'
     and new.company_id is not null
     and new.whatsapp_account_id is not null
     and coalesce(trim(new.provider_message_id), '') <> ''
     and new.provider_message_id !~ '^missing-provider-id-'
  then
    update public.whatsapp_v16_1_follow_ups
       set status = 'CANCELLED_CLIENT_REPLIED',
           cancel_reason = case
             when status = 'BLOCKED_WHATSAPP_POLICY' then 'client_replied_after_whatsapp_policy_block'
             else 'client_replied'
           end,
           retry_eligible = false,
           retry_at = null,
           attention_required = false,
           attention_resolved_at = case when attention_required then v_now else attention_resolved_at end,
           attention_resolved_reason = case when attention_required then 'CLIENT_REPLIED_AFTER_FAILURE' else attention_resolved_reason end,
           updated_at = v_now,
           completed_at = v_now
     where lead_id = new.lead_id
       and company_id = new.company_id
       and status in ('PLANNED','SCHEDULED','DUE','GENERATING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL','BLOCKED_WHATSAPP_POLICY')
       and new.created_at > case
         when status = 'BLOCKED_WHATSAPP_POLICY' then coalesce(completed_at, updated_at, created_at)
         else coalesce(last_client_message_at, created_at)
       end;

    update public.whatsapp_v16_1_follow_ups
       set attention_required = false,
           attention_resolved_at = v_now,
           attention_resolved_reason = 'CLIENT_REPLIED_AFTER_FAILURE',
           attention_resolved_by = 'whatsapp_inbound_reactivation',
           updated_at = v_now
     where lead_id = new.lead_id
       and company_id = new.company_id
       and attention_required = true
       and attention_resolved_at is null
       and new.created_at > coalesce(completed_at, created_at);
  end if;

  v_manual_success :=
    new.channel = 'whatsapp'
    and new.direction = 'outbound'
    and new.metadata ->> 'manualReply' = 'true'
    and lower(coalesce(new.whatsapp_status, '')) in ('sent','delivered','read')
    and coalesce(trim(new.provider_message_id), '') <> '';

  v_follow_up_success :=
    new.channel = 'whatsapp'
    and new.direction = 'outbound'
    and new.metadata ->> 'v161FollowUp' = 'true'
    and lower(coalesce(new.whatsapp_status, '')) in ('sent','delivered','read')
    and coalesce(trim(new.provider_message_id), '') <> '';

  if v_manual_success then
    update public.whatsapp_v16_1_follow_ups
       set status = 'CANCELLED_HUMAN_TAKEOVER',
           cancel_reason = 'manual_reply_sent',
           retry_eligible = false,
           retry_at = null,
           updated_at = v_now,
           completed_at = v_now
     where lead_id = new.lead_id
       and company_id = new.company_id
       and status in ('PLANNED','SCHEDULED','DUE','GENERATING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL');
  end if;

  if v_manual_success or v_follow_up_success then
    update public.whatsapp_v16_1_follow_ups
       set attention_required = false,
           attention_resolved_at = v_now,
           attention_resolved_reason = case
             when v_manual_success then 'MANUAL_REPLY_SENT_AFTER_FAILURE'
             else 'LATER_FOLLOW_UP_SENT_SUCCESSFULLY'
           end,
           attention_resolved_by = case
             when v_manual_success then 'manual_whatsapp_reply'
             else 'whatsapp_v16_1_follow_up_worker'
           end,
           updated_at = v_now
     where lead_id = new.lead_id
       and company_id = new.company_id
       and attention_required = true
       and attention_resolved_at is null
       and new.created_at > coalesce(completed_at, created_at);
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.schedule_whatsapp_v16_1_follow_up(p_lead_id uuid, p_conversation_id text, p_objective text, p_reason text, p_sequence_number integer, p_schedule_version text, p_idempotency_key text, p_scheduled_at timestamp with time zone, p_last_client_message_at timestamp with time zone, p_context_snapshot jsonb, p_candidate_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.whatsapp_v16_1_follow_ups%rowtype;
  v_row public.whatsapp_v16_1_follow_ups%rowtype;
  v_company_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_lead_id is null
     or coalesce(trim(p_objective), '') = ''
     or p_sequence_number not between 1 and 3
  then
    return jsonb_build_object('allowed', false, 'reason_code', 'invalid_follow_up');
  end if;

  select company_id into v_company_id
  from public.leads
  where id = p_lead_id;

  if v_company_id is null then
    return jsonb_build_object('allowed', false, 'reason_code', 'lead_company_scope_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 16101));

  select * into v_existing
  from public.whatsapp_v16_1_follow_ups
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('allowed', true, 'reason_code', 'idempotent_existing', 'row', to_jsonb(v_existing));
  end if;

  if exists (
    select 1
    from public.whatsapp_v16_1_follow_ups blocked
    where blocked.lead_id = p_lead_id
      and blocked.company_id = v_company_id
      and blocked.status = 'BLOCKED_WHATSAPP_POLICY'
      and (
        blocked.failure_category = 'WHATSAPP_POLICY_BLOCK'
        or position('131047' in coalesce(blocked.provider_error, '')) > 0
      )
      and not exists (
        select 1
        from public.lead_messages m
        where m.lead_id = p_lead_id
          and m.company_id = v_company_id
          and m.channel = 'whatsapp'
          and m.direction = 'inbound'
          and m.whatsapp_account_id is not null
          and coalesce(trim(m.provider_message_id), '') <> ''
          and m.provider_message_id !~ '^missing-provider-id-'
          and m.created_at > coalesce(blocked.completed_at, blocked.updated_at, blocked.created_at)
      )
  ) then
    return jsonb_build_object(
      'allowed', false,
      'reason_code', 'blocked_until_client_reply_after_whatsapp_policy'
    );
  end if;

  if public.whatsapp_v16_1_no_reply_3d_blocked(p_lead_id, v_company_id, v_now) then
    return jsonb_build_object(
      'allowed', false,
      'reason_code', 'blocked_after_3d_no_reply_until_client_reply'
    );
  end if;

  update public.whatsapp_v16_1_follow_ups
     set attention_required = false,
         attention_resolved_at = v_now,
         attention_resolved_reason = 'SUPERSEDED_BY_NEW_ELIGIBLE_CYCLE',
         attention_resolved_by = 'morning_follow_up_scheduler',
         updated_at = v_now
   where lead_id = p_lead_id
     and company_id = v_company_id
     and attention_required = true
     and attention_resolved_at is null
     and coalesce(completed_at, created_at) < v_now - interval '24 hours'
     and failure_category in (
       'SCHEDULER_WINDOW_MISS',
       'VALIDATION_QUALITY_FAILURE',
       'MODEL_INVALID_DECISION',
       'MODEL_PROVIDER_FAILURE',
       'TEMPLATE_WAIT'
     );

  if exists (
    select 1
    from public.whatsapp_v16_1_follow_ups
    where lead_id = p_lead_id
      and company_id = v_company_id
      and attention_required = true
      and attention_resolved_at is null
  ) then
    return jsonb_build_object('allowed', false, 'reason_code', 'sequence_blocked_by_unresolved_failure');
  end if;

  if exists (
    select 1
    from public.whatsapp_v16_1_follow_ups
    where lead_id = p_lead_id
      and company_id = v_company_id
      and status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL')
  ) then
    return jsonb_build_object('allowed', false, 'reason_code', 'another_follow_up_already_scheduled');
  end if;

  insert into public.whatsapp_v16_1_follow_ups(
    company_id, lead_id, conversation_id, objective, reason, sequence_number,
    schedule_version, idempotency_key, scheduled_at, last_client_message_at,
    context_snapshot, candidate_message
  ) values (
    v_company_id, p_lead_id,
    left(coalesce(p_conversation_id, p_lead_id::text), 160),
    left(trim(p_objective), 500),
    left(trim(coalesce(p_reason, 'unfinished_sales_objective')), 160),
    p_sequence_number,
    left(trim(coalesce(p_schedule_version, 'v16.1-follow-up-1')), 160),
    left(trim(p_idempotency_key), 240),
    p_scheduled_at,
    p_last_client_message_at,
    coalesce(p_context_snapshot, '{}'::jsonb),
    left(coalesce(p_candidate_message, ''), 4000)
  )
  returning * into v_row;

  return jsonb_build_object('allowed', true, 'reason_code', 'scheduled', 'row', to_jsonb(v_row));
exception
  when unique_violation then
    select * into v_existing
    from public.whatsapp_v16_1_follow_ups
    where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object('allowed', true, 'reason_code', 'idempotent_existing', 'row', to_jsonb(v_existing));
    end if;

    return jsonb_build_object('allowed', false, 'reason_code', 'another_follow_up_already_scheduled');
end;
$function$;
CREATE OR REPLACE FUNCTION public.whatsapp_v16_1_no_reply_3d_blocked(p_lead_id uuid, p_company_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.whatsapp_v16_1_follow_ups sent
    where sent.lead_id = p_lead_id
      and sent.company_id = p_company_id
      and sent.status = 'SENT'
      and sent.actual_send_at is not null
      and sent.actual_send_at <= coalesce(p_now, clock_timestamp()) - interval '3 days'
      and not exists (
        select 1
        from public.lead_messages m
        where m.lead_id = sent.lead_id
          and m.company_id = sent.company_id
          and m.channel = 'whatsapp'
          and m.direction = 'inbound'
          and m.whatsapp_account_id is not null
          and coalesce(trim(m.provider_message_id), '') <> ''
          and m.provider_message_id !~ '^missing-provider-id-'
          and m.created_at > sent.actual_send_at
      )
  );
$function$;
CREATE OR REPLACE FUNCTION public.apply_whatsapp_delivery_status(p_provider_message_id text, p_status text, p_provider_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_recipient_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT '{}'::jsonb, p_company_id uuid DEFAULT NULL::uuid, p_whatsapp_account_id uuid DEFAULT NULL::uuid, p_receiving_phone_number_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_message public.lead_messages%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_previous_status text;
  v_effective_status text;
  v_current_rank integer := 0;
  v_incoming_rank integer := 0;
  v_event_at timestamptz := coalesce(p_provider_timestamp, now());
  v_applied boolean := false;
  v_reason text := 'duplicate_status';
  v_reconciliation jsonb := '{}'::jsonb;
begin
  if coalesce(trim(p_provider_message_id), '') = ''
     or p_company_id is null
     or p_whatsapp_account_id is null
     or coalesce(trim(p_receiving_phone_number_id), '') = '' then
    return jsonb_build_object('found', false, 'applied', false, 'reason', 'tenant_delivery_scope_missing');
  end if;
  if lower(coalesce(trim(p_status), '')) not in ('sent', 'delivered', 'read', 'failed') then
    return jsonb_build_object('found', false, 'applied', false, 'reason', 'unsupported_delivery_status');
  end if;

  select * into v_account
  from public.whatsapp_accounts
  where id = p_whatsapp_account_id
    and company_id = p_company_id
    and phone_number_id = trim(p_receiving_phone_number_id);
  if not found then
    return jsonb_build_object('found', false, 'applied', false, 'reason', 'delivery_account_scope_denied');
  end if;

  select * into v_message
  from public.lead_messages
  where provider_message_id = trim(p_provider_message_id)
    and company_id = p_company_id
    and whatsapp_account_id = p_whatsapp_account_id
  for update;
  if not found then
    return jsonb_build_object('found', false, 'applied', false, 'reason', 'provider_message_not_found_or_scope_denied');
  end if;

  if not exists (
    select 1
    from public.whatsapp_delivery_events e
    where e.provider_message_id = trim(p_provider_message_id)
      and e.status = lower(trim(p_status))
      and e.provider_timestamp is not distinct from p_provider_timestamp
      and e.company_id = p_company_id
      and e.whatsapp_account_id = p_whatsapp_account_id
  ) then
    insert into public.whatsapp_delivery_events (
      provider_message_id, status, provider_timestamp, recipient_phone, error_code,
      error_title, raw_metadata, company_id, whatsapp_account_id, receiving_phone_number_id
    ) values (
      trim(p_provider_message_id), lower(trim(p_status)), p_provider_timestamp,
      left(coalesce(p_recipient_id, ''), 64), left(coalesce(p_error_code, ''), 100),
      left(coalesce(p_error_message, ''), 300), coalesce(p_raw_payload, '{}'::jsonb),
      p_company_id, p_whatsapp_account_id, left(trim(p_receiving_phone_number_id), 120)
    );
  end if;

  v_previous_status := lower(coalesce(
    nullif(v_message.whatsapp_status, ''),
    nullif(v_message.delivery_status, ''),
    nullif(v_message.status, ''),
    'provider_accepted'
  ));
  v_current_rank := case v_previous_status
    when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_incoming_rank := case lower(p_status)
    when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;

  if v_previous_status = 'failed' and lower(p_status) <> 'failed' then
    v_effective_status := 'failed';
    v_reason := 'failed_terminal_status_preserved';
  elsif lower(p_status) = 'failed' and v_current_rank >= 2 then
    v_effective_status := v_previous_status;
    v_reason := 'failure_evidence_preserved_after_success';
  elsif lower(p_status) = 'failed'
        and v_previous_status = 'sent'
        and v_message.whatsapp_status_at is not null
        and v_event_at < v_message.whatsapp_status_at then
    v_effective_status := v_previous_status;
    v_reason := 'stale_failure_ignored_after_provider_sent';
  elsif lower(p_status) = 'failed' then
    v_effective_status := 'failed';
    v_applied := v_previous_status <> 'failed';
    v_reason := case when v_applied then 'failed_recorded' else 'duplicate_status' end;
  elsif v_incoming_rank > v_current_rank then
    v_effective_status := lower(p_status);
    v_applied := true;
    v_reason := 'status_advanced';
  elsif v_incoming_rank < v_current_rank then
    v_effective_status := v_previous_status;
    v_reason := 'out_of_order_status_ignored';
  else
    v_effective_status := v_previous_status;
    v_reason := 'duplicate_status';
  end if;

  update public.lead_messages
  set whatsapp_status = case when v_applied then v_effective_status else whatsapp_status end,
      status = case when v_applied then v_effective_status else status end,
      delivery_status = case when v_applied then v_effective_status else delivery_status end,
      recipient_phone = coalesce(nullif(p_recipient_id, ''), recipient_phone),
      whatsapp_status_recipient_id = coalesce(nullif(p_recipient_id, ''), whatsapp_status_recipient_id),
      provider_timestamp = case
        when p_provider_timestamp is not null and (provider_timestamp is null or p_provider_timestamp >= provider_timestamp) then p_provider_timestamp
        else provider_timestamp
      end,
      whatsapp_status_at = case when v_applied then v_event_at else whatsapp_status_at end,
      sent_at = case
        when v_applied and lower(p_status) in ('sent', 'delivered', 'read') and sent_at is null then v_event_at
        else sent_at
      end,
      delivered_at = case
        when v_applied and lower(p_status) in ('delivered', 'read') and (delivered_at is null or v_event_at >= delivered_at) then v_event_at
        else delivered_at
      end,
      whatsapp_delivered_at = case
        when v_applied and lower(p_status) in ('delivered', 'read') and (whatsapp_delivered_at is null or v_event_at >= whatsapp_delivered_at) then v_event_at
        else whatsapp_delivered_at
      end,
      read_at = case
        when v_applied and lower(p_status) = 'read' and (read_at is null or v_event_at >= read_at) then v_event_at
        else read_at
      end,
      whatsapp_read_at = case
        when v_applied and lower(p_status) = 'read' and (whatsapp_read_at is null or v_event_at >= whatsapp_read_at) then v_event_at
        else whatsapp_read_at
      end,
      whatsapp_failed_at = case
        when v_applied and lower(p_status) = 'failed' and (whatsapp_failed_at is null or v_event_at >= whatsapp_failed_at) then v_event_at
        else whatsapp_failed_at
      end,
      whatsapp_error_code = case when v_applied and lower(p_status) = 'failed' then coalesce(nullif(p_error_code, ''), whatsapp_error_code) else whatsapp_error_code end,
      whatsapp_error = case when v_applied and lower(p_status) = 'failed' then coalesce(nullif(p_error_message, ''), whatsapp_error) else whatsapp_error end,
      error_message = case when v_applied and lower(p_status) = 'failed' then coalesce(nullif(p_error_message, ''), error_message) else error_message end,
      raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('last_delivery_status', coalesce(p_raw_payload, '{}'::jsonb))
  where id = v_message.id;

  v_reconciliation := public.reconcile_whatsapp_manual_delivery_state(v_message.id, 'WhatsApp delivery webhook');

  return jsonb_build_object(
    'found', true,
    'applied', v_applied,
    'reason', v_reason,
    'message_id', v_message.id,
    'lead_id', v_message.lead_id,
    'previous_status', v_previous_status,
    'current_status', case when v_applied then v_effective_status else v_previous_status end,
    'lead_reconciliation', v_reconciliation
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.authorize_whatsapp_v16_1_follow_up_send(p_follow_up_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.whatsapp_v16_1_follow_ups%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_row
  from public.whatsapp_v16_1_follow_ups
  where follow_up_id = p_follow_up_id
  for update;

  if not found
     or v_row.status <> 'GENERATING'
     or v_row.lease_token <> p_lease_token
     or v_row.lease_expires_at <= v_now
  then
    return jsonb_build_object('send_allowed', false, 'reason_code', 'follow_up_lease_lost');
  end if;

  if public.whatsapp_v16_1_no_reply_3d_blocked(v_row.lead_id, v_row.company_id, v_now) then
    update public.whatsapp_v16_1_follow_ups
       set status = 'EXPIRED',
           cancel_reason = 'no_reply_3d_stop_until_client_reply',
           retry_eligible = false,
           retry_at = null,
           attention_required = false,
           provider_status = 'NOT_CALLED',
           provider_error = 'no_reply_3d_stop',
           updated_at = v_now,
           completed_at = v_now
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object('send_allowed', false, 'reason_code', 'blocked_after_3d_no_reply_until_client_reply');
  end if;

  if exists (
    select 1
    from public.leads l
    where l.id = v_row.lead_id
      and l.company_id = v_row.company_id
      and (
        coalesce(l.bot_paused,false)
        or coalesce(l.needs_marcus,false)
        or coalesce(l.boss_approval_needed,false)
        or coalesce(l.is_spam,false)
        or coalesce(l.is_test,false)
        or l.deleted_at is not null
        or l.archived_at is not null
        or lower(coalesce(l.status,'')) in ('not suitable','lost','won')
        or lower(coalesce(l.sales_stage,'')) in ('lost','won')
      )
  ) then
    update public.whatsapp_v16_1_follow_ups
       set status = 'CANCELLED_STATE_CHANGED',
           cancel_reason = 'lead_state_changed_before_send',
           updated_at = v_now,
           completed_at = v_now
     where follow_up_id = v_row.follow_up_id;
    return jsonb_build_object('send_allowed',false,'reason_code','lead_state_changed_before_send');
  end if;

  if exists (
    select 1
    from public.lead_messages m
    where m.lead_id = v_row.lead_id
      and m.company_id = v_row.company_id
      and m.channel='whatsapp'
      and m.direction='inbound'
      and m.created_at > coalesce(v_row.last_client_message_at, v_row.created_at)
  ) then
    update public.whatsapp_v16_1_follow_ups
       set status='CANCELLED_CLIENT_REPLIED',
           cancel_reason='client_replied_before_send',
           updated_at=v_now,
           completed_at=v_now
     where follow_up_id=v_row.follow_up_id;
    return jsonb_build_object('send_allowed',false,'reason_code','client_replied_before_send');
  end if;

  if not exists (
    select 1
    from public.lead_messages m
    where m.lead_id=v_row.lead_id
      and m.company_id=v_row.company_id
      and m.channel='whatsapp'
      and m.direction='inbound'
      and m.created_at > v_now-interval '24 hours'
  ) then
    return jsonb_build_object('send_allowed',false,'reason_code','outside_whatsapp_24h_window');
  end if;

  update public.whatsapp_v16_1_follow_ups
     set status='SENDING',
         send_lease_token=gen_random_uuid(),
         send_lease_expires_at=v_now+interval '45 seconds',
         updated_at=v_now
   where follow_up_id=v_row.follow_up_id;

  select * into v_row
  from public.whatsapp_v16_1_follow_ups
  where follow_up_id=p_follow_up_id;

  return jsonb_build_object(
    'send_allowed',true,
    'reason_code','send_reserved',
    'send_lease_token',v_row.send_lease_token
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.authorize_whatsapp_v16_1_follow_up_template_send(p_follow_up_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.whatsapp_v16_1_follow_ups%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_row
  from public.whatsapp_v16_1_follow_ups
  where follow_up_id=p_follow_up_id
  for update;

  if not found
     or v_row.status <> 'GENERATING'
     or v_row.lease_token <> p_lease_token
     or v_row.lease_expires_at <= v_now
  then
    return jsonb_build_object('send_allowed',false,'reason_code','follow_up_lease_lost');
  end if;

  if public.whatsapp_v16_1_no_reply_3d_blocked(v_row.lead_id, v_row.company_id, v_now) then
    update public.whatsapp_v16_1_follow_ups
       set status = 'EXPIRED',
           cancel_reason = 'no_reply_3d_stop_until_client_reply',
           retry_eligible = false,
           retry_at = null,
           attention_required = false,
           provider_status = 'NOT_CALLED',
           provider_error = 'no_reply_3d_stop',
           updated_at = v_now,
           completed_at = v_now
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object('send_allowed', false, 'reason_code', 'blocked_after_3d_no_reply_until_client_reply');
  end if;

  if coalesce(v_row.template_status,'') <> 'APPROVED'
     or coalesce(trim(v_row.template_name),'') = ''
  then
    return jsonb_build_object('send_allowed',false,'reason_code','template_not_approved');
  end if;

  if exists (
    select 1
    from public.leads l
    where l.id=v_row.lead_id
      and l.company_id=v_row.company_id
      and (
        coalesce(l.bot_paused,false)
        or coalesce(l.needs_marcus,false)
        or coalesce(l.boss_approval_needed,false)
        or coalesce(l.is_spam,false)
        or coalesce(l.is_test,false)
        or l.deleted_at is not null
        or l.archived_at is not null
        or lower(coalesce(l.status,'')) in ('not suitable','lost','won')
        or lower(coalesce(l.sales_stage,'')) in ('lost','won')
      )
  ) then
    update public.whatsapp_v16_1_follow_ups
       set status='CANCELLED_STATE_CHANGED',
           cancel_reason='lead_state_changed_before_send',
           updated_at=v_now,
           completed_at=v_now
     where follow_up_id=v_row.follow_up_id;
    return jsonb_build_object('send_allowed',false,'reason_code','lead_state_changed_before_send');
  end if;

  if exists (
    select 1
    from public.lead_messages m
    where m.lead_id=v_row.lead_id
      and m.company_id=v_row.company_id
      and m.channel='whatsapp'
      and m.direction='inbound'
      and m.created_at > coalesce(v_row.last_client_message_at,v_row.created_at)
  ) then
    update public.whatsapp_v16_1_follow_ups
       set status='CANCELLED_CLIENT_REPLIED',
           cancel_reason='client_replied_before_send',
           updated_at=v_now,
           completed_at=v_now
     where follow_up_id=v_row.follow_up_id;
    return jsonb_build_object('send_allowed',false,'reason_code','client_replied_before_send');
  end if;

  update public.whatsapp_v16_1_follow_ups
     set status='SENDING',
         send_lease_token=gen_random_uuid(),
         send_lease_expires_at=v_now+interval '45 seconds',
         updated_at=v_now
   where follow_up_id=v_row.follow_up_id;

  select * into v_row
  from public.whatsapp_v16_1_follow_ups
  where follow_up_id=p_follow_up_id;

  return jsonb_build_object(
    'send_allowed',true,
    'reason_code','template_send_reserved',
    'send_lease_token',v_row.send_lease_token
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.claim_whatsapp_v16_1_follow_up_batch(p_now timestamp with time zone, p_limit integer DEFAULT 5)
 RETURNS SETOF whatsapp_v16_1_follow_ups
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.whatsapp_v16_1_follow_ups%rowtype;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  for v_row in
    select f.*
    from public.whatsapp_v16_1_follow_ups f
    where (f.status in ('SCHEDULED','DUE') and f.scheduled_at <= v_now)
       or (f.status = 'RETRY_SCHEDULED'
           and f.retry_eligible = true
           and f.retry_attempt_count = 1
           and f.retry_at <= v_now)
       or (f.status = 'WAITING_TEMPLATE_APPROVAL'
           and f.template_retry_at is not null
           and f.template_retry_at <= v_now
           and (f.template_retry_until is null or f.template_retry_until >= v_now))
    order by coalesce(f.template_retry_at, f.retry_at, f.scheduled_at), f.created_at
    limit greatest(1, least(coalesce(p_limit, 5), 10))
    for update skip locked
  loop
    if public.whatsapp_v16_1_no_reply_3d_blocked(v_row.lead_id, v_row.company_id, v_now) then
      update public.whatsapp_v16_1_follow_ups
         set status = 'EXPIRED',
             cancel_reason = 'no_reply_3d_stop_until_client_reply',
             retry_eligible = false,
             retry_at = null,
             attention_required = false,
             provider_status = case when provider_status = 'NOT_CALLED' then 'NOT_CALLED' else provider_status end,
             provider_error = case when provider_status = 'NOT_CALLED' then 'no_reply_3d_stop' else provider_error end,
             updated_at = v_now,
             completed_at = v_now
       where follow_up_id = v_row.follow_up_id;
      continue;
    end if;

    if exists (
      select 1
      from public.whatsapp_v16_1_follow_ups blocked
      where blocked.lead_id = v_row.lead_id
        and blocked.company_id = v_row.company_id
        and blocked.follow_up_id <> v_row.follow_up_id
        and blocked.status = 'BLOCKED_WHATSAPP_POLICY'
        and (
          blocked.failure_category = 'WHATSAPP_POLICY_BLOCK'
          or position('131047' in coalesce(blocked.provider_error, '')) > 0
        )
        and not exists (
          select 1
          from public.lead_messages m
          where m.lead_id = v_row.lead_id
            and m.company_id = v_row.company_id
            and m.channel = 'whatsapp'
            and m.direction = 'inbound'
            and m.whatsapp_account_id is not null
            and coalesce(trim(m.provider_message_id), '') <> ''
            and m.provider_message_id !~ '^missing-provider-id-'
            and m.created_at > coalesce(blocked.completed_at, blocked.updated_at, blocked.created_at)
        )
    ) then
      update public.whatsapp_v16_1_follow_ups
         set status = 'BLOCKED_WHATSAPP_POLICY',
             cancel_reason = 'blocked_by_prior_meta_24h_until_client_reply',
             failure_category = 'WHATSAPP_POLICY_BLOCK',
             failure_safe_reason = 'A prior Meta WhatsApp policy block is still active. Automated follow-ups remain blocked until the client replies.',
             provider_status = 'NOT_CALLED',
             provider_error = 'prior_whatsapp_policy_block_active',
             retry_eligible = false,
             retry_at = null,
             attention_required = false,
             updated_at = v_now,
             completed_at = v_now
       where follow_up_id = v_row.follow_up_id;
      continue;
    end if;

    if exists (
      select 1
      from public.leads l
      where l.id = v_row.lead_id
        and l.company_id = v_row.company_id
        and (
          coalesce(l.bot_paused, false)
          or coalesce(l.needs_marcus, false)
          or coalesce(l.boss_approval_needed, false)
          or coalesce(l.is_spam, false)
          or coalesce(l.is_test, false)
          or l.deleted_at is not null
          or l.archived_at is not null
          or lower(coalesce(l.status,'')) in ('not suitable','lost','won')
          or lower(coalesce(l.sales_stage,'')) in ('lost','won')
        )
    ) then
      update public.whatsapp_v16_1_follow_ups
         set status = 'CANCELLED_STATE_CHANGED',
             cancel_reason = 'lead_state_blocked',
             retry_eligible = false,
             retry_at = null,
             attention_required = false,
             attention_resolved_at = v_now,
             attention_resolved_reason = 'STATE_CHANGED_BEFORE_RETRY',
             updated_at = v_now,
             completed_at = v_now
       where follow_up_id = v_row.follow_up_id;
      continue;
    end if;

    if exists (
      select 1
      from public.lead_messages m
      where m.lead_id = v_row.lead_id
        and m.company_id = v_row.company_id
        and m.direction = 'inbound'
        and m.created_at > coalesce(v_row.last_client_message_at, v_row.created_at)
    ) then
      update public.whatsapp_v16_1_follow_ups
         set status = 'CANCELLED_CLIENT_REPLIED',
             cancel_reason = 'client_replied_before_due',
             retry_eligible = false,
             retry_at = null,
             attention_required = false,
             attention_resolved_at = v_now,
             attention_resolved_reason = 'CLIENT_REPLIED_AFTER_FAILURE',
             updated_at = v_now,
             completed_at = v_now
       where follow_up_id = v_row.follow_up_id;
      continue;
    end if;

    update public.whatsapp_v16_1_follow_ups
       set status = 'GENERATING',
           lease_token = gen_random_uuid(),
           lease_expires_at = v_now + interval '90 seconds',
           updated_at = v_now
     where follow_up_id = v_row.follow_up_id
       and status in ('SCHEDULED','DUE','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL')
    returning * into v_row;

    return next v_row;
  end loop;

  return;
end;
$function$;
CREATE OR REPLACE FUNCTION public.complete_whatsapp_v16_1_follow_up(p_follow_up_id uuid, p_send_lease_token uuid, p_status text, p_provider_status text, p_response_id text, p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric, p_final_message text, p_provider_message_id text, p_provider_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_status not in ('SENT','PROVIDER_FAILED') then return false; end if;
  update public.whatsapp_v16_1_follow_ups
  set status = p_status, provider_status = left(coalesce(p_provider_status,''),120), terra_response_id = left(coalesce(p_response_id,''),240),
      input_tokens = greatest(0,coalesce(p_input_tokens,0)), output_tokens = greatest(0,coalesce(p_output_tokens,0)), estimated_cost_usd = greatest(0,coalesce(p_cost_usd,0)),
      final_message = left(coalesce(p_final_message,''),4000), provider_message_id = left(coalesce(p_provider_message_id,''),240), provider_error = left(coalesce(p_provider_error,''),500),
      actual_send_at = case when p_status='SENT' then clock_timestamp() else null end,
      retry_eligible = case when p_status='SENT' then false else retry_eligible end,
      retry_at = case when p_status='SENT' then null else retry_at end,
      attention_required = case when p_status='SENT' then false else attention_required end,
      attention_resolved_at = case when p_status='SENT' and attention_required then clock_timestamp() else attention_resolved_at end,
      attention_resolved_reason = case when p_status='SENT' and attention_required then 'LATER_FOLLOW_UP_SENT_SUCCESSFULLY' else attention_resolved_reason end,
      updated_at = clock_timestamp(), completed_at = clock_timestamp()
  where follow_up_id=p_follow_up_id and status='SENDING' and send_lease_token=p_send_lease_token;
  return found;
end;
$function$;
CREATE OR REPLACE FUNCTION public.record_whatsapp_v16_1_follow_up_send_failure(p_follow_up_id uuid, p_send_lease_token uuid, p_category text, p_safe_reason text, p_provider_status text, p_provider_error text, p_final_message text, p_retry_eligible boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.whatsapp_v16_1_follow_ups%rowtype;
  v_now timestamptz := clock_timestamp();
  v_local timestamp;
  v_retry_at timestamptz;
  v_policy_block boolean;
begin
  select * into v_row
  from public.whatsapp_v16_1_follow_ups
  where follow_up_id = p_follow_up_id
  for update;

  if not found or v_row.status <> 'SENDING' or v_row.send_lease_token <> p_send_lease_token then
    return jsonb_build_object('recorded', false, 'reason_code', 'send_lease_lost');
  end if;

  v_policy_block :=
    upper(coalesce(trim(p_category), '')) = 'WHATSAPP_POLICY_BLOCK'
    or position('131047' in coalesce(p_provider_error, '')) > 0
    or position('131047' in coalesce(p_provider_status, '')) > 0;

  if v_policy_block then
    update public.whatsapp_v16_1_follow_ups
       set status = 'BLOCKED_WHATSAPP_POLICY',
           cancel_reason = 'blocked_until_client_reply_after_meta_24h',
           failure_category = 'WHATSAPP_POLICY_BLOCK',
           failure_safe_reason = left(
             coalesce(
               nullif(trim(p_safe_reason), ''),
               'Meta blocked this follow-up outside the allowed WhatsApp service window. Automated follow-ups remain blocked until the client replies.'
             ),
             240
           ),
           provider_status = left(coalesce(p_provider_status, ''), 120),
           provider_error = left(coalesce(p_provider_error, ''), 500),
           final_message = left(coalesce(p_final_message, ''), 4000),
           retry_eligible = false,
           retry_at = null,
           attention_required = false,
           attention_resolved_at = null,
           attention_resolved_reason = null,
           updated_at = v_now,
           completed_at = v_now
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object(
      'recorded', true,
      'retry_scheduled', false,
      'reason_code', 'blocked_until_client_reply_after_whatsapp_policy'
    );
  end if;

  v_local := v_now at time zone 'Asia/Singapore';

  if p_retry_eligible
     and v_row.retry_attempt_count = 0
     and coalesce(trim(p_final_message), '') <> ''
  then
    v_retry_at := v_now + interval '15 minutes';
    while extract(isodow from (v_retry_at at time zone 'Asia/Singapore')) in (6,7)
       or extract(hour from (v_retry_at at time zone 'Asia/Singapore')) < 9
       or extract(hour from (v_retry_at at time zone 'Asia/Singapore')) >= 18
    loop
      v_local := (v_retry_at at time zone 'Asia/Singapore');
      v_local := date_trunc('day', v_local) + interval '1 day' + interval '9 hours';
      while extract(isodow from v_local) in (6,7) loop
        v_local := date_trunc('day', v_local) + interval '1 day' + interval '9 hours';
      end loop;
      v_retry_at := v_local at time zone 'Asia/Singapore';
    end loop;

    update public.whatsapp_v16_1_follow_ups
       set status = 'RETRY_SCHEDULED',
           failure_category = p_category,
           failure_safe_reason = left(p_safe_reason, 240),
           provider_status = left(p_provider_status, 120),
           provider_error = left(p_provider_error, 500),
           final_message = left(p_final_message, 4000),
           retry_eligible = true,
           retry_attempt_count = 1,
           retry_at = v_retry_at,
           attention_required = false,
           attention_resolved_at = null,
           attention_resolved_reason = null,
           updated_at = v_now,
           completed_at = null
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object('recorded', true, 'retry_scheduled', true, 'retry_at', v_retry_at);
  end if;

  update public.whatsapp_v16_1_follow_ups f
     set status = 'PROVIDER_FAILED',
         failure_category = left(coalesce(p_category, 'UNKNOWN_FAILURE'), 80),
         failure_safe_reason = left(coalesce(p_safe_reason, 'The WhatsApp delivery outcome needs review.'), 240),
         provider_status = left(coalesce(p_provider_status, ''), 120),
         provider_error = left(coalesce(p_provider_error, ''), 500),
         final_message = left(coalesce(p_final_message, ''), 4000),
         retry_eligible = false,
         retry_at = null,
         attention_required = not exists (
           select 1 from public.leads l where l.id = f.lead_id and l.is_test = true
         ),
         updated_at = v_now,
         completed_at = v_now
   where f.follow_up_id = v_row.follow_up_id;

  return jsonb_build_object('recorded', true, 'retry_scheduled', false);
end;
$function$;