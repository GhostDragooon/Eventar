-- 2026-09-06 — events.format: whole-event format for the programme home's
-- filter chip row (docs/plans reference: work-instruction-organizer-swirling-
-- peacock.md). Distinct from agenda_blocks.kind, which the UI labels
-- "Event type" for individual agenda blocks (NewEventForm.test.tsx:443) —
-- format describes the WHOLE event, kind describes one block within it.

alter table public.events
  add column if not exists format text
  check (format in (
    'conference','symposium','seminar','lecture','workshop','webinar','other'
  ));

comment on column public.events.format is
  'Whole-event format (chip filter on the programme home). Distinct from the agenda-block "Event type" column which describes individual sessions.';

create index if not exists events_format_org_idx
  on public.events (organisation_id, format) where deleted_at is null;

-- The column is nullable — existing events have no format, and the chip row
-- treats null as "not counted" rather than "unknown". Backfill is out of
-- scope for v1.

-- `authenticated`'s INSERT/UPDATE on events is an explicit column-level grant
-- (20260802182411, tightened by 20260804030000) — a brand-new column is NOT
-- covered by an existing table-level grant, and Postgres refuses the WHOLE
-- statement (not just the new column) when any referenced column lacks
-- privilege. Caught live via `pnpm test:rls`: every create_event_with_blocks
-- call started failing 42501 "permission denied for table events" the moment
-- `format` appeared in the RPCs' insert/update lists below, including calls
-- that never touch format. Same class of hazard CLAUDE.md's Hard Rule 11
-- names — a column-level grant is silently incomplete until proven live.
grant insert (format) on public.events to authenticated;
grant update (format) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Thread format through both event RPCs (whitelist-column pattern — see
-- 20260803120000_reconcile_event_rpcs.sql, the last full definition of each).
-- Same treatment as `category`: a plain, ungated column (not one of Hard
-- Rule 11's audited-mutation tables), so no grant changes are needed.
-- ---------------------------------------------------------------------------
create or replace function public.create_event_with_blocks(
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  new_event_id uuid;
  block jsonb;
  creator uuid;
  requested_status text;
begin
  creator := coalesce(
    app_private.current_staff_id(),
    case when auth.role() = 'service_role'
         then nullif(event_input->>'created_by','')::uuid
         else null end
  );
  if creator is null then
    raise exception 'no staff identity for create_event_with_blocks';
  end if;

  requested_status := coalesce(event_input->>'status', 'draft');
  if requested_status not in ('draft', 'published') then
    raise exception 'create_event_with_blocks: status % is not creatable (draft or published only)',
      requested_status using errcode = '22023';
  end if;

  insert into public.events (
    title, topic, description, max_attendees,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    hosted_by, organized_by,
    hero_image_url,
    registration_open_at, registration_close_at,
    category,
    format,
    checkin_modes,
    created_by
  ) values (
    event_input->>'title',
    event_input->>'topic',
    event_input->>'description',
    nullif(event_input->>'max_attendees','')::int,
    (event_input->>'start_time')::timestamptz,
    (event_input->>'end_time')::timestamptz,
    event_input->>'timezone',
    event_input->>'venue_name',
    event_input->>'venue_address',
    event_input->>'city',
    event_input->>'region',
    event_input->>'country',
    (event_input->>'latitude')::double precision,
    (event_input->>'longitude')::double precision,
    coalesce(event_input->'hosted_by',    '[]'::jsonb),
    coalesce(event_input->'organized_by', '[]'::jsonb),
    nullif(event_input->>'hero_image_url',''),
    nullif(event_input->>'registration_open_at','')::timestamptz,
    nullif(event_input->>'registration_close_at','')::timestamptz,
    nullif(event_input->>'category',''),
    nullif(event_input->>'format',''),
    coalesce(event_input->'checkin_modes', '{"staff": true, "self_serve": false}'::jsonb),
    creator
  )
  returning id into new_event_id;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
    insert into public.agenda_blocks (
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      new_event_id,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      block->>'host',
      coalesce(block->'topics', '[]'::jsonb),
      block->>'notes',
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  -- LAST, so the audit insert publish_event() ends with is the last statement
  -- before commit (the chain trigger holds pg_advisory_xact_lock to commit).
  if requested_status = 'published' then
    perform public.publish_event(new_event_id);
  end if;

  return new_event_id;
end;
$$;

create or replace function public.update_event_with_blocks(
  event_id_input uuid,
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  owner_id uuid;
  block jsonb;
begin
  select created_by into owner_id
  from public.events
  where id = event_id_input;

  if owner_id is null then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if auth.role() is distinct from 'service_role'
     and owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  update public.events set
    title          = event_input->>'title',
    topic          = nullif(event_input->>'topic',''),
    description    = nullif(event_input->>'description',''),
    max_attendees  = nullif(event_input->>'max_attendees','')::int,
    start_time     = (event_input->>'start_time')::timestamptz,
    end_time       = (event_input->>'end_time')::timestamptz,
    timezone       = event_input->>'timezone',
    venue_name     = event_input->>'venue_name',
    venue_address  = nullif(event_input->>'venue_address',''),
    city           = event_input->>'city',
    region         = nullif(event_input->>'region',''),
    country        = event_input->>'country',
    latitude       = (event_input->>'latitude')::double precision,
    longitude      = (event_input->>'longitude')::double precision,
    hosted_by      = coalesce(event_input->'hosted_by',    '[]'::jsonb),
    organized_by   = coalesce(event_input->'organized_by', '[]'::jsonb),
    hero_image_url = nullif(event_input->>'hero_image_url',''),
    registration_open_at  = nullif(event_input->>'registration_open_at','')::timestamptz,
    registration_close_at = nullif(event_input->>'registration_close_at','')::timestamptz,
    category       = nullif(event_input->>'category',''),
    format         = nullif(event_input->>'format',''),
    checkin_modes  = coalesce(event_input->'checkin_modes', checkin_modes)
  where id = event_id_input;

  if blocks_input is null or jsonb_typeof(blocks_input) <> 'array' then
    raise exception 'blocks_input must be a jsonb array';
  end if;

  delete from public.agenda_blocks where event_id = event_id_input;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
    insert into public.agenda_blocks (
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      event_id_input,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      nullif(block->>'host',''),
      coalesce(block->'topics', '[]'::jsonb),
      nullif(block->>'notes',''),
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return event_id_input;
end;
$$;

grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;
grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;

-- Self-verifying: format threaded through both RPCs, nothing else lost.
do $$
declare create_src text; update_src text;
begin
  select pg_get_functiondef(p.oid) into create_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_event_with_blocks';
  select pg_get_functiondef(p.oid) into update_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_event_with_blocks';

  if create_src not like '%format%' or update_src not like '%format%' then
    raise exception 'an event RPC lost the format column';
  end if;
  if create_src not like '%checkin_modes%' or update_src not like '%checkin_modes%' then
    raise exception 'an event RPC lost checkin_modes';
  end if;
  if create_src not like '%publish_event%' then
    raise exception 'create_event_with_blocks lost its audited publish path';
  end if;
  if update_src ~ 'status[[:space:]]*=' then
    raise exception 'update_event_with_blocks still assigns status — every organiser edit would 42501';
  end if;
  if not has_column_privilege('authenticated','public.events','format','INSERT')
     or not has_column_privilege('authenticated','public.events','format','UPDATE') then
    raise exception 'authenticated cannot write events.format — every create_event_with_blocks call would 42501';
  end if;
end $$;
