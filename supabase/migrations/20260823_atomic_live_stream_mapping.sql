create or replace function public.claim_live_stream_mapping(
  p_owner_id uuid,
  p_platform text,
  p_external_stream_id text,
  p_stream_job_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_job_id uuid;
  existing_status text;
begin
  if p_platform not in ('tiktok','youtube','facebook','instagram','custom') then
    return false;
  end if;

  if not exists (
    select 1
    from public.stream_jobs
    where id = p_stream_job_id
      and owner_id = p_owner_id
      and status in ('queued','starting','live')
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_owner_id::text || ':' || p_platform || ':' || p_external_stream_id,
    0
  ));

  select m.stream_job_id, j.status
    into existing_job_id, existing_status
  from public.live_stream_mappings m
  left join public.stream_jobs j on j.id = m.stream_job_id
  where m.owner_id = p_owner_id
    and m.platform = p_platform
    and m.external_stream_id = p_external_stream_id;

  if existing_job_id is not null
    and existing_job_id <> p_stream_job_id
    and existing_status in ('queued','starting','live') then
    return false;
  end if;

  insert into public.live_stream_mappings (
    owner_id,
    platform,
    external_stream_id,
    stream_job_id,
    updated_at
  ) values (
    p_owner_id,
    p_platform,
    p_external_stream_id,
    p_stream_job_id,
    now()
  )
  on conflict (owner_id, platform, external_stream_id)
  do update set
    stream_job_id = excluded.stream_job_id,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.claim_live_stream_mapping(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_live_stream_mapping(uuid, text, text, uuid) to service_role;
