-- v4.0 launch candidate audit log actor compatibility.
-- Safe to re-run. Keeps legacy actor column and newer actor_type/actor_name fields compatible.

alter table audit_logs add column if not exists actor_type text;
alter table audit_logs add column if not exists actor_name text;
alter table audit_logs add column if not exists actor_email text;
alter table audit_logs add column if not exists actor_id uuid;
alter table audit_logs add column if not exists metadata jsonb default '{}'::jsonb;

alter table audit_logs alter column actor set default 'system';
alter table audit_logs alter column actor_type set default 'system';
alter table audit_logs alter column actor_name set default 'system';
alter table audit_logs alter column metadata set default '{}'::jsonb;

update audit_logs
set
  actor = coalesce(nullif(actor, ''), nullif(actor_name, ''), nullif(actor_type, ''), 'system'),
  actor_type = coalesce(nullif(actor_type, ''), 'system'),
  actor_name = coalesce(nullif(actor_name, ''), nullif(actor, ''), 'system'),
  metadata = coalesce(metadata, '{}'::jsonb);

create or replace function set_audit_logs_actor()
returns trigger
language plpgsql
as $$
begin
  if new.actor_type is null or btrim(new.actor_type) = '' then
    new.actor_type := 'system';
  end if;

  if new.actor_name is null or btrim(new.actor_name) = '' then
    new.actor_name := coalesce(nullif(new.actor, ''), new.actor_type, 'system');
  end if;

  if new.actor is null or btrim(new.actor) = '' then
    new.actor := coalesce(nullif(new.actor_name, ''), nullif(new.actor_type, ''), 'system');
  end if;

  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_audit_logs_actor on audit_logs;
create trigger trg_set_audit_logs_actor
before insert or update on audit_logs
for each row
execute function set_audit_logs_actor();
