-- Helper sessions fix
-- Run this once in Supabase SQL Editor before deploying this version.
-- It allows the same helper to be added, ended, and added again on the same job/date
-- without overwriting the earlier helper session.

alter table job_helpers
  drop constraint if exists job_helpers_job_id_technician_id_scheduled_date_key;

create index if not exists idx_job_helpers_active_session_lookup
on job_helpers(job_id, technician_id, scheduled_date, status)
where status = 'active' and end_time is null;
