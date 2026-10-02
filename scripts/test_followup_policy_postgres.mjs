import fs from "node:fs";
import path from "node:path";
const { PGlite } = await import(process.env.CC_PGLITE_MODULE || "@electric-sql/pglite");
const root = path.resolve(import.meta.dirname, "..");
const pg = await PGlite.create();
try {
  await pg.exec("create role anon; create role authenticated; create role service_role;");
  await pg.exec(fs.readFileSync(path.join(root, "scripts/fixtures/followup-policy-schema.sql"), "utf8"));
  await pg.exec(`
    alter table public.leads add primary key(id);
    alter table public.whatsapp_accounts add primary key(id);
    alter table public.companies add primary key(id);
    alter table public.lead_messages add primary key(id);
    alter table public.whatsapp_v16_1_follow_ups add primary key(follow_up_id);
    alter table public.whatsapp_v16_1_follow_ups add unique(idempotency_key);
    create unique index active_followup on public.whatsapp_v16_1_follow_ups(lead_id)
      where status in ('PLANNED','SCHEDULED','DUE','GENERATING','SENDING',
                       'RETRY_SCHEDULED','WAITING_TEMPLATE_APPROVAL');
    create or replace function public.reconcile_whatsapp_manual_delivery_state(uuid,text)
      returns jsonb language sql as $$ select '{}'::jsonb; $$;
    insert into public.companies(slug,name) values ('cc-replay','CC local replay');
    insert into public.whatsapp_accounts(company_id,display_name,phone_number_id)
      select id,'Local replay account','local-replay-number-id' from public.companies;
    insert into public.company_platform_profiles(company_id,lifecycle)
      select id,'LIVE' from public.companies;
    insert into public.company_runtime_controls(company_id,ai_auto_reply_enabled,
      followups_enabled,whatsapp_outbound_enabled,whatsapp_auto_reply_enabled)
      select id,true,true,true,true from public.companies;
    insert into public.leads(company_id,client_name,phone,is_spam,is_test,bot_paused,
      needs_marcus,boss_approval_needed,lead_eligible,conversation_route,desk_section,status)
      select id,'Local replay seed','local-replay-seed',false,false,false,false,false,
        true,'sales_lead','client','New Enquiry' from public.companies;
  `);
  await pg.exec(fs.readFileSync(path.join(root,"docs/production-hotfixes/2026-10-02-followup-policy-baseline.sql"),"utf8"));
  await pg.exec(`
    create trigger enforce_whatsapp_v16_1_follow_up_control before insert or update of status
    on public.whatsapp_v16_1_follow_ups for each row execute function public.enforce_whatsapp_follow_up_control();
    create trigger lead_messages_reconcile_whatsapp_follow_up_state after insert
    on public.lead_messages for each row execute function public.reconcile_whatsapp_follow_up_state_from_message();
  `);
  // Reproduce the original bug before applying the patch.
  const reproduction = await pg.exec(`
    begin;
    insert into public.lead_messages(lead_id,company_id,direction,channel,body,whatsapp_status,
      whatsapp_error_code,created_at)
      select id,company_id,'outbound','whatsapp','replay','failed','131047',
             clock_timestamp()-interval '1 day' from public.leads;
    select public.schedule_whatsapp_v16_1_follow_up(id,id::text,'review','replay',1,
      'local-replay','before-patch',clock_timestamp(),null,'{}','replay')->>'allowed' as bypass
      from public.leads;
    rollback;
  `);
  if (reproduction.flatMap(r=>r.rows).find(r=>r.bypass)?.bypass !== "true") {
    throw new Error("Historical message-level rejection bypass was not reproduced");
  }
  console.log("BEFORE: historical message-level 131047 bypass reproduced");
  const migration = fs.readdirSync(path.join(root,"supabase/migrations"))
    .find(x=>x.endsWith("_followup_policy_delivery_block_until_valid_inbound.sql"));
  await pg.exec(fs.readFileSync(path.join(root,"supabase/migrations",migration),"utf8"));
  const results = await pg.exec(fs.readFileSync(path.join(root,"scripts/test_followup_policy_rollback.sql"),"utf8"));
  console.log(JSON.stringify(results.flatMap(r=>r.rows),null,2));
  console.log("POSTGRES REPLAY: PASS");
} catch (error) {
  console.error("POSTGRES REPLAY: FAIL",error.message, error.detail || "", error.where || "");
  process.exitCode = 1;
} finally { await pg.close(); }
