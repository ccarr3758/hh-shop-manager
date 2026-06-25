-- H&H Shop Manager: shop messaging + employee activity support
-- Run this once in Supabase SQL Editor.

create table if not exists public.shop_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_role text,
  sender_technician_id uuid references public.technicians(id) on delete set null,
  recipient_group text not null default 'management',
  category text not null default 'question',
  subject text not null,
  body text not null,
  status text not null default 'open',
  manager_reply text,
  manager_reply_by text,
  replied_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  read_by text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_messages enable row level security;

drop policy if exists shop_messages_select_company on public.shop_messages;
create policy shop_messages_select_company on public.shop_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = shop_messages.company_id
      and up.active = true
      and (
        up.role in ('admin', 'manager', 'foreman', 'service_writer')
        or shop_messages.sender_user_id = auth.uid()
        or shop_messages.sender_technician_id = up.technician_id
      )
  )
);

drop policy if exists shop_messages_insert_company on public.shop_messages;
create policy shop_messages_insert_company on public.shop_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = shop_messages.company_id
      and up.active = true
  )
);

drop policy if exists shop_messages_update_management on public.shop_messages;
create policy shop_messages_update_management on public.shop_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = shop_messages.company_id
      and up.active = true
      and up.role in ('admin', 'manager', 'foreman', 'service_writer')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.company_id = shop_messages.company_id
      and up.active = true
      and up.role in ('admin', 'manager', 'foreman', 'service_writer')
  )
);

create index if not exists idx_shop_messages_company_updated on public.shop_messages(company_id, updated_at desc);
create index if not exists idx_shop_messages_sender_user on public.shop_messages(sender_user_id);
create index if not exists idx_shop_messages_sender_tech on public.shop_messages(sender_technician_id);

create or replace function public.set_shop_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shop_messages_updated_at on public.shop_messages;
create trigger trg_shop_messages_updated_at
before update on public.shop_messages
for each row
execute function public.set_shop_messages_updated_at();
