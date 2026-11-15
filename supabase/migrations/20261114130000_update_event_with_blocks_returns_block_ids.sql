-- MVP close, agenda (b): update_event_with_blocks returns the saved block ids instead of only the event id.
-- The edit action used to read the blocks back by display_order and map them through its own sort order, and refused
-- a count mismatch after the save had already gone through (dev-lens m4). The ids now come from the write itself:
-- {"event_id": <uuid>, "block_ids": [<uuid> ...]}, block_ids in payload order (a kept block keeps its id, a new one
-- gets the id the insert returned).
--
-- The return type changes, so the function is dropped and recreated; the body is otherwise the live one (Q51 /
-- DB-04 version), SECURITY INVOKER as before. A dropped function loses its grants and a new function starts with
-- EXECUTE for PUBLIC, so the grants are restated and asserted: authenticated and service_role only.

drop function public.update_event_with_blocks(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.update_event_with_blocks(event_id_input uuid, event_input jsonb, blocks_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event_org uuid;
  v_status    text;
  v_rows      integer;
  v_idx       integer := 0;
  v_ids       uuid[]  := '{}';
  v_id        uuid;
  v_gone      record;
  block       jsonb;
  v_out       uuid[]  := '{}';
begin
  if blocks_input is null or jsonb_typeof(blocks_input) <> 'array' then
    raise exception 'blocks_input must be a jsonb array' using errcode = '22023';
  end if;

  select organisation_id into v_event_org
  from public.events
  where id = event_id_input;

  if v_event_org is null then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if auth.role() is distinct from 'service_role'
     and v_event_org is distinct from app_private.current_staff_org_id() then
    raise exception 'update_event_with_blocks: event % is not in your organisation', event_id_input
      using errcode = '42501';
  end if;

  -- Row lock: publish_event updates this row (a FOR NO KEY UPDATE lock too), so it waits for this save to commit and
  -- a publish can no longer slip in between the status read below and the writes after it. A soft-deleted event is
  -- gone for everyone, as on the public path. NO KEY UPDATE, not UPDATE: foreign-key checks on events(id) take KEY SHARE
  -- and must not wait for a save.
  select status into v_status from public.events where id = event_id_input and deleted_at is null for no key update;
  if not found then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if v_status <> 'draft' then
    raise exception 'event_not_draft: event % is % and its details cannot be edited yet', event_id_input, v_status
      using errcode = '22023';
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
  where id = event_id_input and status = 'draft';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'update_event_with_blocks: event % was not updated (it changed state, or it is not yours to edit)', event_id_input
      using errcode = '22023';
  end if;

  -- Block ids named in the payload must be this event's own blocks, once each.
  for block in select * from jsonb_array_elements(blocks_input)
  loop
    v_id := nullif(block->>'id','')::uuid;
    if v_id is not null then
      if v_id = any(v_ids) then
        raise exception 'update_event_with_blocks: block % appears twice in the payload', v_id using errcode = '22023';
      end if;
      if not exists (select 1 from public.agenda_blocks where id = v_id and event_id = event_id_input) then
        raise exception 'update_event_with_blocks: block % is not part of event %', v_id, event_id_input
          using errcode = '22023';
      end if;
      v_ids := v_ids || v_id;
    end if;
  end loop;

  -- A block left out of the payload is removed, unless a survey answer points at it.
  for v_gone in select id, title from public.agenda_blocks where event_id = event_id_input and id <> all(v_ids)
  loop
    if app_private.block_has_survey_answers(v_gone.id) then
      raise exception 'block_has_survey_answers: %', v_gone.title using errcode = '22023';
    end if;
    delete from public.agenda_blocks where id = v_gone.id;
  end loop;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
    v_id := nullif(block->>'id','')::uuid;
    if v_id is not null then
      update public.agenda_blocks set
        start_time    = (block->>'start_time')::timestamptz,
        end_time      = (block->>'end_time')::timestamptz,
        kind          = block->>'kind',
        title         = block->>'title',
        host          = block->>'host',
        topics        = case when jsonb_typeof(block->'topics') = 'array' then block->'topics' else '[]'::jsonb end,
        notes         = block->>'notes',
        display_order = v_idx,
        sponsored     = coalesce((block->>'sponsored')::boolean, false),
        sponsor_name  = nullif(block->>'sponsor_name','')
      where id = v_id and event_id = event_id_input;
    else
      insert into public.agenda_blocks (
        event_id, start_time, end_time, kind, title, host, topics, notes, display_order,
        sponsored, sponsor_name
      ) values (
        event_id_input,
        (block->>'start_time')::timestamptz,
        (block->>'end_time')::timestamptz,
        block->>'kind',
        block->>'title',
        block->>'host',
        case when jsonb_typeof(block->'topics') = 'array' then block->'topics' else '[]'::jsonb end,
        block->>'notes',
        v_idx,
        coalesce((block->>'sponsored')::boolean, false),
        nullif(block->>'sponsor_name','')
      ) returning id into v_id;
    end if;
    v_out := v_out || v_id;
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('event_id', event_id_input, 'block_ids', to_jsonb(v_out));
end;
$function$;

revoke execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated, service_role;

do $$
declare
  f regprocedure := 'public.update_event_with_blocks(uuid, jsonb, jsonb)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('public', f, 'EXECUTE') then
    raise exception 'update_event_with_blocks: anon or PUBLIC can execute it';
  end if;
  if not (has_function_privilege('authenticated', f, 'EXECUTE') and has_function_privilege('service_role', f, 'EXECUTE')) then
    raise exception 'update_event_with_blocks: authenticated or service_role cannot execute it';
  end if;
  if (select prosecdef from pg_proc where oid = f) then
    raise exception 'update_event_with_blocks: must stay SECURITY INVOKER (the Q51 writer guard keys on the caller)';
  end if;
end $$;
