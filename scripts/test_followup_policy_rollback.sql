-- No provider calls. All synthetic rows and their audit/recovery records roll back
-- in a PL/pgSQL subtransaction, including when a test fails.
do $qa$
declare
  v_seed public.leads%rowtype;
  v_lead public.leads%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_company uuid; v_id uuid; v_first uuid; v_pending uuid; v_message uuid;
  v_token uuid; v_send_token uuid; v_code text; v_result jsonb; v_policy jsonb;
  v_now timestamptz := clock_timestamp(); v_old timestamptz; v_inbound timestamptz;
  v_count int; v_audits int;
  v_checks text[] := '{}';
begin
  begin
    select a.* into v_account from public.whatsapp_accounts a
    join public.company_runtime_controls c on c.company_id=a.company_id
    join public.company_platform_profiles p on p.company_id=a.company_id
    where a.status='CONNECTED' and a.outbound_enabled and c.followups_enabled
      and c.whatsapp_outbound_enabled and p.lifecycle='LIVE' limit 1;
    assert found, 'Missing enabled account for rollback QA';
    v_company := v_account.company_id;
    select l.* into v_seed from public.leads l
    where l.company_id=v_company and l.lead_eligible and not l.is_spam and not l.is_test
      and l.desk_section='client' and l.conversation_route='sales_lead' limit 1;
    assert found, 'Missing scoped seed for rollback QA';

    foreach v_code in array array['131047','131049','130472'] loop
      v_id := gen_random_uuid();
      select * into v_lead from jsonb_populate_record(null::public.leads,
        to_jsonb(v_seed) || jsonb_build_object('id',v_id,'client_name','CC policy rollback QA',
          'phone','CC-POLICY-ROLLBACK-'||v_id,'is_spam',false,'is_test',false,
          'bot_paused',false,'needs_marcus',false,'boss_approval_needed',false,
          'lead_eligible',true,'deleted_at',null,'archived_at',null,'duplicate_of',null,
          'desk_section','client','desk_section_manual_override',true,
          'conversation_route','sales_lead','status','New Enquiry','sales_stage','New',
          'created_at',v_now,'updated_at',v_now));
      insert into public.leads select v_lead.*;
      v_old := v_now-interval '8 days';
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,
        direction,channel,body,provider_message_id,provider_timestamp,created_at)
      values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
        'qa-inbound-'||v_id,v_old,v_old);
      v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review',
        'rollback QA',1,'qa','qa-first-'||v_id,v_now,v_old,'{}','QA');
      assert v_result->>'allowed'='true', 'Clean contact should schedule';
      v_checks := array_append(v_checks,v_code||':initial_schedule');
      v_first := (v_result#>>'{row,follow_up_id}')::uuid;
      v_token := gen_random_uuid();
      update public.whatsapp_v16_1_follow_ups set status='GENERATING',lease_token=v_token,
        lease_expires_at=clock_timestamp()+interval '5 minutes',
        template_status='APPROVED',template_name='qa-template' where follow_up_id=v_first;
      v_result := public.authorize_whatsapp_v16_1_follow_up_template_send(v_first,v_token);
      assert v_result->>'send_allowed'='true', 'Clean approved template should reserve';
      v_checks := array_append(v_checks,v_code||':initial_template_authorization');
      v_send_token := (v_result->>'send_lease_token')::uuid;
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,
        channel,body,provider_message_id,whatsapp_status,metadata,created_at)
      values(v_id,v_company,v_account.id,'outbound','whatsapp','QA',
        'qa-outbound-'||v_id,'provider_accepted',
        jsonb_build_object('v161FollowUp',true,'followUpId',v_first,'deliveryKind','template'),
        v_now-interval '10 minutes') returning id into v_message;
      assert public.complete_whatsapp_v16_1_follow_up(v_first,v_send_token,'SENT',
        'PROVIDER_ACCEPTED','',0,0,0,'QA','qa-outbound-'||v_id,''),
        'Accepted send should complete before asynchronous callback';
      v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review',
        'rollback QA',2,'qa','qa-pending-'||v_id,v_now+interval '1 day',v_old,'{}','QA');
      assert v_result->>'allowed'='true', 'Pending sequence setup';
      v_pending := (v_result#>>'{row,follow_up_id}')::uuid;
      update public.whatsapp_v16_1_follow_ups set status='GENERATING',lease_token=v_token,
        lease_expires_at=clock_timestamp()+interval '5 minutes',
        template_status='APPROVED',template_name='qa-template' where follow_up_id=v_pending;
      v_result := public.apply_whatsapp_delivery_status('qa-outbound-'||v_id,'failed',v_now,
        null,v_code,'Meta policy rejection','{}',v_company,v_account.id,v_account.phone_number_id);
      assert v_result->>'found'='true' and v_result->>'current_status'='failed', 'Webhook failure applied';
      v_checks := array_append(v_checks,v_code||':actual_delivery_rpc');
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_first
        and status='BLOCKED_WHATSAPP_POLICY' and provider_status='FAILED' and not retry_eligible),
        'Late rejection must correct the SENT follow-up';
      v_checks := array_append(v_checks,v_code||':late_failure_corrects_sent');
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_pending
        and status='BLOCKED_WHATSAPP_POLICY' and lease_token is null
        and send_lease_token is null and template_retry_at is null and not retry_eligible),
        'Late rejection must cancel pending leases/retries';
      v_checks := array_append(v_checks,v_code||':pending_leases_cancelled');
      v_policy := public.whatsapp_v16_1_policy_block_state(v_id,v_company);
      assert v_policy->>'blocked'='true' and
        (v_policy->>'blocked_at')::timestamptz=v_now-interval '10 minutes',
        'Keep the original send attempt cutoff';
      v_checks := array_append(v_checks,v_code||':original_cutoff_preserved');
      v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review',
        'rollback QA',1,'qa','qa-denied-'||v_id,v_now+interval '2 days',v_old,'{}','QA');
      assert v_result->>'allowed'='false', 'Future cycle must be denied';
      v_checks := array_append(v_checks,v_code||':future_schedule_denied');
      v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review',
        'rollback QA',1,'qa','qa-first-'||v_id,v_now,v_old,'{}','QA');
      assert v_result->>'allowed'='false', 'Idempotency must not bypass policy gate';
      v_checks := array_append(v_checks,v_code||':idempotency_denied');
      assert not exists(select 1 from public.claim_whatsapp_v16_1_follow_up_batch(
        v_now+interval '3 days',10) where lead_id=v_id), 'Claim must not return blocked contact';
      v_checks := array_append(v_checks,v_code||':claim_denied');
      v_result := public.authorize_automated_whatsapp_send(v_company,v_id,v_account.id,'FOLLOW_UP');
      assert v_result->>'send_allowed'='false' and
        v_result->>'reason_code'='blocked_until_client_reply_after_whatsapp_policy',
        'Generic send gate must see message failure history';
      v_checks := array_append(v_checks,v_code||':generic_send_denied');
      assert public.authorize_whatsapp_v16_1_follow_up_send(v_pending,v_token)->>'send_allowed'='false',
        'Free-form final send denied';
      v_checks := array_append(v_checks,v_code||':freeform_denied');
      assert public.authorize_whatsapp_v16_1_follow_up_template_send(v_pending,v_token)->>'send_allowed'='false',
        'Approved-template final send denied';
      v_checks := array_append(v_checks,v_code||':approved_template_denied');
      update public.whatsapp_v16_1_follow_ups set status='RETRY_SCHEDULED',retry_eligible=true,
        retry_at=v_now+interval '15 minutes' where follow_up_id=v_pending;
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_pending
        and status='BLOCKED_WHATSAPP_POLICY' and not retry_eligible and retry_at is null),
        'Retry mutation cannot reopen policy block';
      v_checks := array_append(v_checks,v_code||':retry_mutation_denied');
      update public.whatsapp_v16_1_follow_ups set status='WAITING_TEMPLATE_APPROVAL',
        template_status='APPROVED',template_retry_at=v_now+interval '1 day' where follow_up_id=v_pending;
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_pending
        and status='BLOCKED_WHATSAPP_POLICY' and template_retry_at is null), 'Template retry cannot reopen';
      v_checks := array_append(v_checks,v_code||':template_retry_denied');
      select count(*) into v_audits from public.audit_logs where company_id=v_company
        and entity_id=v_id::text and action='WHATSAPP_FOLLOW_UP_POLICY_DELIVERY_RECONCILED';
      perform public.apply_whatsapp_delivery_status('qa-outbound-'||v_id,'failed',v_now,
        null,v_code,'Meta policy rejection','{}',v_company,v_account.id,v_account.phone_number_id);
      assert v_audits=(select count(*) from public.audit_logs where company_id=v_company
        and entity_id=v_id::text and action='WHATSAPP_FOLLOW_UP_POLICY_DELIVERY_RECONCILED'),
        'Duplicate callbacks should be idempotent';
      v_checks := array_append(v_checks,v_code||':duplicate_callback_idempotent');
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,
        channel,body,provider_message_id,whatsapp_status,metadata,created_at)
      values(v_id,v_company,v_account.id,'outbound','whatsapp','QA','qa-manual-'||v_id,
        'read','{"manualReply":true}',clock_timestamp());
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
        'Manual/outbound success does not reopen';
      v_checks := array_append(v_checks,v_code||':manual_outbound_does_not_reopen');
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
        body,provider_message_id,provider_timestamp,created_at)
      values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
        'qa-stale-inbound-'||v_id,v_old+interval '1 hour',clock_timestamp());
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
        'Receipt time cannot reopen old inbound replay';
      v_checks := array_append(v_checks,v_code||':stale_inbound_replay_denied');
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
        body,provider_message_id,provider_timestamp,created_at)
      values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
        'missing-provider-id-qa-'||v_id,clock_timestamp(),clock_timestamp());
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
        'Synthetic missing-provider message cannot reopen';
      v_checks := array_append(v_checks,v_code||':invalid_inbound_denied');
      assert public.whatsapp_v16_1_policy_block_state(v_id,gen_random_uuid())->>'blocked'='false',
        'Failure evidence is tenant scoped';
      v_checks := array_append(v_checks,v_code||':tenant_isolation');
      v_inbound := clock_timestamp();
      insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
        body,provider_message_id,provider_timestamp,created_at)
      values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
        'qa-new-inbound-'||v_id,v_inbound,v_inbound);
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='false',
        'Genuine new client inbound reopens policy gate';
      v_checks := array_append(v_checks,v_code||':genuine_inbound_reopens');
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_first
        and status='CANCELLED_CLIENT_REPLIED'), 'Block status reconciles after real reply';
      v_checks := array_append(v_checks,v_code||':block_status_cleared');
      v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review',
        'rollback QA',1,'qa','qa-reopened-'||v_id,clock_timestamp(),v_inbound,'{}','QA');
      assert v_result->>'allowed'='true', 'Schedule allowed after real client reply';
      v_checks := array_append(v_checks,v_code||':schedule_reopened');
      v_pending := (v_result#>>'{row,follow_up_id}')::uuid;
      update public.whatsapp_v16_1_follow_ups set status='GENERATING',lease_token=v_token,
        lease_expires_at=clock_timestamp()+interval '5 minutes',template_status='APPROVED',
        template_name='qa-template' where follow_up_id=v_pending;
      assert public.authorize_whatsapp_v16_1_follow_up_send(v_pending,null)->>'send_allowed'='false',
        'Null lease token cannot authorize';
      v_checks := array_append(v_checks,v_code||':null_lease_denied');
      assert public.authorize_whatsapp_v16_1_follow_up_send(v_pending,v_token)->>'send_allowed'='true',
        'Free-form allowed in reopened service window';
      v_checks := array_append(v_checks,v_code||':freeform_reopened');
      update public.whatsapp_v16_1_follow_ups set status='GENERATING',lease_token=v_token,
        lease_expires_at=clock_timestamp()+interval '5 minutes' where follow_up_id=v_pending;
      assert public.authorize_whatsapp_v16_1_follow_up_template_send(v_pending,v_token)->>'send_allowed'='true',
        'Approved template allowed after reply';
      v_checks := array_append(v_checks,v_code||':template_reopened');
      perform public.apply_whatsapp_delivery_status('qa-outbound-'||v_id,'failed',v_now,
        null,v_code,'Meta policy rejection','{}',v_company,v_account.id,v_account.phone_number_id);
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='false',
        'A delayed duplicate failure from before real reply must not re-block';
      v_checks := array_append(v_checks,v_code||':late_duplicate_does_not_reblock');
    end loop;

    -- A historical message rejection must block even when no linked follow-up row
    -- exists. This is the production bypass that the first fix missed.
    v_id := gen_random_uuid();
    select * into v_lead from jsonb_populate_record(null::public.leads,to_jsonb(v_seed)||
      jsonb_build_object('id',v_id,'client_name','CC policy rollback QA',
        'phone','CC-POLICY-ROLLBACK-'||v_id,'bot_paused',false,'needs_marcus',false,
        'boss_approval_needed',false,'is_spam',false,'is_test',false,'lead_eligible',true,
        'deleted_at',null,'archived_at',null,'duplicate_of',null,'desk_section','client',
        'desk_section_manual_override',true,'conversation_route','sales_lead','status','New Enquiry','sales_stage','New'));
    insert into public.leads select v_lead.*;
    insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
      body,provider_message_id,whatsapp_status,whatsapp_error_code,created_at)
    values(v_id,v_company,v_account.id,'outbound','whatsapp','QA','qa-history-'||v_id,
      'failed','131047',v_now-interval '1 day');
    assert not exists(select 1 from public.whatsapp_v16_1_follow_ups where lead_id=v_id),
      'Historical message-only setup';
    assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
      'Message history alone must enforce block';
    v_checks := array_append(v_checks,'history:message_only_block');
    v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review','QA',
      1,'qa','qa-history-denied-'||v_id,v_now,null,'{}','QA');
    assert v_result->>'allowed'='false', 'Scheduler denied from message-only history';
    v_checks := array_append(v_checks,'history:scheduler_denied');
    assert public.authorize_automated_whatsapp_send(v_company,v_id,v_account.id,'FOLLOW_UP')->>'send_allowed'='false',
      'Generic final gate denied from message-only history';
    v_checks := array_append(v_checks,'history:generic_denied');
    insert into public.whatsapp_v16_1_follow_ups(company_id,lead_id,conversation_id,objective,
      reason,sequence_number,schedule_version,idempotency_key,scheduled_at,status)
    values(v_company,v_id,v_id::text,'review','QA',1,'qa','qa-direct-history-'||v_id,v_now,'GENERATING')
      returning follow_up_id into v_first;
    assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_first
      and status='BLOCKED_WHATSAPP_POLICY' and lease_token is null), 'Direct insert cannot bypass history';
    v_checks := array_append(v_checks,'history:direct_insert_denied');
    insert into public.lead_messages(lead_id,company_id,direction,channel,body,
      provider_message_id,provider_timestamp,created_at)
    values(v_id,v_company,'inbound','whatsapp','Condo renovation enquiry',
      'qa-null-account-'||v_id,clock_timestamp(),clock_timestamp());
    assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
      'Inbound without verified account must not reopen';
    v_checks := array_append(v_checks,'history:null_account_denied');
    insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
      body,provider_message_id,provider_timestamp,created_at)
    values(v_id,v_company,v_account.id,'internal','whatsapp','QA',
      'qa-internal-'||v_id,clock_timestamp(),clock_timestamp());
    assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
      'Internal event must not reopen';
    v_checks := array_append(v_checks,'history:internal_event_denied');

    -- Synchronous provider errors must also stop, regardless of the category
    -- supplied by a caller, and never create the 15-minute retry.
    foreach v_code in array array['131047','131049'] loop
      v_id := gen_random_uuid();
      select * into v_lead from jsonb_populate_record(null::public.leads,to_jsonb(v_seed)||
        jsonb_build_object('id',v_id,'client_name','CC policy rollback QA',
          'phone','CC-POLICY-ROLLBACK-'||v_id,'bot_paused',false,'needs_marcus',false,
          'boss_approval_needed',false,'is_spam',false,'is_test',false,'lead_eligible',true,
          'deleted_at',null,'archived_at',null,'duplicate_of',null,'desk_section','client',
          'desk_section_manual_override',true,'conversation_route','sales_lead','status','New Enquiry','sales_stage','New'));
      insert into public.leads select v_lead.*;
      v_send_token := gen_random_uuid();
      insert into public.whatsapp_v16_1_follow_ups(company_id,lead_id,conversation_id,objective,
        reason,sequence_number,schedule_version,idempotency_key,scheduled_at,status,send_lease_token,
        send_lease_expires_at)
      values(v_company,v_id,v_id::text,'review','QA',1,'qa','qa-sync-'||v_id,v_now,'SENDING',
        v_send_token,clock_timestamp()+interval '1 minute') returning follow_up_id into v_first;
      v_result := public.record_whatsapp_v16_1_follow_up_send_failure(v_first,v_send_token,
        'PROVIDER_FAILURE','Meta rejected','FAILED','{"code":'||v_code||'}','QA',true);
      assert v_result->>'recorded'='true' and v_result->>'retry_scheduled'='false',
        'Misclassified synchronous rejection must not schedule a retry';
      v_checks := array_append(v_checks,v_code||':sync_failure_no_retry');
      assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_first
        and status='BLOCKED_WHATSAPP_POLICY' and not retry_eligible and send_lease_token is null),
        'Synchronous rejection must block and clear lease';
      v_checks := array_append(v_checks,v_code||':sync_failure_terminal');
      assert public.whatsapp_v16_1_policy_block_state(v_id,v_company)->>'blocked'='true',
        'Synchronous block is authoritative without message row';
      v_checks := array_append(v_checks,v_code||':sync_failure_durable');
    end loop;

    -- 72-hour ceiling remains independent of template approval and uses the same
    -- actual inbound timestamp semantics.
    v_id := gen_random_uuid();
    select * into v_lead from jsonb_populate_record(null::public.leads,to_jsonb(v_seed)||
      jsonb_build_object('id',v_id,'client_name','CC policy rollback QA',
        'phone','CC-POLICY-ROLLBACK-'||v_id,'bot_paused',false,'needs_marcus',false,
        'boss_approval_needed',false,'is_spam',false,'is_test',false,'lead_eligible',true,
        'deleted_at',null,'archived_at',null,'duplicate_of',null,'desk_section','client',
        'desk_section_manual_override',true,'conversation_route','sales_lead','status','New Enquiry','sales_stage','New'));
    insert into public.leads select v_lead.*;
    v_old := v_now-interval '100 hours';
    insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
      body,provider_message_id,provider_timestamp,created_at)
    values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
      'qa-72h-inbound-'||v_id,v_old,v_old);
    insert into public.whatsapp_v16_1_follow_ups(company_id,lead_id,conversation_id,
      objective,reason,sequence_number,schedule_version,idempotency_key,scheduled_at,
      last_client_message_at,status,actual_send_at)
    values(v_company,v_id,v_id::text,'review','QA',1,'qa','qa-72h-sent-'||v_id,
      v_now-interval '71 hours',v_old,'SENT',v_now-interval '71 hours') returning follow_up_id into v_first;
    assert not public.whatsapp_v16_1_no_reply_3d_blocked(v_id,v_company,v_now), 'Before 72h is allowed';
    v_checks := array_append(v_checks,'72h:before_boundary');
    assert public.whatsapp_v16_1_no_reply_3d_blocked(v_id,v_company,v_now+interval '1 hour'), 'At 72h stops';
    v_checks := array_append(v_checks,'72h:exact_boundary');
    v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review','QA',
      2,'qa','qa-72h-pending-'||v_id,v_now,v_old,'{}','QA');
    assert v_result->>'allowed'='true', 'Pending no-reply setup';
    v_pending := (v_result#>>'{row,follow_up_id}')::uuid; v_token := gen_random_uuid();
    update public.whatsapp_v16_1_follow_ups set status='GENERATING',lease_token=v_token,
      lease_expires_at=clock_timestamp()+interval '5 minutes',template_status='APPROVED',
      template_name='qa-template' where follow_up_id=v_pending;
    update public.whatsapp_v16_1_follow_ups set actual_send_at=v_now-interval '73 hours'
      where follow_up_id=v_first;
    v_result := public.authorize_whatsapp_v16_1_follow_up_template_send(v_pending,v_token);
    assert v_result->>'send_allowed'='false' and
      v_result->>'reason_code'='blocked_after_3d_no_reply_until_client_reply', 'Template cannot bypass 72h';
    v_checks := array_append(v_checks,'72h:template_denied');
    assert exists(select 1 from public.whatsapp_v16_1_follow_ups where follow_up_id=v_pending
      and status='EXPIRED' and not retry_eligible and send_lease_token is null
      and provider_status='NOT_CALLED'), '72h expiry before provider';
    v_checks := array_append(v_checks,'72h:pending_expired_no_provider');
    assert public.authorize_whatsapp_v16_1_follow_up_send(v_pending,v_token)->>'send_allowed'='false',
      'Free-form cannot bypass the 72h stop';
    v_checks := array_append(v_checks,'72h:freeform_denied');
    v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review','QA',
      1,'qa','qa-72h-denied-'||v_id,v_now,v_old,'{}','QA');
    assert v_result->>'allowed'='false', '72h scheduler denied';
    v_checks := array_append(v_checks,'72h:scheduler_denied');
    assert public.authorize_automated_whatsapp_send(v_company,v_id,v_account.id,'FOLLOW_UP')->>'send_allowed'='false',
      'Generic send cannot bypass 72h';
    v_checks := array_append(v_checks,'72h:generic_denied');
    insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
      body,provider_message_id,provider_timestamp,created_at)
    values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
      'qa-72h-stale-'||v_id,v_old+interval '1 hour',clock_timestamp());
    assert public.whatsapp_v16_1_no_reply_3d_blocked(v_id,v_company,clock_timestamp()), 'Replay cannot reset 72h clock';
    v_checks := array_append(v_checks,'72h:stale_replay_denied');
    v_inbound := clock_timestamp();
    insert into public.lead_messages(lead_id,company_id,whatsapp_account_id,direction,channel,
      body,provider_message_id,provider_timestamp,created_at)
    values(v_id,v_company,v_account.id,'inbound','whatsapp','Condo renovation enquiry',
      'qa-72h-reopen-'||v_id,v_inbound,v_inbound);
    assert not public.whatsapp_v16_1_no_reply_3d_blocked(v_id,v_company,clock_timestamp()), 'Real reply resets 72h';
    v_checks := array_append(v_checks,'72h:real_reply_reopens');
    v_result := public.schedule_whatsapp_v16_1_follow_up(v_id,v_id::text,'review','QA',
      1,'qa','qa-72h-reopen-'||v_id,v_now,v_inbound,'{}','QA');
    assert v_result->>'allowed'='true', 'Schedule resumes after 72h real reply';
    v_checks := array_append(v_checks,'72h:schedule_reopens');

    raise exception using errcode='ZQ001',message='CC_ROLLBACK_QA_SUCCESS';
  exception when sqlstate 'ZQ001' then
    raise notice 'CC policy rollback QA: % assertions PASS',cardinality(v_checks);
  end;
  assert not exists(select 1 from public.leads where client_name='CC policy rollback QA'),
    'Synthetic QA rows must roll back';
  perform set_config('cc.followup_policy_qa_result',
    jsonb_build_object('passed',true,'assertions',cardinality(v_checks),
      'checks',to_jsonb(v_checks),'fixtures_rolled_back',true,'provider_calls',0)::text,false);
end;
$qa$;
select current_setting('cc.followup_policy_qa_result')::jsonb as qa_result;
