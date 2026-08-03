-- M2 — make check-in mode reachable from the organiser event form.
--
-- THE HOLE THIS CLOSES: public.events.checkin_modes has existed since
-- 20260701222914 (jsonb, NOT NULL, default {"staff": true, "self_serve":
-- false}) and NOTHING in the event create/edit UI ever wrote it. Every event
-- created through the product was therefore staff-only, and its attendees'
-- passes at /checkin/confirm all read "Self check-in isn't enabled for this
-- event — please see reception", while self_check_in() sat fully built:
-- SECURITY DEFINER, per-IP guess limiting (10/min), per-event cap (600/min),
-- wired to award_attendance_credit(), covered by tests/rls/self_check_in.rls.
-- Built and unreachable — the same shape of gap 20260802022345 closed for
-- accrediting_body_id / cpd_hours.
--
-- WHY THIS IS A COLUMN IN THE RPC WHITELIST AND NOT AN AUDITED DEFINER
-- FUNCTION LIKE set_event_cpd_config(). The question is live because
-- self-serve check-in mints attendance_verified credit, and the 2026-07-25
-- review (HIGH-2) specifically hardened who may mint that. Four facts:
--
--   1. THE CAPABILITY IS ALREADY GRANTED. `authenticated` holds column-level
--      UPDATE on events.checkin_modes today — verified live via
--      has_column_privilege, which returns true for checkin_modes and false
--      for cpd_hours / accrediting_body_id (20260725144446 revoked those two
--      specifically and re-granted every other column). An organiser can
--      already PATCH this column straight through PostgREST. A definer
--      function without a matching column REVOKE would audit the product path
--      while leaving the raw path open: theatre, not a gate.
--
--   2. NO CROSS-AUTHORITY CLAIM. HIGH-1 needed the definer treatment because
--      an organiser was asserting ANOTHER organisation's authority — binding
--      their event to any accrediting body, at any hours, minting permanent
--      regulator-facing credit that body never authorised. How the door is
--      run at an organiser's own event is squarely their own authority.
--
--   3. PROVENANCE IS ALREADY AUDITED PER CHECK-IN, NOT PER CONFIG.
--      mark_attended() writes write_audit_event(actor_user_id := auth.uid(),
--      actor_role := <staff role>, payload.via := 'staff_scan');
--      self_check_in() writes actor_role := 'self_check_in' with a null
--      actor. An auditor reading the chain can already tell self from staff
--      for every single attendance. Auditing the toggle would add nothing
--      they cannot already derive, at the cost of a second mutation surface.
--
--   4. CONVENTION (repo rule 11). Migration 20260702105349 states the
--      established pattern verbatim: "adding an event field = re-create the
--      RPCs with the new columns". checkin_modes is an event field. The CPD
--      columns are the documented exception, and they say why.
--
-- WHAT THIS DOES NOT DO, STATED PLAINLY: self_check_in() does not read this
-- flag. Verified live in pg_proc.prosrc — it enforces no time window, no
-- publication check and no checkin_modes check; its only predicate is
-- `status <> 'attended'`. The flag gates the UI (the "Confirm I'm here"
-- button on the pass page), not the RPC, so anyone holding a valid
-- registration code can already self-check-in on any event regardless of this
-- setting. This migration does not widen that surface and does not close it
-- either; it is tracked in docs/DEFERRED.md as part of the HIGH-2 residue.

-- ---------------------------------------------------------------------------
-- Layer 3 of the three-layer validation (hard rule 8). Until now nothing
-- constrained this column's shape, because nothing but the DEFAULT ever wrote
-- it. Now that a client payload reaches it, shape matters: the read side does
-- `event.checkin_modes?.self_serve === true`, so {"self_serve": "yes"} reads
-- as OFF forever with no error anywhere (rule 12 — fail visibly).
--
-- `is true` is load-bearing, not noise. jsonb_typeof(col -> 'missing_key')
-- returns SQL NULL, and a CHECK whose expression evaluates to NULL PASSES.
-- Without the wrapper, {"staff": true} (self_serve dropped entirely) would
-- slip straight through. Same trap one level up for a jsonb 'null' value,
-- which is not SQL NULL and so satisfies the NOT NULL constraint.
--
-- Shape mirrors the sibling constraints on this table (events_hosted_by_is_
-- array, events_organized_by_is_array).
alter table public.events
  add constraint events_checkin_modes_shape check (
    (
      jsonb_typeof(checkin_modes -> 'staff')      = 'boolean'
      and jsonb_typeof(checkin_modes -> 'self_serve') = 'boolean'
    ) is true
  );

-- ---------------------------------------------------------------------------
-- Both RPCs re-created from their LIVE definitions (pg_get_functiondef), not
-- from any migration file: they have been redefined four times since
-- 20260516105109 and the file history is not the current shape. In particular
-- the service_role executor branches (20260702112004) are preserved verbatim.
-- Both remain SECURITY INVOKER — despite 20260725144446's comment claiming
-- otherwise — so the events RLS policies still apply inside them.
--
-- Absent-key handling differs by direction, deliberately:
--   create: coalesce to the column default's literal value, so every existing
--           caller that omits the key (seed scripts, RLS fixtures, older
--           tests) behaves exactly as it does today.
--   update: coalesce to the CURRENT value. These RPCs are otherwise
--           full-replace (absent nullable keys overwrite to NULL), but that
--           is not an option on a NOT NULL column, and defaulting instead
--           would silently switch self-serve OFF for any caller that does not
--           send the key. Same precedent and same reasoning as `status`,
--           which already coalesces to the current value so an update can
--           never silently unpublish an event.

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

  insert into public.events (
    title, topic, description, max_attendees, status,
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
  -- Service-role executor: ownership already enforced in code by the caller.
  if auth.role() is distinct from 'service_role'
     and owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  update public.events set
    title          = event_input->>'title',
    topic          = nullif(event_input->>'topic',''),
    description    = nullif(event_input->>'description',''),
    max_attendees  = nullif(event_input->>'max_attendees','')::int,
    status         = coalesce(event_input->>'status', status),
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

-- CREATE OR REPLACE preserves the existing ACL, but re-assert it explicitly
-- so the grant posture is readable at the point of definition rather than
-- five migrations back.
grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;
grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;
