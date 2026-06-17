create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  technician_id uuid references technicians(id),
  full_name text,
  role text not null default 'technician' check (role in ('admin','manager','foreman','service_writer','technician')),
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_profiles_company_id_idx on user_profiles(company_id);
create index if not exists user_profiles_technician_id_idx on user_profiles(technician_id);
create index if not exists user_profiles_role_idx on user_profiles(role);

alter table user_profiles enable row level security;

-- V2 starter policy. Tighten this once all app calls are moved behind profile-aware queries.
drop policy if exists "Users can read their own profile" on user_profiles;
create policy "Users can read their own profile"
on user_profiles for select
to authenticated
using (auth.uid() = id);
