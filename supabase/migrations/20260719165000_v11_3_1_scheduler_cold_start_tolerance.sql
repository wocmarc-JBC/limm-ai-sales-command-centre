-- v11.3.1 Reliability scheduler cold-start tolerance.
--
-- The client-file integrity route has a 60-second hard runtime ceiling. Give
-- pg_net enough time to observe a cold production function while retaining a
-- five-second margin before that ceiling.

create or replace function limm_private.dispatch_reliability_endpoint(
  p_service_name text,
  p_url_secret_name text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select secret.decrypted_secret into v_url
  from vault.decrypted_secrets secret
  where secret.name = p_url_secret_name
  limit 1;

  select secret.decrypted_secret into v_token
  from vault.decrypted_secrets secret
  where secret.name = 'limm_whatsapp_worker_token'
  limit 1;

  if nullif(v_url, '') is null or nullif(v_token, '') is null then
    insert into public.reliability_dispatches (
      service_name, status, error_code
    ) values (
      left(coalesce(p_service_name, 'unknown_service'), 100), 'configuration_error', 'scheduler_vault_secret_missing'
    );
    return null;
  end if;

  select net.http_get(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'User-Agent', 'LIMM-Supabase-Reliability-Scheduler/11.3.1'
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  insert into public.reliability_dispatches (
    service_name, request_id, status
  ) values (
    left(coalesce(p_service_name, 'unknown_service'), 100), v_request_id, 'dispatched'
  );
  return v_request_id;
exception when others then
  insert into public.reliability_dispatches (
    service_name, status, error_code
  ) values (
    left(coalesce(p_service_name, 'unknown_service'), 100), 'configuration_error', left(sqlstate, 100)
  );
  return null;
end;
$$;

revoke all on function limm_private.dispatch_reliability_endpoint(text,text) from public, anon, authenticated;

comment on function limm_private.dispatch_reliability_endpoint(text,text) is
  'Dispatches Vault-authenticated reliability jobs with a 55-second cold-start observation window.';
