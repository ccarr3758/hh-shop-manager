-- Pre-install damage photo logging for H&H Shop Manager
-- Run this once in the Supabase SQL Editor before using damage photo uploads.

create table if not exists public.job_damage_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by text,
  note text,
  storage_path text not null,
  public_url text,
  file_name text,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_damage_photos_company_id_idx on public.job_damage_photos(company_id);
create index if not exists job_damage_photos_job_id_idx on public.job_damage_photos(job_id);
create index if not exists job_damage_photos_created_at_idx on public.job_damage_photos(created_at desc);

alter table public.job_damage_photos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'job_damage_photos' and policyname = 'Authenticated users can view damage photos'
  ) then
    create policy "Authenticated users can view damage photos"
      on public.job_damage_photos for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'job_damage_photos' and policyname = 'Authenticated users can insert damage photos'
  ) then
    create policy "Authenticated users can insert damage photos"
      on public.job_damage_photos for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'job_damage_photos' and policyname = 'Authenticated users can update damage photos'
  ) then
    create policy "Authenticated users can update damage photos"
      on public.job_damage_photos for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'job_damage_photos' and policyname = 'Authenticated users can delete damage photos'
  ) then
    create policy "Authenticated users can delete damage photos"
      on public.job_damage_photos for delete
      to authenticated
      using (true);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'truck-damage-photos',
  'truck-damage-photos',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can upload truck damage photos'
  ) then
    create policy "Authenticated users can upload truck damage photos"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'truck-damage-photos');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can view truck damage photos'
  ) then
    create policy "Authenticated users can view truck damage photos"
      on storage.objects for select
      to authenticated, anon
      using (bucket_id = 'truck-damage-photos');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can update truck damage photos'
  ) then
    create policy "Authenticated users can update truck damage photos"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'truck-damage-photos')
      with check (bucket_id = 'truck-damage-photos');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can delete truck damage photos'
  ) then
    create policy "Authenticated users can delete truck damage photos"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'truck-damage-photos');
  end if;
end $$;
