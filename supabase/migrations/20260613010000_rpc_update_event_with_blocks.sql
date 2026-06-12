-- Task D.1 (2026-06-11 redesign): owner-gated atomic event update.
--
-- Mirrors the LATEST surviving shape of create_event_with_blocks
-- (20260530053034_pin_create_event_search_path.sql): security INVOKER,
-- search_path pinned INLINE in the definition (so a future CREATE OR
-- REPLACE can't drop it), app_private.current_staff_id(), explicit
-- re-grant to authenticated. Note: the create RPC has been `security
-- invoker` in every definition since 20260516105109 — there is no
-- SECURITY DEFINER shape to mirror.
--
-- Because it runs as INVOKER (the staff member's authenticated session via
-- supabaseServer), the events/agenda_blocks organizer RLS policies still
-- apply inside the function. The explicit owner check below is belt and
-- braces on top of RLS: it turns the silent 0-row no-op a non-owner would
-- otherwise get into a visible exception (contract rule 12), and keeps
-- guarding if this function is ever redefined as SECURITY DEFINER or called
-- with the service-role client.
--
-- Blocks are replaced wholesale (delete + reinsert) inside the function —
-- plpgsql functions run in the calling transaction, so a failed reinsert
-- rolls back the delete and the events update together (atomic).
--
-- Documented trade-off: survey_responses.valuable_block_id references
-- agenda_blocks(id) ON DELETE SET NULL (20260611110000_survey_q2_session_mc),
-- so replacing blocks nulls any survey references to the old block rows.
-- Acceptable: surveys exist only post-event, edits matter pre-event. No
-- other table holds an FK to agenda_blocks — speaker_checkins references
-- events(id) and keys speakers by name, not block id, so it survives a
-- block replace untouched.
--
-- updated_at: the events_touch_updated_at trigger bumps events.updated_at
-- on the UPDATE; reinserted agenda_blocks get fresh created_at/updated_at
-- defaults. No manual timestamp handling, matching every other write path.
--
-- Full-replace semantics: absent nullable keys overwrite to NULL; the action
-- layer must always send complete payloads (Zod enforces this in D.2).

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

  -- Under invoker RLS a non-owner organizer cannot see the row at all, so
  -- "not found" covers both a bad id and an invisible event; the explicit
  -- owner comparison catches callers who can read but don't own (managers).
  -- IS DISTINCT FROM, not <>: current_staff_id() is null for a caller with
  -- no staff row, and `owner_id <> null` would evaluate to null and skip
  -- the raise.
  if owner_id is null then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  update public.events set
    title         = event_input->>'title',
    topic         = event_input->>'topic',
    description   = event_input->>'description',
    max_attendees = nullif(event_input->>'max_attendees','')::int,
    -- Delta vs the create RPC (which defaults absent status to 'draft'):
    -- on update, an absent status keeps the current value — never silently
    -- unpublish an event.
    status        = coalesce(event_input->>'status', status),
    start_time    = (event_input->>'start_time')::timestamptz,
    end_time      = (event_input->>'end_time')::timestamptz,
    timezone      = event_input->>'timezone',
    venue_name    = event_input->>'venue_name',
    venue_address = event_input->>'venue_address',
    city          = event_input->>'city',
    region        = event_input->>'region',
    country       = event_input->>'country',
    latitude      = (event_input->>'latitude')::double precision,
    longitude     = (event_input->>'longitude')::double precision
    -- created_by deliberately untouched: ownership never transfers here.
  where id = event_id_input;

  -- Rule 12 guard: jsonb_array_elements(NULL) yields zero rows, so a SQL NULL
  -- here would delete every block and silently reinsert nothing. Unlike the
  -- create RPC (where "no blocks" is harmless), delete-first makes this a
  -- silent-data-loss path — reject anything that isn't a jsonb array.
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
      block->>'host',
      coalesce(block->'topics', '[]'::jsonb),
      block->>'notes',
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return event_id_input;
end;
$$;

grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;
