-- Run this once in Supabase SQL Editor.
-- It lets an authenticated admin manage employees in user_profiles using normal RLS.
-- This avoids relying on the Edge Function service key for public table reads/writes.

create or replace function public.hh_is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = target_company_id
      and up.active = true
      and lower(up.role) = 'admin'
  );
$$;

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
