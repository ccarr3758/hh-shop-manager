-- Rollover book-time pause support
-- Safe to run more than once.

alter table public.jobs
  add column if not exists production_started_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists pause_started_at timestamptz,
  add column if not exists pause_reason text,
  add column if not exists total_paused_seconds integer not null default 0,
  add column if not exists active_time_hours numeric;

-- Optional but recommended: make sure a Paused status exists for each company using statuses.
-- If your statuses table already has Paused, this inserts nothing.
insert into public.statuses (company_id, name, color)
select c.id, 'Paused', '#3b82f6'
from public.companies c
where not exists (
  select 1 from public.statuses s
  where s.company_id = c.id and lower(s.name) = 'paused'
);
