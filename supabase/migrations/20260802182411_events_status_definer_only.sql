-- 2026-08-03 — events.status becomes definer-only: every publish is audited.
--
-- THE HOLE THIS CLOSES: publish_event() was one of FIVE ways to reach
-- status='published', and the only audited one. Probed live on the local stack
-- as a real organiser_member JWT (one transaction, rolled back):
--
--   path                                              status      published_at  audit rows
--   A  create_event_with_blocks(status='published')    published   NULL          0
--   B  publish_event()                                 published   set           1   OK
--   C  UPDATE events SET status='published'            published   NULL          0
--   D  update_event_with_blocks(status in payload)     published   NULL          0
--   E  INSERT INTO events (..., status='published')    published   NULL          0
--
-- Path A is the create form's own "Publish Event" button — the primary way an
-- organiser publishes a first event, and it left no trace in the chain at all.
-- C/D/E are the same root cause: `status` was a plain writable column, so the
-- audited definer function was a convention, not a constraint. An
-- audit-completeness hole in the regulator-facing chain, and published_at was
-- unreliable for any consumer (NULL on 4 of the 5 paths).
--
-- THE FIX, in the shape this repo already uses for staff.role (set_staff_role)
-- and events.cpd_hours/accrediting_body_id (set_event_cpd_config): revoke the
-- column from the app roles so the audited definer function is the ONLY writer,
-- then route the one legitimate caller through it.
--
--   · create_event_with_blocks inserts as draft, then calls publish_event()
--     when the caller asked for 'published'. Same transaction (PostgREST runs
--     an RPC in one), so a failed publish rolls the create back — no orphan
--     draft, and the audit insert stays LAST before commit (the chain trigger
--     holds pg_advisory_xact_lock to commit).
--   · update_event_with_blocks stops naming `status` at all. It already
--     documented "status is deliberately never sent" (updateAction.ts) — this
--     makes that structural instead of conventional. Column privileges are
--     checked against the SET list, not the value, so leaving
--     `status = coalesce(..., status)` there would break every organiser edit
--     the moment the grant is revoked.
--
-- SIDE EFFECT, DELIBERATE: 'cancelled'/'completed' are no longer settable by
-- authenticated either. Nothing regresses — the only status write in app code
-- is cancelEvents() in app/dashboard/actions.ts, which uses the service_role
-- client (service_role keeps its table grant, mirroring 20260725144446). A
-- future organiser-facing cancel surface needs its own audited definer
-- function, which is fitting rule 4, not a new cost.
--
-- ADJACENT FINDING, closed by the same grant statement: the 2026-07-25 review
-- (HIGH-1b) revoked UPDATE on accrediting_body_id/cpd_hours but not INSERT, so
-- an organiser could POST a NEW event already bound to any accrediting body
-- with 24 CPD hours — bypassing set_event_cpd_config's organiser_admin gate and
-- its active-body check, and out of reach of the BEFORE UPDATE freeze trigger.
-- Verified reproducible live before this migration; the INSERT lock below
-- closes it. Nothing legitimate loses access: create_event_with_blocks does not
-- insert those columns (seed-demo.ts sets them afterwards as service_role), and
-- CPD-config-at-creation is planned to reuse set_event_cpd_config anyway.

-- ---------------------------------------------------------------------------
-- (1) create_event_with_blocks — insert as draft; publish through the audited
--     function. Body is otherwise byte-identical to 20260702112004 (verified
--     against pg_get_functiondef on the live local schema before editing).
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
  -- NOTE: a session-less service_role caller can only create drafts; publishing
  -- needs a staff actor to attribute the audit event to, and publish_event's
  -- require_active_staff() will raise 42501 without one. Create as draft, then
  -- publish as staff.
  requested_status := coalesce(event_input->>'status', 'draft');
  if requested_status not in ('draft', 'published') then
    raise exception 'create_event_with_blocks: status % is not creatable (draft or published only)',
      requested_status using errcode = '22023';
  end if;

  -- `status` is deliberately absent from this insert list: the column defaults
  -- to 'draft' and authenticated no longer holds INSERT on it.
  insert into public.events (
    title, topic, description, max_attendees,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    hosted_by, organized_by,
    hero_image_url,
    registration_open_at, registration_close_at,
    category,
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
  -- before commit. publish_event is SECURITY DEFINER: it re-derives the actor
  -- server-side, enforces owner-exclusivity, sets published_at and writes the
  -- event_published audit row.
  if requested_status = 'published' then
    perform public.publish_event(new_event_id);
  end if;

  return new_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- (2) update_event_with_blocks — stop naming `status`. Everything else is
--     byte-identical to 20260702112004.
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

  -- Lifecycle is not editable here — publish_event() owns status transitions.
  -- A `status` key in event_input is ignored, which is what the old
  -- `coalesce(event_input->>'status', status)` did for every caller the app
  -- actually has (updateAction.ts never sends the key).
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
    category       = nullif(event_input->>'category','')
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

-- ---------------------------------------------------------------------------
-- (3) The grant lock. Table REVOKE must come FIRST — a column-level revoke is a
--     silent no-op while a table-level grant still stands (this repo has been
--     bitten by that four times; see CLAUDE.md Hard Rule 11).
--
--     Locked for anon + authenticated: status, published_at (the two halves of
--     the same publish fact), accrediting_body_id, cpd_hours (HIGH-1b, now on
--     INSERT too). service_role keeps both table grants, mirroring
--     20260725144446 — it is the trusted server-side path (dashboard bulk
--     cancel, seed-demo.ts, the reconcile script).
--     anon is revoked and NOT re-granted: its events INSERT/UPDATE grants are
--     inert (no anon write policy on events), same call as 20260725144446.
-- ---------------------------------------------------------------------------
revoke insert, update on public.events from anon, authenticated;
grant insert (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at, organisation_id
) on public.events to authenticated;
grant update (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at, organisation_id
) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions (repo doctrine: prove grants live, never read them
-- from migration text).
-- ---------------------------------------------------------------------------
do $$
declare col text;
begin
  foreach col in array array['status','published_at','accrediting_body_id','cpd_hours'] loop
    if has_column_privilege('authenticated','public.events',col,'UPDATE')
       or has_column_privilege('authenticated','public.events',col,'INSERT') then
      raise exception 'events.% is still directly writable by authenticated', col;
    end if;
  end loop;
  if not has_column_privilege('authenticated','public.events','title','UPDATE')
     or not has_column_privilege('authenticated','public.events','title','INSERT') then
    raise exception 'over-revoked: authenticated lost INSERT/UPDATE on a normal column (title)';
  end if;
  if not has_table_privilege('service_role','public.events','UPDATE')
     or not has_table_privilege('service_role','public.events','INSERT') then
    raise exception 'service_role lost its events write path';
  end if;
end $$;

-- Rollback:
--   grant insert, update on public.events to authenticated;
--   (then re-apply 20260725144446's column lock if you still want HIGH-1b closed)
--   (re-apply 20260702112004 to restore both RPC bodies)
