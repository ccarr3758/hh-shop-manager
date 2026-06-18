-- Adds on-the-fly assisting/helper technicians for jobs.
-- Run this once in the Supabase SQL editor before using helper assignments.

create table if not exists job_helpers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  technician_id uuid not null references technicians(id) on delete cascade,
  start_time time not null,
  book_hours numeric not null default 0,
  scheduled_date date not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, technician_id, scheduled_date)
);

create index if not exists idx_job_helpers_company_id on job_helpers(company_id);
create index if not exists idx_job_helpers_job_id on job_helpers(job_id);
create index if not exists idx_job_helpers_technician_date on job_helpers(technician_id, scheduled_date);

alter table job_helpers enable row level security;

drop policy if exists "Users can read job helpers for their company" on job_helpers;
create policy "Users can read job helpers for their company"
on job_helpers for select
to authenticated
using (
  company_id in (
    select company_id from user_profiles where id = auth.uid() and active = true
  )
);

drop policy if exists "Users can insert job helpers for their company" on job_helpers;
create policy "Users can insert job helpers for their company"
on job_helpers for insert
to authenticated
with check (
  company_id in (
    select company_id from user_profiles where id = auth.uid() and active = true
  )
);

drop policy if exists "Users can update job helpers for their company" on job_helpers;
create policy "Users can update job helpers for their company"
on job_helpers for update
to authenticated
using (
  company_id in (
    select company_id from user_profiles where id = auth.uid() and active = true
  )
)
with check (
  company_id in (
    select company_id from user_profiles where id = auth.uid() and active = true
  )
);

drop policy if exists "Users can delete job helpers for their company" on job_helpers;
create policy "Users can delete job helpers for their company"
on job_helpers for delete
to authenticated
using (
  company_id in (
    select company_id from user_profiles where id = auth.uid() and active = true
  )
);

-- Helper lifecycle columns added after initial helper support.
-- End Help freezes credited hours. Remove deletes the row and credits nothing.
alter table job_helpers
add column if not exists end_time time null,
add column if not exists status text not null default 'active',
add column if not exists ended_at timestamptz null;

create index if not exists idx_job_helpers_active_status on job_helpers(status, scheduled_date);
