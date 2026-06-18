-- H&H Shop Manager v3.3
-- Comeback / rework tracking and admin audit log.

create table if not exists comeback_rework (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  original_job_id uuid null references jobs(id) on delete set null,
  original_technician_id uuid null references technicians(id) on delete set null,
  rework_technician_id uuid null references technicians(id) on delete set null,
  customer text null,
  vehicle text null,
  product_summary text null,
  original_completed_at timestamptz null,
  reason text not null,
  rework_hours numeric null,
  status text not null default 'open' check (status in ('open','resolved')),
  notes text null,
  created_by_name text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comeback_rework_company on comeback_rework(company_id);
create index if not exists idx_comeback_rework_original_job on comeback_rework(original_job_id);
create index if not exists idx_comeback_rework_original_tech on comeback_rework(original_technician_id);
create index if not exists idx_comeback_rework_rework_tech on comeback_rework(rework_technician_id);
create index if not exists idx_comeback_rework_status on comeback_rework(status);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  actor_name text null,
  actor_role text null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  summary text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_company_created on audit_logs(company_id, created_at desc);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_action on audit_logs(action);

-- v3.3.1 support older installs that predate H&H Shop Manager tickets.
alter table comeback_rework
add column if not exists is_pre_app_ticket boolean not null default false,
add column if not exists pre_app_ticket_ref text null;

create index if not exists idx_comeback_rework_pre_app on comeback_rework(company_id, is_pre_app_ticket);
