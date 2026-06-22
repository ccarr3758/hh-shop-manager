create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  endpoint text not null unique,
  subscription jsonb not null,
  role text,
  technician_id uuid,
  user_email text,
  user_name text,
  user_agent text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists web_push_subscriptions_company_id_idx
  on public.web_push_subscriptions(company_id);

create index if not exists web_push_subscriptions_technician_id_idx
  on public.web_push_subscriptions(technician_id);
