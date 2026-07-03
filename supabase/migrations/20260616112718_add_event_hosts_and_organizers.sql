-- BACKFILLED 2026-07-04 from remote supabase_migrations.schema_migrations
-- (applied to remote 2026-06-16 via MCP during the redesign phase without a
-- local file — drift repair, content verbatim from the stored statements).

-- Wave 2: hosted_by + organized_by — JSON arrays of partner refs:
--   [{name: string, url?: string}]
-- Both default to an empty array. CHECK constraint enforces array shape
-- so a malformed jsonb (object, scalar) can't sneak in.
alter table public.events
  add column hosted_by jsonb not null default '[]'::jsonb,
  add column organized_by jsonb not null default '[]'::jsonb;

alter table public.events
  add constraint events_hosted_by_is_array check (jsonb_typeof(hosted_by) = 'array'),
  add constraint events_organized_by_is_array check (jsonb_typeof(organized_by) = 'array');

-- Recreate the create RPC with the new columns. All other logic unchanged.
create or replace function public.create_event_with_blocks(
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_event_id uuid;
  block jsonb;
begin
  insert into public.events (
    title, topic, description, max_attendees, status,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    hosted_by, organized_by,
    created_by
  ) values (
    event_input->>'title',
    event_input->>'topic',
    event_input->>'description',
    nullif(event_input->>'max_attendees','')::int,
    coalesce(event_input->>'status','draft'),
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
    app_private.current_staff_id()
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

  return new_event_id;
end;
$$;

grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;

-- Recreate the update RPC with the new columns. nullif pattern from
-- 20260613020000 preserved for the existing nullable text columns.
create or replace function public.update_event_with_blocks(
  event_id_input uuid,
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
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
  if owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  update public.events set
    title         = event_input->>'title',
    topic         = nullif(event_input->>'topic',''),
    description   = nullif(event_input->>'description',''),
    max_attendees = nullif(event_input->>'max_attendees','')::int,
    status        = coalesce(event_input->>'status', status),
    start_time    = (event_input->>'start_time')::timestamptz,
    end_time      = (event_input->>'end_time')::timestamptz,
    timezone      = event_input->>'timezone',
    venue_name    = event_input->>'venue_name',
    venue_address = nullif(event_input->>'venue_address',''),
    city          = event_input->>'city',
    region        = nullif(event_input->>'region',''),
    country       = event_input->>'country',
    latitude      = (event_input->>'latitude')::double precision,
    longitude     = (event_input->>'longitude')::double precision,
    hosted_by     = coalesce(event_input->'hosted_by',    '[]'::jsonb),
    organized_by  = coalesce(event_input->'organized_by', '[]'::jsonb)
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

grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;
