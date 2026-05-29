-- Bootstrap profile examples for Supabase Auth users.
-- Do not paste real passwords here.
-- First create users in Supabase Authentication, then copy their auth.users UUIDs.

-- Marcus boss profile.
insert into profiles (id, email, full_name, role, active)
values (
  'MARCUS_AUTH_USER_UUID',
  'MARCUS_EMAIL',
  'Marcus Lim',
  'boss',
  true
)
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

-- Optional admin profile.
insert into profiles (id, email, full_name, role, active)
values (
  'ADMIN_AUTH_USER_UUID',
  'ADMIN_EMAIL',
  'Admin User',
  'admin',
  true
)
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

-- Optional sales profile template.
-- insert into profiles (id, email, full_name, role, active)
-- values ('SALES_AUTH_USER_UUID', 'SALES_EMAIL', 'Sales User', 'sales', true)
-- on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role, active = excluded.active, updated_at = now();

-- Optional viewer profile template.
-- insert into profiles (id, email, full_name, role, active)
-- values ('VIEWER_AUTH_USER_UUID', 'VIEWER_EMAIL', 'Viewer User', 'viewer', true)
-- on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role, active = excluded.active, updated_at = now();
