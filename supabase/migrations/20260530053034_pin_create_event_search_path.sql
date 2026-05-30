-- Re-pin search_path on create_event_with_blocks. The prior fix migration
-- (20260529115302) used CREATE OR REPLACE, which discards the proconfig
-- pin that 20260520174601_fix_security_lints set via a SEPARATE
-- `alter function ... set search_path`. That reverted the function to a
-- role-mutable search_path (advisor: function_search_path_mutable).
--
-- Fix durably by putting `set search_path` INLINE in the definition, so no
-- future CREATE OR REPLACE can drop it again.
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
