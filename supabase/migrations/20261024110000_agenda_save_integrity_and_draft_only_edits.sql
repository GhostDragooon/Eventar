-- DB-04 (MVP plan, P4/O3): an agenda save never loses or duplicates anything, and a published event is not edited.
--
-- 1. update_event_with_blocks deleted every agenda block and re-inserted the payload on every save. That made new
--    block ids on each save (anything pointing at a block lost it: survey_responses.valuable_block_id is ON DELETE
--    SET NULL, so a survey answer silently lost its block), and it let a save remove a block people had answered
--    about. It is now a per-block upsert keyed by block id:
--      - a payload block with an id updates that block; the id must belong to this event and appear once;
--      - a payload block without an id is inserted;
--      - a block left out of the payload is removed, unless a survey answer points at it: that refuses the whole
--        save with `block_has_survey_answers: <title>` (rule 12);
--      - display_order is the payload index, not whatever the caller sent;
--      - the whole thing is one transaction, so a refusal leaves the event and its agenda untouched.
--
-- 2. Until the audited post-publish edit (P9b) exists, a published event is not edited (Ivan's ruling, UPD-01,
--    2026-10-23), at every layer a signed-in user can reach:
--      - the RPC locks the event row and refuses any status but draft with `event_not_draft` (22023), for every
--        role; its UPDATE also carries `and status = 'draft'` and a row-count check;
--      - a BEFORE UPDATE trigger on events refuses a change to any column but registration_close_at when the row is
--        not a draft (what `authenticated` can UPDATE are the detail columns). registration_close_at is the one
--        exception: the Close registration editor on the details page writes it on a published event and must keep
--        working;
--      - a BEFORE INSERT/UPDATE/DELETE trigger on agenda_blocks refuses any write unless the parent event is a draft.
--    Both triggers hold only `authenticated` and `anon` (PostgREST): definer functions (publish, cancel, complete)
--    run as the table owner and server code and scripts as service_role, so they pass.
--
-- 3. The cross-organisation refusal in the RPC is now a clean 42501 ("is not in your organisation"), like DB-03.
--    The platform operator (eventar_staff) from another organisation is still refused: letting them edit would need
--    UPDATE policies on events and agenda_blocks that do not exist. Ivan's call, listed in docs/plans/mvp/DB-04.md.
--
-- Operations: function and trigger replacements, no table rewrite. `supabase db push` runs this file in one
-- transaction; the self-check raises, and the push rolls back, if any piece did not land. Idempotent.
-- Rollback: drop the two triggers and their functions, drop app_private.block_has_survey_answers, and restore
-- update_event_with_blocks from 20260914000000_agenda_block_types_sponsored.sql (the latest earlier definition;
-- copy the single function, do not re-run files).

-- Survey answers are read as a definer so the check does not depend on what the caller's RLS lets them see.
create or replace function app_private.block_has_survey_answers(p_block_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.survey_responses where valuable_block_id = p_block_id);
$function$;

revoke all on function app_private.block_has_survey_answers(uuid) from public, anon;
grant execute on function app_private.block_has_survey_answers(uuid) to authenticated, service_role;

create or replace function public.update_event_with_blocks(event_id_input uuid, event_input jsonb, blocks_input jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event_org uuid;
  v_status    text;
  v_rows      integer;
  v_idx       integer := 0;
  v_ids       uuid[]  := '{}';
  v_id        uuid;
  v_gone      record;
  block       jsonb;
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
      );
    end if;
    v_idx := v_idx + 1;
  end loop;

  return event_id_input;
end;
$function$;

revoke execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated, service_role;

-- A signed-in user changes the details of a draft only. Every column but registration_close_at counts (the ones
-- `authenticated` can UPDATE are the details; any column granted later is covered without touching this).
create or replace function app_private.events_draft_only_detail_edits()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user not in ('authenticated', 'anon') or old.status = 'draft' then
    return new;
  end if;
  if to_jsonb(new) - 'registration_close_at' is distinct from to_jsonb(old) - 'registration_close_at' then
    raise exception 'event_not_draft: event % is % and its details cannot be edited yet', old.id, old.status
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

drop trigger if exists events_draft_only_detail_edits on public.events;
create trigger events_draft_only_detail_edits
  before update on public.events
  for each row execute function app_private.events_draft_only_detail_edits();

create or replace function app_private.agenda_blocks_draft_only_writes()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event uuid;
  v_status text;
begin
  if current_user in ('authenticated', 'anon') then
    foreach v_event in array case tg_op
        when 'INSERT' then array[new.event_id]
        when 'DELETE' then array[old.event_id]
        else array[old.event_id, new.event_id] end
    loop
      select status into v_status from public.events where id = v_event;
      if v_status is distinct from 'draft' then
        raise exception 'event_not_draft: the agenda of event % cannot be changed while it is %', v_event, coalesce(v_status, 'not visible')
          using errcode = '22023';
      end if;
    end loop;
    -- The RPC refuses to remove a block a survey answer points at; a direct DELETE must not get round that.
    if tg_op = 'DELETE' and app_private.block_has_survey_answers(old.id) then
      raise exception 'block_has_survey_answers: %', old.title using errcode = '22023';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists agenda_blocks_draft_only_writes on public.agenda_blocks;
create trigger agenda_blocks_draft_only_writes
  before insert or update or delete on public.agenda_blocks
  for each row execute function app_private.agenda_blocks_draft_only_writes();

do $$
declare
  v_fn text := pg_get_functiondef('public.update_event_with_blocks(uuid, jsonb, jsonb)'::regprocedure);
begin
  if v_fn like '%delete from public.agenda_blocks where event_id = event_id_input;%' then
    raise exception 'DB-04: update_event_with_blocks still deletes the whole agenda';
  end if;
  if v_fn not like '%event_not_draft%' or v_fn not like '%block_has_survey_answers%' or v_fn not like '%for no key update%' then
    raise exception 'DB-04: update_event_with_blocks is missing the draft-only rule, the survey-answer refusal or the row lock';
  end if;
  if (select count(*) from pg_trigger
       where tgenabled = 'O' and not tgisinternal
         and tgname in ('events_draft_only_detail_edits', 'agenda_blocks_draft_only_writes')) <> 2 then
    raise exception 'DB-04: a draft-only trigger is missing or disabled';
  end if;
  if has_function_privilege('anon', 'app_private.block_has_survey_answers(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'app_private.block_has_survey_answers(uuid)', 'EXECUTE') then
    raise exception 'DB-04: block_has_survey_answers has the wrong EXECUTE grants';
  end if;
end $$;
