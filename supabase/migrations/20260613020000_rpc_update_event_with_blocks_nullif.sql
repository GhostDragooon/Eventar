-- Follow-up to 20260613010000 (Task D.1): normalize nullable text columns
-- so the form's '' (= absent input) round-trips back to NULL in the DB.
--
-- The first version of update_event_with_blocks wrote event_input->>'topic'
-- directly, which converts a jsonb '' to a SQL '' (not NULL). That means a
-- row whose topic was NULL silently became '' on the first no-edit Save —
-- not a data loss, but a shape change that would surprise any future code
-- that distinguishes `topic is null` from `topic = ''`. nullif(text,'')
-- folds both back to NULL, restoring the create-RPC semantics where these
-- columns are written either NULL or with real content.
--
-- Same fix applied at block level for host and notes (also nullable text).
-- All other RPC logic — security, owner check, status coalesce, blocks-
-- array guard, atomicity — is unchanged from 20260613010000.

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
    longitude     = (event_input->>'longitude')::double precision
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
