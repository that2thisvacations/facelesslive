create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('youtube','meta')),
  status text not null default 'connected' check (status in ('connected','expired','error')),
  provider_account_id text,
  provider_account_name text,
  encrypted_tokens text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

alter table public.provider_connections enable row level security;
drop policy if exists "provider_connections_owner_access" on public.provider_connections;
create policy "provider_connections_owner_access" on public.provider_connections
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists provider_connections_owner_provider_idx
  on public.provider_connections(owner_id, provider);
