create table if not exists public.live_response_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stream_job_id uuid not null unique references public.stream_jobs(id) on delete cascade,
  mode text not null default 'manual' check (mode in ('manual','safe_auto')),
  voice text not null default 'alloy',
  auto_speak_reactions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_response_policies enable row level security;
drop policy if exists "live_response_policies_owner_access" on public.live_response_policies;
create policy "live_response_policies_owner_access" on public.live_response_policies
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists live_response_policies_stream_idx
  on public.live_response_policies(stream_job_id);
