insert into leads (
  id,
  client_name,
  phone,
  source,
  division,
  property_type,
  service_type,
  scope_summary,
  lead_score,
  lead_category,
  status,
  missing_info,
  risk_flags,
  boss_approval_needed,
  appointment_suitable,
  appointment_type,
  quotation_readiness_score,
  next_action,
  preferred_contact_time
) values
(
  '00000000-0000-0000-0000-000000000101',
  'Daniel Tan',
  '+65 8123 4567',
  'WhatsApp',
  'LIMM Works',
  'Old inter-terrace',
  'Landed A&A',
  'Wet kitchen extension, bathrooms, roof leak area, rewiring',
  94,
  'Hot',
  'Waiting Boss Approval',
  '["floor_plan","site_photos","preferred_contact_time"]'::jsonb,
  '["landed_a_and_a","wet_works","approval_review_needed"]'::jsonb,
  true,
  true,
  'site_discussion',
  62,
  'Ask for floor plan, site photos, and preferred contact time. Boss review required.',
  ''
)
on conflict (id) do nothing;

-- Demo users are not created here because Supabase Auth passwords should never be committed.
-- Create users in the Supabase dashboard, then insert matching profile rows:
--
-- insert into profiles (id, email, full_name, role, active)
-- values ('AUTH_USER_UUID_FROM_DASHBOARD', 'marcus@example.com', 'Marcus Lim', 'boss', true);
