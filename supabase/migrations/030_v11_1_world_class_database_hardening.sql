-- v11.1 World-Class Database Hardening
-- Advisor-driven, additive follow-up for migration 029: cover foreign keys,
-- cache auth identity lookups in RLS, and document service-only table access.

create index if not exists inbox_internal_notes_created_by_idx
  on public.inbox_internal_notes (created_by);

create index if not exists operational_trace_events_lead_created_idx
  on public.operational_trace_events (lead_id, created_at desc);

create index if not exists ai_reply_quality_events_lead_created_idx
  on public.ai_reply_quality_events (lead_id, created_at desc);

create index if not exists ai_reply_quality_events_message_idx
  on public.ai_reply_quality_events (message_id);

create index if not exists ai_reply_quality_events_reviewer_idx
  on public.ai_reply_quality_events (reviewed_by);

create index if not exists operator_product_events_actor_created_idx
  on public.operator_product_events (actor_id, created_at desc);

create index if not exists operator_product_events_lead_created_idx
  on public.operator_product_events (lead_id, created_at desc);

-- These four tables are intentionally writable only by the service role. The
-- explicit policies make that contract auditable even though service_role has
-- BYPASSRLS and the table grants remain the primary privilege boundary.
drop policy if exists operational_trace_events_service_role on public.operational_trace_events;
create policy operational_trace_events_service_role on public.operational_trace_events
for all to service_role using (true) with check (true);

drop policy if exists ai_reply_quality_events_service_role on public.ai_reply_quality_events;
create policy ai_reply_quality_events_service_role on public.ai_reply_quality_events
for all to service_role using (true) with check (true);

drop policy if exists operator_product_events_service_role on public.operator_product_events;
create policy operator_product_events_service_role on public.operator_product_events
for all to service_role using (true) with check (true);

drop policy if exists api_rate_limit_windows_service_role on public.api_rate_limit_windows;
create policy api_rate_limit_windows_service_role on public.api_rate_limit_windows
for all to service_role using (true) with check (true);

-- Cache auth.uid() once per statement instead of re-evaluating it per row.
-- Role predicates are unchanged from migration 029.
drop policy if exists inbox_assignments_insert_roles on public.inbox_assignments;
create policy inbox_assignments_insert_roles on public.inbox_assignments
for insert to authenticated
with check (
  public.current_user_is_any(array['boss','admin','sales'])
  and (
    assigned_profile_id = (select auth.uid())
    or public.current_user_is_any(array['boss','admin'])
  )
);

drop policy if exists inbox_assignments_update_roles on public.inbox_assignments;
create policy inbox_assignments_update_roles on public.inbox_assignments
for update to authenticated
using (
  assigned_profile_id = (select auth.uid())
  or assigned_profile_id is null
  or coalesce(lease_expires_at, '-infinity'::timestamptz) <= now()
  or public.current_user_is_any(array['boss','admin'])
)
with check (
  assigned_profile_id = (select auth.uid())
  or assigned_profile_id is null
  or public.current_user_is_any(array['boss','admin'])
);

drop policy if exists inbox_assignments_delete_roles on public.inbox_assignments;
create policy inbox_assignments_delete_roles on public.inbox_assignments
for delete to authenticated
using (
  assigned_profile_id = (select auth.uid())
  or public.current_user_is_any(array['boss','admin'])
);

drop policy if exists inbox_internal_notes_insert_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_insert_roles on public.inbox_internal_notes
for insert to authenticated
with check (
  public.current_user_is_any(array['boss','admin','sales'])
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.leads
    where public.leads.id = inbox_internal_notes.lead_id
  )
);

drop policy if exists inbox_internal_notes_update_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_update_roles on public.inbox_internal_notes
for update to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.leads
      where public.leads.id = inbox_internal_notes.lead_id
    )
  )
)
with check (
  public.current_user_is_any(array['boss','admin'])
  or (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.leads
      where public.leads.id = inbox_internal_notes.lead_id
    )
  )
);

drop policy if exists inbox_internal_notes_delete_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_delete_roles on public.inbox_internal_notes
for delete to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.leads
      where public.leads.id = inbox_internal_notes.lead_id
    )
  )
);

drop policy if exists leads_select_roles on public.leads;
create policy leads_select_roles on public.leads
for select to authenticated
using (
  public.current_user_is_any(array['boss','admin','viewer'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> (select auth.uid())
    )
  )
);

drop policy if exists leads_update_roles on public.leads;
create policy leads_update_roles on public.leads
for update to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> (select auth.uid())
    )
  )
)
with check (
  public.current_user_is_any(array['boss','admin'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> (select auth.uid())
    )
  )
);

comment on index public.inbox_internal_notes_created_by_idx is
  'Covers inbox_internal_notes.created_by foreign-key maintenance and operator-note lookups.';
comment on index public.ai_reply_quality_events_message_idx is
  'Covers AI-quality observation lookup and lead_messages foreign-key maintenance.';
