-- v11.1.4: notify the active inbox again when an attachment finishes
-- private storage. The WhatsApp message is committed before media retrieval, so
-- listening only to lead_messages can leave a client on a stale "unavailable"
-- card even though the file was stored successfully seconds later.

alter table public.lead_files enable row level security;

revoke all on table public.lead_files from anon;
grant select on table public.lead_files to authenticated;
grant all on table public.lead_files to service_role;

drop policy if exists lead_files_select_roles on public.lead_files;
create policy lead_files_select_roles on public.lead_files
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop trigger if exists lead_files_broadcast_inbox_activity on public.lead_files;
create trigger lead_files_broadcast_inbox_activity
after insert or update or delete on public.lead_files
for each row execute function limm_private.broadcast_inbox_activity();

comment on trigger lead_files_broadcast_inbox_activity on public.lead_files is
  'Refreshes private inbox clients when WhatsApp image or document storage state changes.';
