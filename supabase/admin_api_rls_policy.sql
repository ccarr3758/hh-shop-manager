-- Run this once in Supabase SQL Editor.
-- It lets an authenticated admin manage employees in user_profiles using normal RLS.
-- This avoids relying on the Edge Function service key for public table reads/writes.

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

create or replace function public.hh_is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hh_current_user_role() = 'admin'
    and target_company_id = public.hh_current_company_id();
$$;

grant execute on function public.hh_current_company_id() to authenticated;
grant execute on function public.hh_current_user_role() to authenticated;
grant execute on function public.hh_is_company_admin(uuid) to authenticated;

drop policy if exists "hh_user_profiles_self_select" on public.user_profiles;
create policy "hh_user_profiles_self_select"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "hh_user_profiles_admin_select" on public.user_profiles;
create policy "hh_user_profiles_admin_select"
on public.user_profiles
for select
to authenticated
using (public.hh_is_company_admin(company_id));

drop policy if exists "hh_user_profiles_admin_insert" on public.user_profiles;
create policy "hh_user_profiles_admin_insert"
on public.user_profiles
for insert
to authenticated
with check (public.hh_is_company_admin(company_id));

drop policy if exists "hh_user_profiles_admin_update" on public.user_profiles;
create policy "hh_user_profiles_admin_update"
on public.user_profiles
for update
to authenticated
using (public.hh_is_company_admin(company_id))
with check (public.hh_is_company_admin(company_id));
