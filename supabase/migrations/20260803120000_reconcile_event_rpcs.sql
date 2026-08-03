-- 2026-08-03 — reconcile the two event RPCs after a concurrent-migration clobber.
--
-- THE COLLISION. Two Stage 7 branches landed migrations that each
-- `create or replace` BOTH event RPCs, each written from the live definition
-- as its baseline (correct practice in isolation — the file history has not
-- matched the live shape since 20260516105109). Neither could see the other:
--
--   20260802182411  events.status becomes definer-only. Drops `status` from
--                   create's insert list and from update's SET list; routes a
--                   create-time publish through publish_event(); revokes
--                   INSERT/UPDATE on status + published_at from authenticated.
--   20260803023000  checkin_modes reachable. Adds `checkin_modes` to both
--                   RPCs — and, from the older baseline, KEEPS `status` in
--                   create's insert list and `status = coalesce(...)` in
--                   update's SET list.
--
-- `create or replace function` is a whole-body overwrite with no merge and no
-- conflict detection, so the later timestamp wins outright. Replay order proved
-- it, in a rolled-back transaction on the local stack:
--
--   update_event_with_blocks still names status   -> true
--   authenticated holds UPDATE on events.status   -> false   ** every edit 42501
--   create_event_with_blocks calls publish_event   -> false   ** publish unaudited
--   create_event_with_blocks writes checkin_modes  -> true
--
-- Two live defects: the column privilege check runs against the SET LIST, not
-- the value, so naming an unwritable column breaks EVERY organiser edit even
-- when the value is unchanged (20260802182411's own header warned of exactly
-- this); and the publish path reverts to writing status directly, leaving
-- published_at NULL and nothing in the audit chain.
--
-- THE FIX: one final definition of each RPC carrying BOTH intents. Nothing
-- here is new behaviour — it is the union of two already-reviewed migrations.
-- Written as a third migration rather than by editing either file, because
-- 20260803023000 is already applied to the shared local stack and this repo's
-- history is append-only: corrections are new entries.
--
-- Grants need no restatement: 20260803023000 touches no column ACL, so
-- 20260802182411's lock survives the clobber intact (proven above —
-- authenticated_can_update_status was already false). Asserted at the end
-- anyway, per repo doctrine: prove grants live, never read them from text.

-- ---------------------------------------------------------------------------
-- create_event_with_blocks — draft-then-publish (20260802182411) + checkin_modes
-- (20260803023000).
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

  -- Only two statuses are creatable. Anything else is rejected rather than
  -- silently downgraded to the column default (rule 12 — fail visibly).
  -- A session-less service_role caller can only create drafts: publishing
  -- needs a staff actor to attribute the audit event to, and publish_event's
  -- require_active_staff() raises 42501 without one.
  requested_status := coalesce(event_input->>'status', 'draft');
  if requested_status not in ('draft', 'published') then
    raise exception 'create_event_with_blocks: status % is not creatable (draft or published only)',
      requested_status using errcode = '22023';
  end if;

  -- `status` is deliberately absent from this insert list: the column defaults
  -- to 'draft' and authenticated no longer holds INSERT on it.
  -- `checkin_modes` coalesces to the column default's literal value so every
  -- existing caller that omits the key (seed scripts, RLS fixtures, older
  -- tests) behaves exactly as it does today.
  insert into public.events (
    title, topic, description, max_attendees,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    hosted_by, organized_by,
    hero_image_url,
    registration_open_at, registration_close_at,
    category,
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

-- ---------------------------------------------------------------------------
-- update_event_with_blocks — no `status` in the SET list (20260802182411) +
-- checkin_modes coalescing to the CURRENT value (20260803023000).
-- ---------------------------------------------------------------------------
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
  -- Service-role executor: ownership already enforced in code by the caller.
  if auth.role() is distinct from 'service_role'
     and owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  -- Lifecycle is not editable here — publish_event() owns status transitions,
  -- and naming `status` at all would fail the column-privilege check on the
  -- SET list for every organiser edit. A `status` key in event_input is
  -- ignored, which is what the old coalesce did for every caller the app has.
  --
  -- checkin_modes coalesces to the CURRENT value, not the default. These RPCs
  -- are otherwise full-replace, but that is not an option on a NOT NULL
  -- column, and defaulting instead would silently switch self-serve OFF for
  -- any caller that does not send the key.
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

-- ---------------------------------------------------------------------------
-- Self-verifying assertions: both intents present, neither clobbered.
-- ---------------------------------------------------------------------------
do $$
declare create_src text; update_src text;
begin
  select pg_get_functiondef(p.oid) into create_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_event_with_blocks';
  select pg_get_functiondef(p.oid) into update_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_event_with_blocks';

  if create_src not like '%publish_event%' then
    raise exception 'create_event_with_blocks lost its audited publish path';
  end if;
  if create_src not like '%checkin_modes%' or update_src not like '%checkin_modes%' then
    raise exception 'an event RPC lost checkin_modes';
  end if;
  -- The SET list is what the column-privilege check reads. `status` must not
  -- appear on the left of an assignment in the UPDATE.
  if update_src like '%status         =%' or update_src like '%status =%' then
    raise exception 'update_event_with_blocks still assigns status — every organiser edit would 42501';
  end if;
  if has_column_privilege('authenticated','public.events','status','UPDATE')
     or has_column_privilege('authenticated','public.events','status','INSERT') then
    raise exception 'events.status is directly writable by authenticated again';
  end if;
end $$;

-- Rollback: re-apply 20260803023000 (restores the pre-reconcile shape, and
-- re-breaks organiser edits — do not roll back without also reverting
-- 20260802182411's grant lock).
