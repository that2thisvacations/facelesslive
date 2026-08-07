create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price_text text,
  source_url text,
  source_host text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.stream_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid,
  host_id text not null,
  layout_id text not null,
  script text not null default '',
  status text not null default 'draft' check (status in ('draft','ready','scheduled','live','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.products(id, owner_id)
);

create table if not exists public.broadcast_destinations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null,
  encrypted_credentials text,
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presenter_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  host_id text not null,
  host_name text not null,
  voice text not null default 'alloy',
  product_name text,
  script text not null,
  provider_job_id text,
  media_url text,
  status text not null default 'needs_provider' check (status in ('needs_provider','queued','generating','ready','error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stream_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stream_draft_id uuid references public.stream_drafts(id) on delete set null,
  destination_id uuid not null references public.broadcast_destinations(id) on delete cascade,
  presenter_job_id uuid references public.presenter_jobs(id) on delete set null,
  status text not null default 'ready' check (status in ('ready','queued','starting','live','ended','error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stream_drafts enable row level security;
alter table public.broadcast_destinations enable row level security;
alter table public.presenter_jobs enable row level security;
alter table public.stream_jobs enable row level security;

drop policy if exists "profiles_owner_access" on public.profiles;
drop policy if exists "products_owner_access" on public.products;
drop policy if exists "stream_drafts_owner_access" on public.stream_drafts;
drop policy if exists "broadcast_destinations_owner_access" on public.broadcast_destinations;
drop policy if exists "presenter_jobs_owner_access" on public.presenter_jobs;
drop policy if exists "stream_jobs_owner_access" on public.stream_jobs;

create policy "profiles_owner_access" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "products_owner_access" on public.products for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "stream_drafts_owner_access" on public.stream_drafts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "broadcast_destinations_owner_access" on public.broadcast_destinations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "presenter_jobs_owner_access" on public.presenter_jobs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "stream_jobs_owner_access" on public.stream_jobs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
