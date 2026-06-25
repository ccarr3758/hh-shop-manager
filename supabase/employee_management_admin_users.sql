-- Employee Management support
-- This keeps normal users limited while letting admin profiles manage employees in their own company.

alter table user_profiles add column if not exists updated_at timestamptz default now();

create index if not exists user_profiles_company_id_idx on user_profiles(company_id);
create index if not exists user_profiles_role_idx on user_profiles(role);

alter table user_profiles enable row level security;

drop policy if exists "Admins can manage company user profiles" on user_profiles;
create policy "Admins can manage company user profiles"
on user_profiles for all
to authenticated
using (
  exists (
    select 1 from user_profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.company_id = user_profiles.company_id
      and admin_profile.role = 'admin'
      and admin_profile.active = true
  )
)
with check (
  exists (
    select 1 from user_profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.company_id = user_profiles.company_id
      and admin_profile.role = 'admin'
      and admin_profile.active = true
  )
);
