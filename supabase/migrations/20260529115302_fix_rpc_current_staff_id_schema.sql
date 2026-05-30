-- 2026-05-29 — Phase 4.6 smoke: create_event_with_blocks RPC failed at
-- runtime with "function current_staff_id() does not exist" because the
-- 2026-05-21 security-lints migration moved current_staff_id() from
-- `public` to `app_private` (good — it should not be on the public API
-- surface), updated every RLS policy reference, but missed THIS RPC body.
--
-- The RPC uses `security invoker`, so the caller's search_path applies
-- (default: "$user", public). Unqualified `current_staff_id()` therefore
-- only resolves if the function lives in `public` — which it no longer does.
--
-- Fix is a one-line schema-qualifier change inside the INSERT into
-- public.events.created_by. Everything else in the RPC body is unchanged.
-- The RPC's grant statement is preserved by the explicit `grant execute`
-- at the bottom (CREATE OR REPLACE keeps grants but we re-grant for safety,
-- mirroring the pattern from the original migration).

create or replace function public.create_event_with_blocks(
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_event_id uuid;
  block jsonb;
begin
  insert into public.events (
    title, topic, description, max_attendees, status,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
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
