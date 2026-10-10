-- 2026-10-02 — create_event_with_blocks forwards its actor to publish_event.
--
-- Finding B3 (docs/plans/handoff_20261001-core-ux.md): creating an event with
-- status='published' calls the nested publish_event(new_event_id) WITHOUT the
-- actor. Under a real JWT that is fine (publish_event resolves the caller from
-- the JWT email), but a service-role client (review mode, scripts, tests) has
-- no JWT email, so require_active_staff() raised 42501 for EVERY role and the
-- app then blamed "this account". Proven in SQL on 2026-10-01: the same call
-- succeeds with a real JWT and fails under the service role.
--
-- Fix: pass the creator we already resolved as p_actor_override. Safety is
-- unchanged and was reviewed in 20260814020000: resolve_actor() honours the
-- override ONLY when auth.role() = 'service_role' (the claim is verified by
-- PostgREST against the signing secret, so a real authenticated caller cannot
-- forge it), and it still requires the override staff row to be active with
-- one of the publishing roles, so a body_admin or auditor creator is still
-- refused (42501) and the whole create rolls back. For a real authenticated
-- caller `creator` is app_private.current_staff_id() and the override is a
-- no-op.
--
-- Body is otherwise byte-for-byte the definition in 20260914000000 (the last
-- full definition, verified before editing); the nested publish stays the LAST
-- statement so the audit insert it ends with is the last statement before
-- commit (chain trigger holds pg_advisory_xact_lock to commit).
-- create or replace keeps the existing owner and grants.
--
-- Rollback: re-apply the definition in 20260914000000_*.sql (the previous full
-- one) with create or replace; it differs from this one only in that single
-- call. Nothing else depends on the change.

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
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order,
      sponsored, sponsor_name
    ) values (
      new_event_id,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      block->>'host',
      coalesce(block->'topics', '[]'::jsonb),
      block->>'notes',
      coalesce((block->>'display_order')::int, 0),
      coalesce((block->>'sponsored')::boolean, false),
      nullif(block->>'sponsor_name','')
    );
  end loop;

  -- LAST, so the audit insert publish_event() ends with is the last statement
  -- before commit (the chain trigger holds pg_advisory_xact_lock to commit).
  if requested_status = 'published' then
    perform public.publish_event(new_event_id, creator);
  end if;

  return new_event_id;
end;
$$;

-- Self-check against the applied definition (reading this file is not proof the
-- function in the database changed). It asserts the call text and that the grants
-- survived the replace; the audit-last ordering is proven by the RLS test, which
-- reads the audit row back, not by this text match.
do $$
declare
  def text := pg_get_functiondef('public.create_event_with_blocks(jsonb,jsonb)'::regprocedure);
begin
  if position('publish_event(new_event_id, creator)' in def) = 0 then
    raise exception 'create_event_with_blocks does not forward the actor to publish_event';
  end if;
  if position('publish_event(new_event_id)' in def) <> 0 then
    raise exception 'create_event_with_blocks still contains the actorless publish_event call';
  end if;
  if not has_function_privilege('authenticated', 'public.create_event_with_blocks(jsonb,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.create_event_with_blocks(jsonb,jsonb)', 'execute') then
    raise exception 'create_event_with_blocks lost execute for authenticated or service_role';
  end if;
end;
$$;
