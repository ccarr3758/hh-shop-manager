-- H&H Shop Manager Mobile Performance Update v4
-- SAFE / NON-DESTRUCTIVE migration.
-- This migration only adds missing columns/tables and inserts the Paused status if missing.
-- It does NOT drop, truncate, delete, reset, or recreate existing data.

alter table public.jobs
  add column if not exists pause_started_at timestamptz,
  add column if not exists pause_reason text,
  add column if not exists total_paused_seconds integer not null default 0,
  add column if not exists active_time_hours numeric,
  add column if not exists approved_variance_hours numeric not null default 0,
  add column if not exists approved_variance_reason text,
  add column if not exists approved_variance_approved_by text,
  add column if not exists exceptional_circumstance boolean not null default false;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  type text not null default 'info',
  title text not null,
  body text not null default '',
  job_id uuid,
  technician_id uuid,
  audience_roles text[] not null default '{}',
  actor_name text,
  metadata jsonb not null default '{}'::jsonb,
  read_by text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_company_created_idx
  on public.app_notifications (company_id, created_at desc);

create index if not exists app_notifications_technician_idx
  on public.app_notifications (technician_id);

-- Add a Paused status for every company that does not already have one.
-- Uses only columns confirmed by the existing app behavior: company_id, name, color.
-- Does not reference sort_order, because some live databases do not have that column.
insert into public.statuses (company_id, name, color)
select c.id, 'Paused', '#f59e0b'
from public.companies c
where not exists (
  select 1
  from public.statuses s
  where s.company_id = c.id
    and lower(s.name) = 'paused'
);
