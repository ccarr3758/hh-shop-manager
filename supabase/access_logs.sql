-- Login / access log for Admin tab.
create table if not exists access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid,
  email text,
  full_name text,
  role text,
  accessed_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_logs_company_time
  on access_logs(company_id, accessed_at desc);

alter table access_logs enable row level security;

-- Match your existing RLS style if needed. This permissive policy keeps the app from failing
-- in shops where RLS is enabled but custom company policies are not yet set up.
do $$ begin
  create policy "Authenticated users can manage access logs"
  on access_logs for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;
