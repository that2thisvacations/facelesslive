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
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stream_job_id uuid not null references public.stream_jobs(id) on delete cascade,
  source text not null default 'manual',
  external_event_id text,
  event_type text not null default 'comment' check (event_type in ('comment','question','reaction')),
  viewer_name text,
  message text not null,
  response_text text,
  status text not null default 'queued' check (status in ('queued','displayed','error','ignored')),
  speech_status text not null default 'not_requested' check (speech_status in ('not_requested','approval_required','queued','spoken','error')),
  response_spoken_at timestamptz,
  error_message text,
  displayed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_stream_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('tiktok','youtube','facebook','instagram','custom')),
  external_stream_id text not null,
  stream_job_id uuid not null references public.stream_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, external_stream_id)
);

create table if not exists public.live_response_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stream_job_id uuid not null,
  mode text not null default 'manual' check (mode in ('manual','safe_auto')),
  voice text not null default 'alloy',
  max_spoken_per_minute integer not null default 4 check (max_spoken_per_minute between 1 and 10),
  speak_reactions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stream_job_id),
  foreign key (stream_job_id, owner_id) references public.stream_jobs(id, owner_id) on delete cascade
);

alter table public.live_events add column if not exists external_event_id text;
alter table public.live_events add column if not exists speech_status text not null default 'not_requested';
alter table public.live_events add column if not exists response_spoken_at timestamptz;
create unique index if not exists live_events_source_external_event_uidx on public.live_events(source, external_event_id) where external_event_id is not null;
create index if not exists live_stream_mappings_lookup_idx on public.live_stream_mappings(platform, external_stream_id);
create index if not exists live_events_spoken_idx on public.live_events(stream_job_id, response_spoken_at desc) where response_spoken_at is not null;
create unique index if not exists stream_jobs_id_owner_uidx on public.stream_jobs(id, owner_id);

create or replace function public.reserve_auto_speech_slot(
  p_event_id uuid,
  p_stream_job_id uuid,
  p_max_per_minute integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if p_max_per_minute < 1 or p_max_per_minute > 10 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stream_job_id::text, 0));

  select count(*) into current_count
  from public.live_events
  where stream_job_id = p_stream_job_id
    and response_spoken_at >= now() - interval '60 seconds';

  if current_count >= p_max_per_minute then
    return false;
  end if;

  update public.live_events
  set response_spoken_at = now(), updated_at = now()
  where id = p_event_id
    and stream_job_id = p_stream_job_id
    and response_spoken_at is null;

  return found;
end;
$$;

revoke all on function public.reserve_auto_speech_slot(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_auto_speech_slot(uuid, uuid, integer) to service_role;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stream_drafts enable row level security;
alter table public.broadcast_destinations enable row level security;
alter table public.presenter_jobs enable row level security;
alter table public.stream_jobs enable row level security;
alter table public.live_events enable row level security;
alter table public.live_stream_mappings enable row level security;
alter table public.live_response_policies enable row level security;

drop policy if exists "profiles_owner_access" on public.profiles;
drop policy if exists "products_owner_access" on public.products;
drop policy if exists "stream_drafts_owner_access" on public.stream_drafts;
drop policy if exists "broadcast_destinations_owner_access" on public.broadcast_destinations;
drop policy if exists "presenter_jobs_owner_access" on public.presenter_jobs;
drop policy if exists "stream_jobs_owner_access" on public.stream_jobs;
drop policy if exists "live_events_owner_access" on public.live_events;
drop policy if exists "live_stream_mappings_owner_access" on public.live_stream_mappings;
drop policy if exists "live_response_policies_owner_access" on public.live_response_policies;

create policy "profiles_owner_access" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "products_owner_access" on public.products for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "stream_drafts_owner_access" on public.stream_drafts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "broadcast_destinations_owner_access" on public.broadcast_destinations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "presenter_jobs_owner_access" on public.presenter_jobs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "stream_jobs_owner_access" on public.stream_jobs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "live_events_owner_access" on public.live_events for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "live_stream_mappings_owner_access" on public.live_stream_mappings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "live_response_policies_owner_access" on public.live_response_policies for all
  using (auth.uid() = owner_id and exists (select 1 from public.stream_jobs sj where sj.id = stream_job_id and sj.owner_id = auth.uid()))
  with check (auth.uid() = owner_id and exists (select 1 from public.stream_jobs sj where sj.id = stream_job_id and sj.owner_id = auth.uid()));
