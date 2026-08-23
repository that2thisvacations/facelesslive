alter table public.stream_jobs
  add column if not exists ingestion_health jsonb not null default '{}'::jsonb;

create index if not exists stream_jobs_ingestion_health_status_idx
  on public.stream_jobs ((ingestion_health->>'status'))
  where ingestion_health <> '{}'::jsonb;

comment on column public.stream_jobs.ingestion_health is
  'Provider-neutral ingestion telemetry. Stores status, provider, retry counters, last activity, and sanitized errors; never OAuth tokens or secrets.';
