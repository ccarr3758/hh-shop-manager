-- Direct user-to-user message threads for H&H Shop Manager
create extension if not exists pgcrypto;

create table if not exists public.shop_message_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  participant_a_user_id uuid not null,
  participant_b_user_id uuid not null,
  created_by_user_id uuid,
  last_message_at timestamptz default now(),
  last_message_preview text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.shop_thread_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  thread_id uuid not null references public.shop_message_threads(id) on delete cascade,
  sender_user_id uuid not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_shop_message_threads_company on public.shop_message_threads(company_id);
create index if not exists idx_shop_message_threads_a on public.shop_message_threads(participant_a_user_id);
create index if not exists idx_shop_message_threads_b on public.shop_message_threads(participant_b_user_id);
create index if not exists idx_shop_thread_messages_thread on public.shop_thread_messages(thread_id);
create index if not exists idx_shop_thread_messages_company on public.shop_thread_messages(company_id);

alter table public.shop_message_threads enable row level security;
alter table public.shop_thread_messages enable row level security;

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

grant execute on function public.hh_current_company_id() to authenticated;

-- Let authenticated users read active users in their company so they can choose a message recipient.
-- Do not query user_profiles directly inside this policy, or Supabase can block login with recursive RLS.
drop policy if exists "company user profile directory" on public.user_profiles;
drop policy if exists "hh_user_profiles_company_directory_select" on public.user_profiles;
create policy "hh_user_profiles_company_directory_select" on public.user_profiles
for select to authenticated
using (
  active = true
  and company_id = public.hh_current_company_id()
);

-- Participants can view and create their own direct message threads.
drop policy if exists "participants read message threads" on public.shop_message_threads;
create policy "participants read message threads" on public.shop_message_threads
for select to authenticated
using (participant_a_user_id = auth.uid() or participant_b_user_id = auth.uid());

drop policy if exists "participants create message threads" on public.shop_message_threads;
create policy "participants create message threads" on public.shop_message_threads
for insert to authenticated
with check (
  created_by_user_id = auth.uid()
  and (participant_a_user_id = auth.uid() or participant_b_user_id = auth.uid())
);

drop policy if exists "participants update message threads" on public.shop_message_threads;
create policy "participants update message threads" on public.shop_message_threads
for update to authenticated
using (participant_a_user_id = auth.uid() or participant_b_user_id = auth.uid())
with check (participant_a_user_id = auth.uid() or participant_b_user_id = auth.uid());

-- Participants can view messages in their threads and insert their own messages.
drop policy if exists "participants read thread messages" on public.shop_thread_messages;
create policy "participants read thread messages" on public.shop_thread_messages
for select to authenticated
using (
  exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
);

drop policy if exists "participants create thread messages" on public.shop_thread_messages;
create policy "participants create thread messages" on public.shop_thread_messages
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
);

-- Keep access_logs available for the Admin last activity panel.
drop policy if exists "company access logs readable by admins" on public.access_logs;
create policy "company access logs readable by admins" on public.access_logs
for select to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = access_logs.company_id
      and up.active = true
      and up.role in ('admin','manager','foreman')
  )
);

-- Allow message recipients to persist read receipts. Required so opened dashboard messages do not return as unread after refresh.
drop policy if exists "participants update message read receipts" on public.shop_thread_messages;
create policy "participants update message read receipts" on public.shop_thread_messages
for update to authenticated
using (
  sender_user_id <> auth.uid()
  and exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
)
with check (
  sender_user_id <> auth.uid()
  and exists (
    select 1 from public.shop_message_threads t
    where t.id = thread_id
      and (t.participant_a_user_id = auth.uid() or t.participant_b_user_id = auth.uid())
  )
);
