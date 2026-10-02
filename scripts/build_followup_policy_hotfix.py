"""Build the exact production SQL patch from the captured function definitions."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
baseline = (root / "docs/production-hotfixes/2026-10-02-followup-policy-baseline.sql").read_text()
functions = {
    match.group(1): match.group(0)
    for match in re.finditer(
        r"CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$function\$\s*;", baseline
    )
}
def replace_once(source, old, new):
    assert source.count(old) == 1, old[:120]
    return source.replace(old, new, 1)

helpers = r"""
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
"""

cancel = functions["cancel_whatsapp_v16_1_follow_ups_for_inbound"]
cancel = replace_once(cancel, "  v_now timestamptz := clock_timestamp();", """  v_now timestamptz := clock_timestamp();
  v_company_id uuid;
  v_inbound_at timestamptz;""")
cancel = replace_once(cancel, "begin\n  update", """begin
  select company_id into v_company_id from public.leads where id = p_lead_id;
  v_inbound_at := public.whatsapp_v16_1_latest_valid_inbound(p_lead_id, v_company_id);
  if v_inbound_at is null then return 0; end if;
  update""")
cancel = cancel.replace("p_inbound_created_at >", "v_inbound_at >")
cancel = cancel.replace("'GENERATING','RETRY_SCHEDULED'", "'GENERATING','SENDING','RETRY_SCHEDULED'")
cancel = cancel.replace("coalesce(completed_at, updated_at, created_at)", """coalesce(
         nullif(context_snapshot #>> '{followUpPolicyBlock,blocked_at}', '')::timestamptz,
         actual_send_at, completed_at, created_at)""")
cancel = cancel.replace("   where lead_id = p_lead_id", "   where lead_id = p_lead_id and company_id = v_company_id")
cancel = cancel.replace("         retry_at = null,", """         retry_at = null,
         template_retry_at = null, template_retry_until = null,
         lease_token = null, lease_expires_at = null,
         send_lease_token = null, send_lease_expires_at = null,""", 1)

message_state = functions["reconcile_whatsapp_follow_up_state_from_message"]
start = message_state.index("    update public.whatsapp_v16_1_follow_ups")
end = message_state.index("\n  v_manual_success :=")
message_state = message_state[:start] + """    perform public.cancel_whatsapp_v16_1_follow_ups_for_inbound(
      new.lead_id, coalesce(new.provider_timestamp, new.sent_at, new.created_at));
  end if;
""" + message_state[end:]

enforce = functions["enforce_whatsapp_follow_up_control"]
enforce = replace_once(enforce, "AS $function$\nbegin", """AS $function$
declare v_policy jsonb;
begin""")
enforce = enforce.replace("position('131047' in coalesce(new.provider_error, '')) > 0",
  """(coalesce(new.provider_error, '') || ' ' || coalesce(new.provider_status, ''))
            ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)'""")
enforce = replace_once(enforce, "    new.status := 'BLOCKED_WHATSAPP_POLICY';", """    new.context_snapshot := coalesce(new.context_snapshot, '{}'::jsonb) ||
      jsonb_build_object('followUpPolicyBlock', coalesce(new.context_snapshot->'followUpPolicyBlock',
        jsonb_build_object('blocked', true,
          'blocked_at', coalesce(new.actual_send_at, new.completed_at, clock_timestamp()),
          'error_code', coalesce(substring(coalesce(new.provider_error, '') || ' ' ||
            coalesce(new.provider_status, '') from '(131047|131049|130472)'), 'WHATSAPP_POLICY_BLOCK'))));
    new.status := 'BLOCKED_WHATSAPP_POLICY';""")
enforce = replace_once(enforce, "\n  return new;", """
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
  return new;""")

policy_check = """public.whatsapp_v16_1_policy_block_state({lead}, {company})->>'blocked' = 'true'"""
schedule = functions["schedule_whatsapp_v16_1_follow_up"]
old_start = schedule.index("  if exists (\n    select 1\n    from public.whatsapp_v16_1_follow_ups blocked")
old_end = schedule.index("\n  update public.whatsapp_v16_1_follow_ups", old_start)
gates = schedule[old_start:old_end]
cond_end = gates.index("  ) then")
gates = "  if " + policy_check.format(lead="p_lead_id", company="v_company_id") + " then" + gates[cond_end+len("  ) then"):]
schedule = schedule[:old_start] + schedule[old_end:]
lock_end = schedule.index("\n\n", schedule.index("  perform pg_advisory_xact_lock"))
schedule = schedule[:lock_end] + "\n\n" + gates + schedule[lock_end:]
schedule = replace_once(schedule, "'allowed', true, 'reason_code', 'scheduled', 'row', to_jsonb(v_row)",
  """'allowed', v_row.status = 'SCHEDULED',
    'reason_code', case when v_row.status = 'SCHEDULED' then 'scheduled'
      else coalesce(v_row.cancel_reason, 'follow_up_state_blocked') end, 'row', to_jsonb(v_row)""")

stop_update = """
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
"""
auths = []
for name in ("authorize_whatsapp_v16_1_follow_up_send", "authorize_whatsapp_v16_1_follow_up_template_send"):
    source = functions[name]
    at = source.index("  if public.whatsapp_v16_1_no_reply_3d_blocked")
    source = source[:at] + "  if " + policy_check.format(lead="v_row.lead_id",company="v_row.company_id") + " then\n" + stop_update + """
    return jsonb_build_object('send_allowed', false,
      'reason_code', 'blocked_until_client_reply_after_whatsapp_policy');
  end if;

""" + source[at:]
    # NULL tokens are invalid. SQL's NULL comparison must not silently allow a lease.
    source = source.replace("v_row.lease_token <> p_lease_token", "p_lease_token is null\n     or v_row.lease_token is distinct from p_lease_token")
    source = source.replace("v_row.lease_expires_at <= v_now", "(v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now)")
    auths.append(source)

claim = functions["claim_whatsapp_v16_1_follow_up_batch"]
start = claim.index("    if exists (\n      select 1\n      from public.whatsapp_v16_1_follow_ups blocked")
end = claim.index("\n    if exists (", start+10)
claim = claim[:start] + "    if " + policy_check.format(lead="v_row.lead_id",company="v_row.company_id") + " then\n" + stop_update + """
      continue;
    end if;
""" + claim[end:]
claim = replace_once(claim, "    return next v_row;", "    if found and v_row.status = 'GENERATING' then return next v_row; end if;")

generic = functions["authorize_automated_whatsapp_send"]
generic = replace_once(generic,
  "  if not found then return jsonb_build_object('send_allowed',false,'reason_code','lead_scope_missing'); end if;",
  """  if not found then return jsonb_build_object('send_allowed',false,'reason_code','lead_scope_missing'); end if;
  if public.whatsapp_v16_1_policy_block_state(p_lead_id, p_company_id)->>'blocked' = 'true' then
    return jsonb_build_object('send_allowed',false,
      'reason_code','blocked_until_client_reply_after_whatsapp_policy');
  end if;
  if p_kind = 'FOLLOW_UP' and
     public.whatsapp_v16_1_no_reply_3d_blocked(p_lead_id, p_company_id, clock_timestamp()) then
    return jsonb_build_object('send_allowed',false,
      'reason_code','blocked_after_3d_no_reply_until_client_reply');
  end if;""")

failure = functions["record_whatsapp_v16_1_follow_up_send_failure"]
failure = failure.replace("v_row.send_lease_token <> p_send_lease_token",
  "p_send_lease_token is null or v_row.send_lease_token is distinct from p_send_lease_token")
failure = replace_once(failure,
  """or position('131047' in coalesce(p_provider_error, '')) > 0
    or position('131047' in coalesce(p_provider_status, '')) > 0""",
  """or (coalesce(p_provider_error, '') || ' ' || coalesce(p_provider_status, ''))
         ~ '(^|[^0-9])(131047|131049|130472)([^0-9]|$)'""")

delivery = r"""
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
"""

grants = r"""
revoke all on function public.whatsapp_v16_1_latest_valid_inbound(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_v16_1_latest_valid_inbound(uuid,uuid) to service_role;
revoke all on function public.whatsapp_v16_1_policy_block_state(uuid,uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_v16_1_policy_block_state(uuid,uuid) to service_role;
revoke all on function public.reconcile_whatsapp_follow_up_delivery_failure() from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_follow_up_delivery_failure() to service_role;
"""

backfill = r"""
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
"""

parts = [helpers, cancel, message_state, enforce, schedule, *auths, claim, generic, failure,
         delivery, grants, backfill]
migration = next((root/"supabase/migrations").glob("*_followup_policy_delivery_block_until_valid_inbound.sql"))
migration.write_text("-- Production follow-up stop: actual Meta failure history, late callbacks and valid inbound reopening.\n\n" + "\n\n".join(parts))
print(migration)
print("Updated", len(parts), "SQL sections")
