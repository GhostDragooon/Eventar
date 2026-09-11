-- Authority sweep: replace all created_by access gates with org-scoped checks.
-- created_by stays as metadata (who created the event); it is no longer used
-- for access control. Organisation membership is the gate instead.
--
-- Single migration, single transaction via `supabase db push`.

-- =========================================================================
-- 1. NEW HELPERS
-- =========================================================================

create function app_private.current_staff_org_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select organisation_id from public.staff
   where email = app_private.auth_email() and status = 'active'
   order by created_at limit 1 $$;

grant execute on function app_private.current_staff_org_id() to anon, authenticated, service_role;

create function app_private.is_org_member(p_org_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and organisation_id = p_org_id
       and status = 'active'
   ) $$;

grant execute on function app_private.is_org_member(uuid) to anon, authenticated, service_role;

-- =========================================================================
-- 2. EVENTS — drop old policies, create org-scoped replacements
-- =========================================================================

drop policy "events_organizer_select_own" on public.events;
drop policy "events_organizer_insert_own" on public.events;
drop policy "events_organizer_update_own" on public.events;
drop policy "events_organizer_delete_own" on public.events;
drop policy "events_manager_read_all"     on public.events;

create policy "events_org_member_select" on public.events
  for select to authenticated
  using (organisation_id = app_private.current_staff_org_id());

create policy "events_org_member_insert" on public.events
  for insert to authenticated
  with check (organisation_id = app_private.current_staff_org_id());

create policy "events_org_member_update" on public.events
  for update to authenticated
  using  (organisation_id = app_private.current_staff_org_id())
  with check (organisation_id = app_private.current_staff_org_id());

create policy "events_org_member_delete" on public.events
  for delete to authenticated
  using (organisation_id = app_private.current_staff_org_id());

create policy "events_manager_read_all" on public.events
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or app_private.is_org_member(events.organisation_id)
  );

-- =========================================================================
-- 3. AGENDA_BLOCKS
-- =========================================================================

drop policy "agenda_blocks_organizer_full"    on public.agenda_blocks;
drop policy "agenda_blocks_manager_read_all"  on public.agenda_blocks;

create policy "agenda_blocks_org_member_full" on public.agenda_blocks
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "agenda_blocks_manager_read_all" on public.agenda_blocks
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = agenda_blocks.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 4. REGISTRATIONS
-- =========================================================================

drop policy "registrations_organizer_select_own" on public.registrations;
drop policy "registrations_organizer_update_own" on public.registrations;
drop policy "registrations_manager_select_all"   on public.registrations;

create policy "registrations_org_member_select" on public.registrations
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "registrations_org_member_update" on public.registrations
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = registrations.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = registrations.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "registrations_manager_select_all" on public.registrations
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = registrations.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 5. SPEAKER_CHECKINS
-- =========================================================================

drop policy "speaker_checkins_organizer_select_own" on public.speaker_checkins;
drop policy "speaker_checkins_organizer_insert_own" on public.speaker_checkins;
drop policy "speaker_checkins_organizer_update_own" on public.speaker_checkins;
drop policy "speaker_checkins_manager_select_all"   on public.speaker_checkins;

create policy "speaker_checkins_org_member_select" on public.speaker_checkins
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "speaker_checkins_org_member_insert" on public.speaker_checkins
  for insert to authenticated
  with check (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "speaker_checkins_org_member_update" on public.speaker_checkins
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = speaker_checkins.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "speaker_checkins_manager_select_all" on public.speaker_checkins
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = speaker_checkins.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 6. SURVEY_RESPONSES
-- =========================================================================

drop policy "survey_organizer_select_own" on public.survey_responses;
drop policy "survey_manager_select_all"   on public.survey_responses;

create policy "survey_org_member_select" on public.survey_responses
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = survey_responses.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "survey_manager_select_all" on public.survey_responses
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = survey_responses.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 7. EVENT_OCCURRENCES
-- =========================================================================

drop policy "event_occurrences_organizer_select_own" on public.event_occurrences;
drop policy "event_occurrences_manager_select_all"   on public.event_occurrences;

create policy "event_occurrences_org_member_select" on public.event_occurrences
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_occurrences.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "event_occurrences_manager_select_all" on public.event_occurrences
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = event_occurrences.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 8. REGISTRATION_CHECKINS
-- =========================================================================

drop policy "registration_checkins_organizer_select_own" on public.registration_checkins;
drop policy "registration_checkins_manager_select_all"   on public.registration_checkins;

create policy "registration_checkins_org_member_select" on public.registration_checkins
  for select to authenticated
  using (exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = registration_checkins.registration_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "registration_checkins_manager_select_all" on public.registration_checkins
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.id = registration_checkins.registration_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 9. EVENT_ACCREDITATION_GROUPS
-- =========================================================================

drop policy "event_accreditation_groups_organizer_select_own" on public.event_accreditation_groups;
drop policy "event_accreditation_groups_manager_select_all"   on public.event_accreditation_groups;

create policy "event_accreditation_groups_org_member_select" on public.event_accreditation_groups
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_accreditation_groups.event_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "event_accreditation_groups_manager_select_all" on public.event_accreditation_groups
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.events e
      where e.id = event_accreditation_groups.event_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 10. EVENT_ACCREDITATIONS
-- =========================================================================

drop policy "event_accreditations_organizer_select_own" on public.event_accreditations;
drop policy "event_accreditations_manager_select_all"   on public.event_accreditations;

create policy "event_accreditations_org_member_select" on public.event_accreditations
  for select to authenticated
  using (exists (
    select 1
    from public.event_accreditation_groups ag
    join public.events e on e.id = ag.event_id
    where ag.id = event_accreditations.accreditation_group_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "event_accreditations_manager_select_all" on public.event_accreditations
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1
      from public.event_accreditation_groups ag
      join public.events e on e.id = ag.event_id
      where ag.id = event_accreditations.accreditation_group_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 11. EVENT_ACCREDITATION_OCCURRENCES
-- =========================================================================

drop policy "event_accreditation_occurrences_organizer_select_own" on public.event_accreditation_occurrences;
drop policy "event_accreditation_occurrences_manager_select_all"   on public.event_accreditation_occurrences;

create policy "event_accreditation_occurrences_org_member_select"
  on public.event_accreditation_occurrences
  for select to authenticated
  using (exists (
    select 1
    from public.event_accreditations ea
    join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
    join public.events e on e.id = ag.event_id
    where ea.id = event_accreditation_occurrences.accreditation_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "event_accreditation_occurrences_manager_select_all"
  on public.event_accreditation_occurrences
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1
      from public.event_accreditations ea
      join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
      join public.events e on e.id = ag.event_id
      where ea.id = event_accreditation_occurrences.accreditation_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 12. REGISTRATION_ROLES
-- =========================================================================

drop policy "registration_roles_organizer_select_own" on public.registration_roles;
drop policy "registration_roles_manager_select_all"   on public.registration_roles;

create policy "registration_roles_org_member_select" on public.registration_roles
  for select to authenticated
  using (exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = registration_roles.registration_id
      and e.organisation_id = app_private.current_staff_org_id()
  ));

create policy "registration_roles_manager_select_all" on public.registration_roles
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1
      from public.registrations r
      join public.events e on e.id = r.event_id
      where r.id = registration_roles.registration_id
        and app_private.is_org_member(e.organisation_id)
    )
  );

-- =========================================================================
-- 13. SECURITY DEFINER FUNCTIONS — org-scoped access gates
-- =========================================================================

-- 13a. publish_event
drop function public.publish_event(uuid, uuid);

create function public.publish_event(p_event_id uuid, p_actor_override uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id
     and (organisation_id = actor.organisation_id or actor.role = 'eventar_staff')
     and status is distinct from 'published'
   returning organisation_id into v_org;
  if not found then
    if exists (
      select 1 from public.events
       where id = p_event_id and (organisation_id = actor.organisation_id or actor.role = 'eventar_staff') and status = 'published'
    ) then
      return;
    end if;
    raise exception 'publish_event: event % not found or not in caller''s organisation', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')
  );
end;
$$;

revoke execute on function public.publish_event(uuid, uuid) from public, anon;
grant execute on function public.publish_event(uuid, uuid) to authenticated, service_role;

-- 13b. mark_attended
drop function if exists public.mark_attended(text, text, uuid);

create function public.mark_attended(p_code text, p_method text, p_actor_override uuid default null::uuid)
returns table(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  actor              public.staff%rowtype;
  v_reg              public.registrations%rowtype;
  v_event            public.events%rowtype;
  v_win              timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl               jsonb;
  v_occurrence_id    uuid;
  v_occurrence_count integer;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if v_event.organisation_id <> actor.organisation_id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  select eo.id into v_occurrence_id
  from public.event_occurrences eo
  where eo.event_id = v_event.id
    and tstzrange(eo.starts_at, eo.ends_at, '[)') @> now()
  order by eo.ordinal
  limit 1;

  if v_occurrence_id is null then
    select count(*) into v_occurrence_count
    from public.event_occurrences eo where eo.event_id = v_event.id;

    if v_occurrence_count = 1 then
      select eo.id into v_occurrence_id
      from public.event_occurrences eo where eo.event_id = v_event.id;
    else
      result := 'no_matching_occurrence'; registration_id := v_reg.id; return next; return;
    end if;
  end if;

  begin
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    values (v_reg.id, v_occurrence_id, now(), p_method);
  exception when unique_violation then
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end;

  update public.registrations
     set status = 'attended'
   where id = v_reg.id and status = 'registered';

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, actor.organisation_id,
    'registration', v_reg.id,
    jsonb_build_object('event_id', v_event.id, 'method', p_method, 'via', 'staff_scan')
  );

  result := 'ok';
  registration_id := v_reg.id;
  full_name := v_reg.full_name;
  event_id := v_event.id;
  event_title := v_event.title;
  select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
  return next;
end;
$function$;

revoke all on function public.mark_attended(text, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_attended(text, text, uuid) to authenticated, service_role;

-- 13c. update_event_with_blocks (NOT security definer — uses RLS)
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
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      event_id_input,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      block->>'host',
      block->'topics',
      block->>'notes',
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return event_id_input;
end;
$$;

-- 13d. bulk_update_event_status
create or replace function public.bulk_update_event_status(
  p_event_ids       uuid[],
  p_action          text,
  p_actor_override  uuid default null,
  p_actor_user_id   uuid default null
) returns table(id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor              public.staff%rowtype;
  v_event_type       text;
  v_ids              uuid[];
  v_prev_statuses    text[];
  v_prev_deleted_ats timestamptz[];
  v_org_ids          uuid[];
  i                  integer;
begin
  actor := app_private.resolve_actor(p_actor_override, variadic array[]::text[]);

  if p_action = 'cancel' then
    v_event_type := 'event_cancelled';
  elsif p_action = 'soft_delete' then
    v_event_type := 'event_soft_deleted';
  elsif p_action = 'restore' then
    v_event_type := 'event_restored';
  else
    raise exception 'bulk_update_event_status: unknown action %', p_action using errcode = '22023';
  end if;

  with old as (
    select e.id, e.status as prev_status, e.deleted_at as prev_deleted_at, e.organisation_id
    from public.events e
    where e.id = any(p_event_ids)
      and (e.organisation_id = actor.organisation_id or actor.role = 'eventar_staff')
      and case
            when p_action = 'cancel' then e.status is distinct from 'cancelled'
            when p_action = 'soft_delete' then e.deleted_at is null
            when p_action = 'restore' then e.deleted_at is not null
          end
    for update
  ),
  upd as (
    update public.events e set
      status     = case when p_action = 'cancel' then 'cancelled' else e.status end,
      deleted_at = case when p_action = 'soft_delete' then now()
                        when p_action = 'restore' then null
                        else e.deleted_at end
    from old
    where e.id = old.id
    returning e.id
  )
  select array_agg(old.id), array_agg(old.prev_status), array_agg(old.prev_deleted_at), array_agg(old.organisation_id)
    into v_ids, v_prev_statuses, v_prev_deleted_ats, v_org_ids
  from old
  join upd on upd.id = old.id;

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    perform public.write_audit_event(
      v_event_type, p_actor_user_id, actor.role, v_org_ids[i], 'event', v_ids[i],
      jsonb_build_object('previous_status', v_prev_statuses[i], 'previous_deleted_at', v_prev_deleted_ats[i])
    );
    id := v_ids[i];
    return next;
  end loop;
end;
$$;

revoke execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) from public, anon;
grant execute on function public.bulk_update_event_status(uuid[], text, uuid, uuid) to authenticated, service_role;

-- 13e. set_event_cpd_config
create or replace function public.set_event_cpd_config(
  p_event_id uuid,
  p_body_id uuid,
  p_cpd_hours numeric,
  p_actor_override uuid default null::uuid
) returns events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor              public.staff%rowtype;
  v_row              public.events;
  v_event_org        uuid;
  v_group_id         uuid;
  v_accreditation_id uuid;
  v_group_count      integer;
  v_bridge_shaped     boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  if (p_body_id is null) <> (p_cpd_hours is null) then
    raise exception 'set_event_cpd_config: accrediting body and CPD hours must be set together, or both cleared'
      using errcode = '22023';
  end if;

  select organisation_id into v_event_org
    from public.events where id = p_event_id for update;
  if not found then
    raise exception 'set_event_cpd_config: event % not found', p_event_id
      using errcode = 'P0002';
  end if;

  if actor.role <> 'eventar_staff' and v_event_org is distinct from actor.organisation_id then
    raise exception 'set_event_cpd_config: not in the same organisation as event %', p_event_id
      using errcode = '42501', detail = 'not_in_org';
  end if;

  if p_body_id is not null and not exists (
    select 1 from public.accrediting_bodies b where b.id = p_body_id and b.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: accrediting body % is not an active body', p_body_id
      using errcode = 'P0002';
  end if;

  if p_body_id is not null and not exists (
    select 1 from public.organisation_body_authorisations a
     where a.organisation_id = v_event_org
       and a.body_id = p_body_id
       and a.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: this organisation is not authorised to claim accreditation from body %', p_body_id
      using errcode = '42501', detail = 'not_authorised_for_body';
  end if;

  if exists (select 1 from public.credit_ledger where event_id = p_event_id) then
    raise exception 'set_event_cpd_config: cannot change accreditation for event % — credit already issued', p_event_id
      using errcode = '22023';
  end if;

  select count(*) into v_group_count from public.event_accreditation_groups where event_id = p_event_id;

  v_bridge_shaped := v_group_count = 1 and exists (
    select 1 from public.event_accreditation_groups g
     where g.event_id = p_event_id
       and g.category_code is null
       and g.award_scheme = 'proportional'
       and (select count(*) from public.event_accreditations a where a.accreditation_group_id = g.id) = 1
       and (
         select count(*) from public.event_accreditation_occurrences eao
         join public.event_accreditations a on a.id = eao.accreditation_id
         where a.accreditation_group_id = g.id
       ) = (select count(*) from public.event_occurrences eo where eo.event_id = p_event_id)
  );

  if v_group_count > 0 and not v_bridge_shaped then
    raise exception 'set_event_cpd_config: event % carries a multi-body accreditation configuration built via the wizard — use that to change accreditation instead', p_event_id
      using errcode = '42501', detail = 'multi_body_configured';
  end if;

  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
   returning * into v_row;

  delete from public.event_accreditation_groups where event_id = p_event_id;

  if p_body_id is not null then
    insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
    values (p_event_id, p_body_id, null, null, 'proportional')
    returning id into v_group_id;

    insert into public.event_accreditations (accreditation_group_id, credit_value)
    values (v_group_id, p_cpd_hours)
    returning id into v_accreditation_id;

    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
    select v_accreditation_id, eo.id
    from public.event_occurrences eo
    where eo.event_id = p_event_id;
  end if;

  perform public.write_audit_event(
    p_event_type    := 'event_cpd_config_set',
    p_actor_user_id := auth.uid(),
    p_actor_role    := actor.role,
    p_organisation_id := actor.organisation_id,
    p_subject_type  := 'event',
    p_subject_id    := p_event_id,
    p_payload       := jsonb_build_object(
      'accrediting_body_id', p_body_id,
      'cpd_hours', p_cpd_hours
    )
  );

  return v_row;
end;
$$;

-- =========================================================================
-- 14. STRUCTURAL SELF-CHECKS
-- =========================================================================

do $$
begin
  -- Verify new helpers exist
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'current_staff_org_id'
  ) then raise exception 'current_staff_org_id not found'; end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = 'is_org_member'
  ) then raise exception 'is_org_member not found'; end if;

  -- Verify old created_by policies are gone from events
  if exists (
    select 1 from pg_policies where tablename = 'events' and policyname = 'events_organizer_select_own'
  ) then raise exception 'old policy events_organizer_select_own still exists'; end if;

  -- Verify new org-scoped policy exists on events
  if not exists (
    select 1 from pg_policies where tablename = 'events' and policyname = 'events_org_member_select'
  ) then raise exception 'new policy events_org_member_select not found'; end if;

  -- Verify publish_event still exists with correct signature
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'publish_event'
      and pg_get_function_arguments(p.oid) = 'p_event_id uuid, p_actor_override uuid DEFAULT NULL::uuid'
  ) then raise exception 'publish_event: missing or signature drifted'; end if;

  -- Verify mark_attended still exists with correct signature
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'mark_attended'
      and pg_get_function_arguments(p.oid) = 'p_code text, p_method text, p_actor_override uuid DEFAULT NULL::uuid'
  ) then raise exception 'mark_attended: missing or signature drifted'; end if;
end;
$$;
