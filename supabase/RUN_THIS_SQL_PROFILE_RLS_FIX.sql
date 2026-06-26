-- H&H Shop Manager - Profile RLS repair
-- Run this after messages_threads_activity.sql.
-- It fixes the login lockout caused by recursive user_profiles policies.

alter table public.user_profiles enable row level security;

-- Helper functions run as the table owner so policies do not recursively read user_profiles.
create or replace function public.hh_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.company_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.active = true
  limit 1;
$$;

create or replace function public.hh_current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(up.role)
  from public.user_profiles up
  where up.id = auth.uid()
    and up.active = true
  limit 1;
$$;

grant execute on function public.hh_current_company_id() to authenticated;
grant execute on function public.hh_current_user_role() to authenticated;

-- Remove old/recursive/conflicting profile policies.
drop policy if exists "Users can read their own profile" on public.user_profiles;
drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "user_profiles_select_own" on public.user_profiles;
drop policy if exists "user_profiles_select" on public.user_profiles;
drop policy if exists "Allow authenticated users to read profiles" on public.user_profiles;
drop policy if exists "company user profile directory" on public.user_profiles;
drop policy if exists "hh_user_profiles_self_select" on public.user_profiles;
drop policy if exists "hh_user_profiles_admin_select" on public.user_profiles;
drop policy if exists "hh_user_profiles_admin_insert" on public.user_profiles;
drop policy if exists "hh_user_profiles_admin_update" on public.user_profiles;

-- Login/profile lookup: every user can read only their own profile.
create policy "hh_user_profiles_self_select"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

-- Company directory: active users can read active profiles in the same company.
-- This is needed for message recipient lists and admin employee views.
create policy "hh_user_profiles_company_directory_select"
on public.user_profiles
for select
to authenticated
using (
  active = true
  and company_id = public.hh_current_company_id()
);

-- Admin/manager employee maintenance. Keeps employee admin working without opening public writes.
create policy "hh_user_profiles_admin_insert"
on public.user_profiles
for insert
to authenticated
with check (
  public.hh_current_user_role() in ('admin','manager')
  and company_id = public.hh_current_company_id()
);

create policy "hh_user_profiles_admin_update"
on public.user_profiles
for update
to authenticated
using (
  public.hh_current_user_role() in ('admin','manager')
  and company_id = public.hh_current_company_id()
)
with check (
  public.hh_current_user_role() in ('admin','manager')
  and company_id = public.hh_current_company_id()
);

-- Access logs policy repair; safe if access_logs exists.
do $$
begin
  if to_regclass('public.access_logs') is not null then
    execute 'alter table public.access_logs enable row level security';
    execute 'drop policy if exists "company access logs readable by admins" on public.access_logs';
    execute 'create policy "company access logs readable by admins" on public.access_logs for select to authenticated using (company_id = public.hh_current_company_id() and public.hh_current_user_role() in (''admin'',''manager'',''foreman''))';
    execute 'drop policy if exists "company access logs insert own" on public.access_logs';
    execute 'create policy "company access logs insert own" on public.access_logs for insert to authenticated with check (user_id = auth.uid() and company_id = public.hh_current_company_id())';
  end if;
end $$;
