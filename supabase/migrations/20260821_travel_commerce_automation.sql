create table if not exists public.affiliate_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  external_product_id text not null,
  affiliate_channel text not null,
  name text not null,
  category text not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  commission_rate numeric(7,6) check (commission_rate is null or commission_rate between 0 and 1),
  affiliate_url text,
  image_url text,
  inventory_status text not null default 'unknown' check (inventory_status in ('in_stock','low','out_of_stock','unknown')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','stale','rejected')),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, affiliate_channel, external_product_id),
  unique (id, owner_id)
);

create table if not exists public.commerce_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('owned_web','youtube','tiktok_shop','amazon','meta','pinterest')),
  label text not null,
  automation_mode text not null default 'disabled' check (automation_mode in ('autonomous','supervised','content_only','disabled')),
  authorization_status text not null default 'unverified' check (authorization_status in ('unverified','pending','authorized','suspended','revoked')),
  encrypted_credentials text,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel),
  unique (id, owner_id)
);

create table if not exists public.commerce_cycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commerce_program_id uuid not null,
  affiliate_product_id uuid not null,
  stream_job_id uuid references public.stream_jobs(id) on delete set null,
  policy_decision text not null,
  automation_mode text not null check (automation_mode in ('autonomous','supervised','content_only','disabled')),
  quality_score integer not null check (quality_score between 0 and 100),
  status text not null default 'draft' check (status in ('draft','approval_required','ready','running','paused','completed','blocked','error')),
  sales_blocks jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (commerce_program_id, owner_id) references public.commerce_programs(id, owner_id) on delete cascade,
  foreign key (affiliate_product_id, owner_id) references public.affiliate_products(id, owner_id) on delete restrict
);

create table if not exists public.commerce_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  commerce_cycle_id uuid not null references public.commerce_cycles(id) on delete cascade,
  event_type text not null check (event_type in ('impression','viewer','product_click','checkout','order','commission','question','policy_block')),
  value_cents integer,
  quantity integer,
  external_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.planning_reward_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  minimum_purchase_cents integer not null default 5000 check (minimum_purchase_cents >= 0),
  discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  maximum_discount_cents integer check (maximum_discount_cents is null or maximum_discount_cents >= 0),
  validity_days integer not null default 30 check (validity_days between 1 and 365),
  status text not null default 'draft' check (status in ('draft','active','paused','retired')),
  terms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.planning_rewards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null,
  commerce_cycle_id uuid not null references public.commerce_cycles(id) on delete restrict,
  order_event_id uuid not null references public.commerce_events(id) on delete restrict,
  claim_token_hash text not null unique,
  status text not null default 'issued' check (status in ('issued','claimed','redeemed','expired','revoked')),
  discount_cents integer,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (rule_id, owner_id) references public.planning_reward_rules(id, owner_id) on delete restrict,
  unique (owner_id, order_event_id)
);

create unique index if not exists commerce_events_external_uidx
  on public.commerce_events(owner_id, external_event_id)
  where external_event_id is not null;
create index if not exists affiliate_products_ranking_idx
  on public.affiliate_products(owner_id, verification_status, inventory_status, updated_at desc);
create index if not exists commerce_cycles_run_queue_idx
  on public.commerce_cycles(owner_id, status, created_at)
  where status in ('ready','running','paused');
create index if not exists commerce_events_cycle_time_idx
  on public.commerce_events(commerce_cycle_id, occurred_at desc);
create index if not exists planning_rewards_status_idx
  on public.planning_rewards(owner_id, status, expires_at);

alter table public.affiliate_products enable row level security;
alter table public.commerce_programs enable row level security;
alter table public.commerce_cycles enable row level security;
alter table public.commerce_events enable row level security;
alter table public.planning_reward_rules enable row level security;
alter table public.planning_rewards enable row level security;

drop policy if exists "affiliate_products_owner_access" on public.affiliate_products;
drop policy if exists "commerce_programs_owner_access" on public.commerce_programs;
drop policy if exists "commerce_cycles_owner_access" on public.commerce_cycles;
drop policy if exists "commerce_events_owner_access" on public.commerce_events;
drop policy if exists "planning_reward_rules_owner_access" on public.planning_reward_rules;
drop policy if exists "planning_rewards_owner_access" on public.planning_rewards;

create policy "affiliate_products_owner_access" on public.affiliate_products
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "commerce_programs_owner_access" on public.commerce_programs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "commerce_cycles_owner_access" on public.commerce_cycles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "commerce_events_owner_access" on public.commerce_events
  for all using (
    auth.uid() = owner_id and exists (
      select 1 from public.commerce_cycles cycle
      where cycle.id = commerce_cycle_id and cycle.owner_id = auth.uid()
    )
  ) with check (
    auth.uid() = owner_id and exists (
      select 1 from public.commerce_cycles cycle
      where cycle.id = commerce_cycle_id and cycle.owner_id = auth.uid()
    )
  );
create policy "planning_reward_rules_owner_access" on public.planning_reward_rules
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "planning_rewards_owner_access" on public.planning_rewards
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.reserve_next_commerce_cycle(p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_id uuid;
begin
  select cycle.id into selected_id
  from public.commerce_cycles cycle
  join public.commerce_programs program on program.id = cycle.commerce_program_id
  join public.affiliate_products product on product.id = cycle.affiliate_product_id
  where cycle.owner_id = p_owner_id
    and cycle.status = 'ready'
    and cycle.automation_mode = 'autonomous'
    and program.authorization_status = 'authorized'
    and program.channel = 'owned_web'
    and product.verification_status = 'verified'
    and product.inventory_status = 'in_stock'
    and product.affiliate_url is not null
  order by cycle.quality_score desc, cycle.created_at
  for update of cycle skip locked
  limit 1;

  if selected_id is null then return null; end if;

  update public.commerce_cycles
  set status = 'running', started_at = now(), updated_at = now()
  where id = selected_id;
  return selected_id;
end;
$$;

revoke all on function public.reserve_next_commerce_cycle(uuid) from public, anon, authenticated;
grant execute on function public.reserve_next_commerce_cycle(uuid) to service_role;
