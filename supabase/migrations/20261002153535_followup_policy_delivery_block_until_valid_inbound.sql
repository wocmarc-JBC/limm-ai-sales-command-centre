-- Production follow-up stop: actual Meta failure history, late callbacks and valid inbound reopening.


-- Only actual client messages reopen a policy stop. Prefer the provider event time,
-- so a delayed/replayed old webhook cannot masquerade as a new reply.
create or replace function public.whatsapp_v16_1_latest_valid_inbound(
  p_lead_id uuid, p_company_id uuid
) returns timestamptz language sql stable set search_path = '' as $function$
  select max(coalesce(m.provider_timestamp, m.sent_at, m.created_at))
  from public.lead_messages m
  join public.whatsapp_accounts a
    on a.id = m.whatsapp_account_id and a.company_id = m.company_id
  where m.lead_id = p_lead_id and m.company_id = p_company_id
    and m.channel = 'whatsapp' and m.direction = 'inbound'
    and coalesce(trim(m.provider_message_id), '') <> ''
    and m.provider_message_id !~ '^missing-provider-id-'
    and lower(coalesce(m.whatsapp_status, m.delivery_status, m.status, 'received')) <> 'failed'
    and coalesce(m.provider_timestamp, m.sent_at, m.created_at) <= clock_timestamp();
$function$;

-- One source of truth for historical, synchronous and asynchronous Meta policy
-- rejections. Outbound activity and template approval never reset this evidence.
create or replace function public.whatsapp_v16_1_policy_block_state(
  p_lead_id uuid, p_company_id uuid
) returns jsonb language sql stable set search_path = '' as $function$
  with inbound as (
    select public.whatsapp_v16_1_latest_valid_inbound(p_lead_id, p_company_id) as replied_at
  ), evidence as (
    select coalesce(m.sent_at, m.created_at) as blocked_at,
           coalesce(nullif(m.whatsapp_error_code, ''),
             substring(coalesce(m.whatsapp_error, '') || ' ' || coalesce(m.error_message, '')
                       from '(131047|131049|130472)')) as error_code
    from public.lead_messages m
    where m.lead_id = p_lead_id and m.company_id = p_company_id
      and m.channel = 'whatsapp' and m.direction = 'outbound'
      and lower(coalesce(m.whatsapp_status, m.delivery_status, m.status, '')) = 'failed'
      and (m.whatsapp_error_code in ('131047','131049','130472')
           or (coalesce(m.whatsapp_error, '') || ' ' || coalesce(m.error_message, ''))
                ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)')
    union all
    select coalesce(
             nullif(f.context_snapshot #>> '{followUpPolicyBlock,blocked_at}', '')::timestamptz,
             f.actual_send_at, f.completed_at, f.created_at),
           coalesce(nullif(f.context_snapshot #>> '{followUpPolicyBlock,error_code}', ''),
             substring(coalesce(f.provider_error, '') || ' ' || coalesce(f.provider_status, '')
                       from '(131047|131049|130472)'), 'WHATSAPP_POLICY_BLOCK')
    from public.whatsapp_v16_1_follow_ups f
    where f.lead_id = p_lead_id and f.company_id = p_company_id
      and (f.status = 'BLOCKED_WHATSAPP_POLICY'
           or upper(coalesce(f.failure_category, '')) = 'WHATSAPP_POLICY_BLOCK'
           or (coalesce(f.provider_error, '') || ' ' || coalesce(f.provider_status, ''))
                ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)')
  ), active as (
    select e.* from evidence e cross join inbound i
    where i.replied_at is null or i.replied_at <= e.blocked_at
    order by e.blocked_at desc limit 1
  )
  select coalesce(
    (select jsonb_build_object('blocked', true, 'blocked_at', a.blocked_at,
       'error_code', a.error_code,
       'reason_code', 'blocked_until_client_reply_after_whatsapp_policy') from active a),
    jsonb_build_object('blocked', false, 'reason_code', 'no_active_whatsapp_policy_block')
  );
$function$;

create or replace function public.whatsapp_v16_1_no_reply_3d_blocked(
  p_lead_id uuid, p_company_id uuid, p_now timestamptz default clock_timestamp()
) returns boolean language sql stable set search_path = '' as $function$
  select exists (
    select 1 from public.whatsapp_v16_1_follow_ups f
    where f.lead_id = p_lead_id and f.company_id = p_company_id
      and f.status = 'SENT' and f.actual_send_at is not null
      and f.actual_send_at <= coalesce(p_now, clock_timestamp()) - interval '72 hours'
      and coalesce(public.whatsapp_v16_1_latest_valid_inbound(p_lead_id, p_company_id),
                   '-infinity'::timestamptz) <= f.actual_send_at
  );
$function$;


CREATE OR REPLACE FUNCTION public.cancel_whatsapp_v16_1_follow_ups_for_inbound(p_lead_id uuid, p_inbound_created_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
  v_company_id uuid;
  v_inbound_at timestamptz;
begin
  select company_id into v_company_id from public.leads where id = p_lead_id;
  v_inbound_at := public.whatsapp_v16_1_latest_valid_inbound(p_lead_id, v_company_id);
  if v_inbound_at is null then return 0; end if;
  update public.whatsapp_v16_1_follow_ups
     set status = 'CANCELLED_CLIENT_REPLIED',
         cancel_reason = case
           when status = 'BLOCKED_WHATSAPP_POLICY' then 'client_replied_after_whatsapp_policy_block'
           else 'client_replied'
         end,
         retry_eligible = false,
         retry_at = null,
         template_retry_at = null, template_retry_until = null,
         lease_token = null, lease_expires_at = null,
         send_lease_token = null, send_lease_expires_at = null,
         attention_required = false,
         attention_resolved_at = case when attention_required then v_now else attention_resolved_at end,
         attention_resolved_reason = case when attention_required then 'CLIENT_REPLIED_AFTER_FAILURE' else attention_resolved_reason end,
         updated_at = v_now,
         completed_at = v_now
   where lead_id = p_lead_id and company_id = v_company_id
     and status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING','RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL','BLOCKED_WHATSAPP_POLICY')
     and v_inbound_at > case
       when status = 'BLOCKED_WHATSAPP_POLICY' then coalesce(
         nullif(context_snapshot #>> '{followUpPolicyBlock,blocked_at}', '')::timestamptz,
         actual_send_at, completed_at, created_at)
       else coalesce(last_client_message_at, created_at)
     end;

  get diagnostics v_count = row_count;

  update public.whatsapp_v16_1_follow_ups
     set attention_required = false,
         attention_resolved_at = v_now,
         attention_resolved_reason = 'CLIENT_REPLIED_AFTER_FAILURE',
         attention_resolved_by = 'whatsapp_inbound',
         updated_at = v_now
   where lead_id = p_lead_id and company_id = v_company_id
     and attention_required = true
     and attention_resolved_at is null
     and v_inbound_at > coalesce(completed_at, created_at);

  return v_count;
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
    perform public.cancel_whatsapp_v16_1_follow_ups_for_inbound(
      new.lead_id, coalesce(new.provider_timestamp, new.sent_at, new.created_at));
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

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_follow_up_control()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_policy jsonb;
begin
  -- Meta error 131047 / WhatsApp policy blocks are terminal for automation
  -- until a later valid client inbound reopens the conversation.
  if new.status in ('PROVIDER_FAILED','RETRY_SCHEDULED')
     and (
       upper(coalesce(new.failure_category, '')) = 'WHATSAPP_POLICY_BLOCK'
       or (coalesce(new.provider_error, '') || ' ' || coalesce(new.provider_status, ''))
            ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)'
     )
  then
    new.context_snapshot := coalesce(new.context_snapshot, '{}'::jsonb) ||
      jsonb_build_object('followUpPolicyBlock', coalesce(new.context_snapshot->'followUpPolicyBlock',
        jsonb_build_object('blocked', true,
          'blocked_at', coalesce(new.actual_send_at, new.completed_at, clock_timestamp()),
          'error_code', coalesce(substring(coalesce(new.provider_error, '') || ' ' ||
            coalesce(new.provider_status, '') from '(131047|131049|130472)'), 'WHATSAPP_POLICY_BLOCK'))));
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

  if new.status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING','SENT',
                    'RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL') then
    v_policy := public.whatsapp_v16_1_policy_block_state(new.lead_id, new.company_id);
    if (v_policy->>'blocked')::boolean then
      new.status := 'BLOCKED_WHATSAPP_POLICY';
      new.failure_category := 'WHATSAPP_POLICY_BLOCK';
      new.failure_safe_reason := 'Meta policy blocked automation. Wait for a new client reply.';
      new.cancel_reason := 'blocked_until_client_reply_after_whatsapp_policy';
      new.context_snapshot := coalesce(new.context_snapshot, '{}'::jsonb) ||
        jsonb_build_object('followUpPolicyBlock', v_policy);
      new.completed_at := coalesce(new.completed_at, clock_timestamp());
    elsif new.status <> 'SENT' and
          public.whatsapp_v16_1_no_reply_3d_blocked(new.lead_id, new.company_id, clock_timestamp()) then
      new.status := 'EXPIRED';
      new.cancel_reason := 'no_reply_3d_stop_until_client_reply';
      new.completed_at := coalesce(new.completed_at, clock_timestamp());
    end if;
  end if;
  if new.status in ('BLOCKED_WHATSAPP_POLICY','EXPIRED','CANCELLED_CLIENT_REPLIED') then
    new.retry_eligible := false; new.retry_at := null;
    new.template_retry_at := null; new.template_retry_until := null;
    new.lease_token := null; new.lease_expires_at := null;
    new.send_lease_token := null; new.send_lease_expires_at := null;
    new.attention_required := false;
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

  if public.whatsapp_v16_1_policy_block_state(p_lead_id, v_company_id)->>'blocked' = 'true' then
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


  select * into v_existing
  from public.whatsapp_v16_1_follow_ups
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('allowed', true, 'reason_code', 'idempotent_existing', 'row', to_jsonb(v_existing));
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

  return jsonb_build_object('allowed', v_row.status = 'SCHEDULED',
    'reason_code', case when v_row.status = 'SCHEDULED' then 'scheduled'
      else coalesce(v_row.cancel_reason, 'follow_up_state_blocked') end, 'row', to_jsonb(v_row));
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
     or p_lease_token is null
     or v_row.lease_token is distinct from p_lease_token
     or (v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now)
  then
    return jsonb_build_object('send_allowed', false, 'reason_code', 'follow_up_lease_lost');
  end if;

  if public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)->>'blocked' = 'true' then

    update public.whatsapp_v16_1_follow_ups
       set status = 'BLOCKED_WHATSAPP_POLICY',
           cancel_reason = 'blocked_until_client_reply_after_whatsapp_policy',
           failure_category = 'WHATSAPP_POLICY_BLOCK',
           failure_safe_reason = 'Meta policy blocked automation. Wait for a new client reply.',
           context_snapshot = context_snapshot || jsonb_build_object('followUpPolicyBlock',
             public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)),
           retry_eligible = false, retry_at = null,
           template_retry_at = null, template_retry_until = null,
           lease_token = null, lease_expires_at = null,
           send_lease_token = null, send_lease_expires_at = null,
           attention_required = false,
           provider_status = 'NOT_CALLED', updated_at = v_now, completed_at = v_now
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object('send_allowed', false,
      'reason_code', 'blocked_until_client_reply_after_whatsapp_policy');
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
     or p_lease_token is null
     or v_row.lease_token is distinct from p_lease_token
     or (v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now)
  then
    return jsonb_build_object('send_allowed',false,'reason_code','follow_up_lease_lost');
  end if;

  if public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)->>'blocked' = 'true' then

    update public.whatsapp_v16_1_follow_ups
       set status = 'BLOCKED_WHATSAPP_POLICY',
           cancel_reason = 'blocked_until_client_reply_after_whatsapp_policy',
           failure_category = 'WHATSAPP_POLICY_BLOCK',
           failure_safe_reason = 'Meta policy blocked automation. Wait for a new client reply.',
           context_snapshot = context_snapshot || jsonb_build_object('followUpPolicyBlock',
             public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)),
           retry_eligible = false, retry_at = null,
           template_retry_at = null, template_retry_until = null,
           lease_token = null, lease_expires_at = null,
           send_lease_token = null, send_lease_expires_at = null,
           attention_required = false,
           provider_status = 'NOT_CALLED', updated_at = v_now, completed_at = v_now
     where follow_up_id = v_row.follow_up_id;

    return jsonb_build_object('send_allowed', false,
      'reason_code', 'blocked_until_client_reply_after_whatsapp_policy');
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

    if public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)->>'blocked' = 'true' then

    update public.whatsapp_v16_1_follow_ups
       set status = 'BLOCKED_WHATSAPP_POLICY',
           cancel_reason = 'blocked_until_client_reply_after_whatsapp_policy',
           failure_category = 'WHATSAPP_POLICY_BLOCK',
           failure_safe_reason = 'Meta policy blocked automation. Wait for a new client reply.',
           context_snapshot = context_snapshot || jsonb_build_object('followUpPolicyBlock',
             public.whatsapp_v16_1_policy_block_state(v_row.lead_id, v_row.company_id)),
           retry_eligible = false, retry_at = null,
           template_retry_at = null, template_retry_until = null,
           lease_token = null, lease_expires_at = null,
           send_lease_token = null, send_lease_expires_at = null,
           attention_required = false,
           provider_status = 'NOT_CALLED', updated_at = v_now, completed_at = v_now
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

    if found and v_row.status = 'GENERATING' then return next v_row; end if;
  end loop;

  return;
end;
$function$;

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
  if public.whatsapp_v16_1_policy_block_state(p_lead_id, p_company_id)->>'blocked' = 'true' then
    return jsonb_build_object('send_allowed',false,
      'reason_code','blocked_until_client_reply_after_whatsapp_policy');
  end if;
  if p_kind = 'FOLLOW_UP' and
     public.whatsapp_v16_1_no_reply_3d_blocked(p_lead_id, p_company_id, clock_timestamp()) then
    return jsonb_build_object('send_allowed',false,
      'reason_code','blocked_after_3d_no_reply_until_client_reply');
  end if;
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

  if not found or v_row.status <> 'SENDING' or p_send_lease_token is null or v_row.send_lease_token is distinct from p_send_lease_token then
    return jsonb_build_object('recorded', false, 'reason_code', 'send_lease_lost');
  end if;

  v_policy_block :=
    upper(coalesce(trim(p_category), '')) = 'WHATSAPP_POLICY_BLOCK'
    or (coalesce(p_provider_error, '') || ' ' || coalesce(p_provider_status, ''))
         ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)';

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


create or replace function public.reconcile_whatsapp_follow_up_delivery_failure()
returns trigger language plpgsql set search_path = '' as $function$
declare v_policy jsonb; v_replied boolean; v_count integer := 0; v_pending integer := 0;
begin
  if new.channel <> 'whatsapp' or new.direction <> 'outbound'
     or new.company_id is null
     or lower(coalesce(new.whatsapp_status, new.delivery_status, new.status, '')) <> 'failed'
     or not (coalesce(new.whatsapp_error_code, '') in ('131047','131049','130472')
       or (coalesce(new.whatsapp_error, '') || ' ' || coalesce(new.error_message, ''))
            ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)') then return new; end if;

  v_replied := coalesce(public.whatsapp_v16_1_latest_valid_inbound(new.lead_id, new.company_id),
                       '-infinity'::timestamptz) > coalesce(new.sent_at, new.created_at);
  v_policy := jsonb_build_object('blocked', not v_replied,
    'blocked_at', coalesce(new.sent_at, new.created_at),
    'error_code', coalesce(nullif(new.whatsapp_error_code, ''),
      substring(coalesce(new.whatsapp_error, '') || ' ' || coalesce(new.error_message, '')
        from '(131047|131049|130472)')),
    'reason_code', 'blocked_until_client_reply_after_whatsapp_policy');

  update public.whatsapp_v16_1_follow_ups f
     set status = case when v_replied then 'CANCELLED_CLIENT_REPLIED' else 'BLOCKED_WHATSAPP_POLICY' end,
         cancel_reason = case when v_replied then 'client_replied_after_whatsapp_policy_block'
                             else 'blocked_until_client_reply_after_whatsapp_policy' end,
         failure_category = 'WHATSAPP_POLICY_BLOCK',
         failure_safe_reason = 'Meta rejected delivery. Automated follow-ups wait for a new client reply.',
         provider_status = 'FAILED',
         provider_error = v_policy->>'error_code',
         context_snapshot = f.context_snapshot || jsonb_build_object('followUpPolicyBlock', v_policy),
         retry_eligible = false, retry_at = null,
         template_retry_at = null, template_retry_until = null,
         lease_token = null, lease_expires_at = null,
         send_lease_token = null, send_lease_expires_at = null,
         attention_required = false, updated_at = clock_timestamp(),
         completed_at = coalesce(f.completed_at, clock_timestamp())
   where f.lead_id = new.lead_id and f.company_id = new.company_id
     and ((coalesce(new.provider_message_id, '') <> '' and f.provider_message_id = new.provider_message_id)
       or f.follow_up_id::text = new.metadata->>'followUpId'
       or f.follow_up_id::text = new.metadata->>'follow_up_id')
     and (f.status is distinct from case when v_replied then 'CANCELLED_CLIENT_REPLIED' else 'BLOCKED_WHATSAPP_POLICY' end
       or f.provider_status is distinct from 'FAILED'
       or f.provider_error is distinct from v_policy->>'error_code');
  get diagnostics v_count = row_count;

  v_policy := public.whatsapp_v16_1_policy_block_state(new.lead_id, new.company_id);
  if v_policy->>'blocked' = 'true' then
    update public.whatsapp_v16_1_follow_ups f
       set status = 'BLOCKED_WHATSAPP_POLICY',
           cancel_reason = 'blocked_until_client_reply_after_whatsapp_policy',
           failure_category = 'WHATSAPP_POLICY_BLOCK',
           failure_safe_reason = 'Meta policy blocked automation. Wait for a new client reply.',
           context_snapshot = f.context_snapshot || jsonb_build_object('followUpPolicyBlock', v_policy),
           retry_eligible = false, retry_at = null,
           template_retry_at = null, template_retry_until = null,
           lease_token = null, lease_expires_at = null,
           send_lease_token = null, send_lease_expires_at = null,
           attention_required = false, updated_at = clock_timestamp(), completed_at = clock_timestamp()
     where f.lead_id = new.lead_id and f.company_id = new.company_id
       and f.status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING',
                        'RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL');
    get diagnostics v_pending = row_count;
  end if;

  if v_count + v_pending > 0 then
    insert into public.audit_logs(actor, action, entity_type, entity_id, summary, payload, company_id)
    values ('system','WHATSAPP_FOLLOW_UP_POLICY_DELIVERY_RECONCILED','lead',new.lead_id::text,
      'Reconciled Meta policy failure and stopped follow-up automation',
      jsonb_build_object('message_id',new.id,'error_code',new.whatsapp_error_code,
        'linked_follow_ups_corrected',v_count,'pending_follow_ups_stopped',v_pending,
        'provider_called',false,'rule_version','followup_policy_gate_v2'),new.company_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists lead_messages_reconcile_whatsapp_follow_up_delivery_failure on public.lead_messages;
create trigger lead_messages_reconcile_whatsapp_follow_up_delivery_failure
after insert or update of whatsapp_status, delivery_status, status, whatsapp_error_code,
  whatsapp_error, error_message, provider_message_id, metadata
on public.lead_messages for each row
execute function public.reconcile_whatsapp_follow_up_delivery_failure();

drop trigger if exists enforce_whatsapp_v16_1_follow_up_control on public.whatsapp_v16_1_follow_ups;
create trigger enforce_whatsapp_v16_1_follow_up_control
before insert or update of status, failure_category, provider_error, provider_status,
  retry_eligible, retry_at, template_retry_at, template_retry_until,
  lease_token, send_lease_token, lease_expires_at, send_lease_expires_at
on public.whatsapp_v16_1_follow_ups for each row
execute function public.enforce_whatsapp_follow_up_control();



revoke all on function public.whatsapp_v16_1_latest_valid_inbound(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_v16_1_latest_valid_inbound(uuid,uuid) to service_role;
revoke all on function public.whatsapp_v16_1_policy_block_state(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_v16_1_policy_block_state(uuid,uuid) to service_role;
revoke all on function public.reconcile_whatsapp_follow_up_delivery_failure() from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_follow_up_delivery_failure() to service_role;



-- Replay persisted failure evidence through the same delivery reconciler. Duplicate
-- callbacks are idempotent, and these updates do not invoke WhatsApp or any provider.
update public.lead_messages m
   set whatsapp_error_code = m.whatsapp_error_code
 where m.channel = 'whatsapp' and m.direction = 'outbound'
   and lower(coalesce(m.whatsapp_status, m.delivery_status, m.status, '')) = 'failed'
   and m.whatsapp_error_code in ('131047','131049','130472');

-- Catch previously pending rows even where the historical error is a follow-up row.
update public.whatsapp_v16_1_follow_ups f
   set status = f.status
 where f.status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING',
                    'RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL');
