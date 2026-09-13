-- 2026-09-14 — Agenda block type taxonomy overhaul (Ivan's locked instruction,
-- "VENTAR — AGENDA BLOCK TYPES INSTRUCTION", 2026-09-13).
--
-- Old kind list (workshop/seminar/webinar/scientific_program/panel/roundtable/
-- keynote/other/break/transition) mixed real session/component types with
-- high-level event formats and delivery modes. New list reflects real
-- professional medical/scientific/CPD event components. webinar,
-- scientific_program, seminar and transition drop from the UI but stay in the
-- CHECK constraint so existing rows using them remain valid (fail-visibly,
-- not silently invalidated — Hard Rule 12).
--
-- Also adds a sponsored/industry-supported toggle so "Sponsored Session"
-- doesn't need its own block type (§5 of the instruction): any educational
-- block can carry sponsored=true + an optional sponsor_name.

alter table public.agenda_blocks
  drop constraint agenda_blocks_kind_check;

alter table public.agenda_blocks
  add constraint agenda_blocks_kind_check check (kind in (
    -- primary (always-visible chips)
    'keynote','lecture','symposium','panel','workshop',
    'case_presentation','oral_abstract','debate','break','other',
    -- secondary (behind "More")
    'roundtable','masterclass','case_discussion','case_competition',
    'poster_session','moderated_poster','meet_the_expert','fireside_chat',
    'opening_ceremony','closing_ceremony','awards',
    -- legacy — removed from the UI, kept so existing rows stay valid
    'webinar','scientific_program','seminar','transition'
  ));

alter table public.agenda_blocks
  add column if not exists sponsored boolean not null default false,
  add column if not exists sponsor_name text;

comment on column public.agenda_blocks.sponsored is
  'Industry-supported / sponsored block (e.g. Lunch Symposium, Sponsored Lecture). Not a separate kind — see instruction §5.';
comment on column public.agenda_blocks.sponsor_name is
  'Optional sponsor name, shown only when sponsored = true.';

-- agenda_blocks has always used table-level grants (verified live: anon/
-- authenticated/service_role/postgres all hold table-level INSERT+UPDATE),
-- not the column-level grants events.format tripped over in 20260906010000
-- — so no new grant statements are needed for the two new columns. The
-- self-check below verifies this instead of re-trusting the read.

-- ---------------------------------------------------------------------------
-- Thread sponsored/sponsor_name through both event RPCs (same whitelist-
-- column pattern as format/category — see 20260906010000, 20260910000000
-- for the last full definition of each). Bodies are otherwise byte-for-byte
-- identical to those migrations; only the agenda_blocks insert's column
-- list and values gain the two new fields.
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
    perform public.publish_event(new_event_id);
  end if;

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
  v_event_org uuid;
  block jsonb;
begin
  select organisation_id into v_event_org
  from public.events
  where id = event_id_input;

  if v_event_org is null then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if auth.role() is distinct from 'service_role'
     and v_event_org is distinct from app_private.current_staff_org_id() then
    raise exception 'not in the same organisation as event %', event_id_input;
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
  where id = event_id_input;

  if blocks_input is null or jsonb_typeof(blocks_input) <> 'array' then
    raise exception 'blocks_input must be a jsonb array';
  end if;

  delete from public.agenda_blocks where event_id = event_id_input;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
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
      block->'topics',
      block->>'notes',
      coalesce((block->>'display_order')::int, 0),
      coalesce((block->>'sponsored')::boolean, false),
      nullif(block->>'sponsor_name','')
    );
  end loop;

  return event_id_input;
end;
$$;

grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;
grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;

-- Self-verifying (same pattern as 20260906010000): confirm the new kinds are
-- accepted, sponsored/sponsor_name survive both RPCs, nothing structural was
-- lost, and the "table-level grants, no column-level trap" read above holds.
do $$
declare
  create_src text;
  update_src text;
  kind_check_def text;
begin
  select pg_get_functiondef(p.oid) into create_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_event_with_blocks';
  select pg_get_functiondef(p.oid) into update_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_event_with_blocks';
  select pg_get_constraintdef(oid) into kind_check_def
    from pg_constraint
   where conrelid = 'public.agenda_blocks'::regclass and conname = 'agenda_blocks_kind_check';

  if create_src not like '%sponsored%' or update_src not like '%sponsored%' then
    raise exception 'an event RPC lost the sponsored column';
  end if;
  if create_src not like '%sponsor_name%' or update_src not like '%sponsor_name%' then
    raise exception 'an event RPC lost the sponsor_name column';
  end if;
  if create_src not like '%format%' or update_src not like '%format%' then
    raise exception 'an event RPC lost the format column';
  end if;
  if create_src not like '%publish_event%' then
    raise exception 'create_event_with_blocks lost its audited publish path';
  end if;
  if update_src ~ 'status[[:space:]]*=' then
    raise exception 'update_event_with_blocks still assigns status — every organiser edit would 42501';
  end if;

  if kind_check_def not like '%case_presentation%' or kind_check_def not like '%awards%' then
    raise exception 'agenda_blocks_kind_check is missing new block kinds';
  end if;
  if kind_check_def not like '%seminar%' or kind_check_def not like '%transition%' then
    raise exception 'agenda_blocks_kind_check dropped a legacy kind — existing rows would become invalid';
  end if;

  if not has_column_privilege('service_role','public.agenda_blocks','sponsored','INSERT')
     or not has_column_privilege('service_role','public.agenda_blocks','sponsor_name','INSERT') then
    raise exception 'service_role cannot write agenda_blocks sponsored/sponsor_name — every create_event_with_blocks call would 42501';
  end if;
  if not has_column_privilege('authenticated','public.agenda_blocks','sponsored','INSERT')
     or not has_column_privilege('authenticated','public.agenda_blocks','sponsor_name','INSERT') then
    raise exception 'authenticated cannot write agenda_blocks sponsored/sponsor_name — every create_event_with_blocks call would 42501';
  end if;
end $$;
