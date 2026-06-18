-- technician_attendance.sql
-- Manager/admin daily clock-in table for technician availability.
-- A technician is only treated as available when they have a row for the work_date
-- with clock_in_at set and clock_out_at still null.

create table if not exists technician_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  technician_id uuid not null references technicians(id) on delete cascade,
  work_date date not null,
  clock_in_at timestamptz null,
  clock_out_at timestamptz null,
  status text not null default 'not_clocked_in',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id, technician_id, work_date)
);

create index if not exists idx_technician_attendance_company_date
  on technician_attendance(company_id, work_date);

create index if not exists idx_technician_attendance_tech_date
  on technician_attendance(technician_id, work_date);
