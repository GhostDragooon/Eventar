-- UX-R8 (Ivan, 2026-11-22): day-of check-in, speaker ticks and walk-ins are open to every door role of the event's
-- organisation, whoever created the event. K1 change, narrows Q51 for the door only (Decisions Log Q51 follow-up).
--   door roles: organiser_admin, organiser_member, body_admin of the event's organisation; eventar_staff on every event.
--   auditor stays read-only. The registration list (contact, roles, accreditation) keeps app_private.can_write_event.
-- How: app_private.can_run_door(event, staff); mark_attended uses it and now also accepts body_admin; the guard
-- app_private.enforce_event_writer lets the four door writes through for a door role (see the comment inside it).
-- Walk-in registration inserts run on the admin client, so the database guard never sees them: the action's own
-- check (canCheckIn, no canWriteEvent) is the gate, and the follow-up mark_attended is the database's.
--
-- Rollback: restore app_private.enforce_event_writer and public.mark_attended from
--   20261107100000_role_rights_q51.sql; drop function app_private.can_run_door(uuid, uuid).

create or replace function app_private.can_run_door(p_event_id uuid, p_actor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.staff s
      join public.events e on e.id = p_event_id
     where s.id = p_actor_id
       and s.status = 'active'
       and (s.role = 'eventar_staff'
            or (e.organisation_id = s.organisation_id
                and s.role in ('organiser_admin', 'organiser_member', 'body_admin'))));
$$;
revoke all on function app_private.can_run_door(uuid, uuid) from public, anon, authenticated;  -- definer callers only

CREATE OR REPLACE FUNCTION app_private.enforce_event_writer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff uuid;
  v_role  text;
  v_row   jsonb;
  v_event uuid;
  v_keep  text[] := array['user_id', 'profile_snapshot', 'updated_at'];
  v_new   jsonb;
  v_old   jsonb;
  v_door  boolean;
begin
  if auth.role() = 'service_role' then return coalesce(new, old); end if;
  v_staff := app_private.current_staff_id();
  if v_staff is null then return coalesce(new, old); end if;   -- not staff: RLS and the table's own gates decide

  if tg_table_name = 'events' and tg_op = 'INSERT' then
    select s.role into v_role from public.staff s where s.id = v_staff;
    if v_role not in ('organiser_admin', 'organiser_member', 'eventar_staff') or new.created_by is distinct from v_staff then
      raise exception 'events: your role cannot create events, or created_by is not you'
        using errcode = '42501', detail = 'not_event_writer';
    end if;
    return new;
  end if;

  -- A staff account is also a practitioner account (one auth.users row). Its own claim of its own registration
  -- (claim_registrations_for_user: user_id null -> itself, profile_snapshot filled, nothing else) is not an
  -- organiser action, so the organiser rule does not apply to it.
  if tg_table_name = 'registrations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'user_id' is null and to_jsonb(new)->>'user_id' = auth.uid()::text
       and (to_jsonb(new) - v_keep) = (to_jsonb(old) - v_keep) then
      return new;
    end if;
  end if;

  -- UX-R8 (Ivan, 2026-11-22): the door is open to every door role of the event's organisation (can_run_door), not
  -- only its writer. Exactly four writes, each narrow:
  --   speaker_checkins  INSERT, and UPDATE that touches only checked_in_at / updated_by / updated_at;
  --   registration_checkins INSERT, and registrations UPDATE of status registered -> attended (plus the
  --   check_in_at / check_in_method the sync trigger fills), both only while mark_attended has named that one
  --   registration in app.door_registration (a transaction-local setting only that definer function sets).
  -- Everything else on these tables, and every other guarded table, keeps the writer rule below.
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
    v_old := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    v_door := case
      when tg_table_name = 'speaker_checkins' and tg_op = 'INSERT' then true
      when tg_table_name = 'speaker_checkins' and tg_op = 'UPDATE'
        then (v_new - 'checked_in_at' - 'updated_by' - 'updated_at') = (v_old - 'checked_in_at' - 'updated_by' - 'updated_at')
      when tg_table_name = 'registration_checkins' and tg_op = 'INSERT'
        then current_setting('app.door_registration', true) = v_new->>'registration_id'
      when tg_table_name = 'registrations' and tg_op = 'UPDATE'
        then current_setting('app.door_registration', true) = v_old->>'id'
             and (v_new - 'status' - 'check_in_at' - 'check_in_method') = (v_old - 'status' - 'check_in_at' - 'check_in_method')
             and (v_new->>'status' = v_old->>'status'
                  or (v_old->>'status' = 'registered' and v_new->>'status' = 'attended'))
      else false end;
    if v_door and app_private.can_run_door(app_private.event_of_row(tg_table_name, v_new), v_staff) then
      return new;
    end if;
  end if;

  -- An UPDATE is checked against the event it leaves AND the event it lands on (a row moved onto your own event
  -- from a colleague's must not pass), INSERT against NEW, DELETE against OLD.
  foreach v_row in array case tg_op when 'UPDATE' then array[to_jsonb(old), to_jsonb(new)]
                                    when 'INSERT' then array[to_jsonb(new)]
                                    else array[to_jsonb(old)] end loop
    v_event := app_private.event_of_row(tg_table_name, v_row);
    -- A cascade delete after the parent event (or link row) is gone: the parent's own guard already ran.
    if tg_op = 'DELETE' and (v_event is null or not exists (select 1 from public.events e where e.id = v_event)) then
      continue;
    end if;
    if not app_private.can_write_event(v_event, v_staff) then
      raise exception '%: you cannot change event %', tg_table_name, v_event
        using errcode = '42501', detail = 'not_event_writer';
    end if;
  end loop;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_attended(p_code text, p_method text, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS TABLE(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor              public.staff%rowtype;
  v_reg              public.registrations%rowtype;
  v_event            public.events%rowtype;
  v_win              timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl               jsonb;
  v_occurrence_id    uuid;
  v_occurrence_count integer;
  v_capture_method   text;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','body_admin','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if not app_private.can_run_door(v_event.id, actor.id) then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  -- Only 'cancelled' blocks unconditionally (20260815040000 fix).
  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  -- Resolve the occurrence BEFORE any write (DB-02). No "any time" fallback: outside the window the answer is
  -- not_open_yet or closed and nothing is written (no check-in row, no evidence, no audit event, status untouched).
  --   * One occurrence (every event the product creates): the EVENT's own window decides, from
  --     CHECKIN_OPEN_MINUTES before events.start_time until events.end_time. events.start_time and end_time are what
  --     an organiser edits and nothing moves the occurrence row with them (its only trigger is AFTER INSERT), so
  --     the occurrence's own dates can be stale; the card text says the same ("the event's own window").
  --   * Several occurrences (SQL-only today): an occurrence is open from 60 minutes before its start until its end;
  --     where windows overlap the one that has already started wins, whatever the ordinals.
  select count(*) into v_occurrence_count
  from public.event_occurrences eo where eo.event_id = v_event.id;

  if v_occurrence_count = 0 then
    result := 'no_matching_occurrence'; registration_id := v_reg.id; return next; return;
  elsif v_occurrence_count = 1 then
    if now() < v_event.start_time - interval '60 minutes' then
      result := 'not_open_yet'; registration_id := v_reg.id; return next; return;
    elsif now() > v_event.end_time then
      result := 'closed'; registration_id := v_reg.id; return next; return;
    end if;
    select eo.id into v_occurrence_id
    from public.event_occurrences eo where eo.event_id = v_event.id;
  else
    select eo.id into v_occurrence_id
    from public.event_occurrences eo
    where eo.event_id = v_event.id
      and tstzrange(eo.starts_at - interval '60 minutes', eo.ends_at, '[)') @> now()
    order by (eo.starts_at <= now()) desc, eo.ordinal
    limit 1;

    if v_occurrence_id is null then
      -- Every occurrence has ended: closed. Otherwise the next one has not opened yet (before the first, or in a gap).
      if not exists (select 1 from public.event_occurrences eo where eo.event_id = v_event.id and eo.ends_at > now()) then
        result := 'closed'; registration_id := v_reg.id; return next; return;
      end if;
      result := 'not_open_yet'; registration_id := v_reg.id; return next; return;
    end if;
  end if;

  -- UX-R8: names the one registration this call may write, so enforce_event_writer lets the door writes below through
  -- for a door role that is not the event's writer. Transaction-local; only this definer function sets it.
  perform set_config('app.door_registration', v_reg.id::text, true);

  -- Idempotency via registration_checkins' unique(registration_id, occurrence_id).
  begin
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    values (v_reg.id, v_occurrence_id, now(), p_method);
  exception when unique_violation then
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end;

  -- First check-in transitions status; later occurrences are a no-op here.
  update public.registrations
     set status = 'attended'
   where id = v_reg.id and status = 'registered';

  -- Map p_method to evidence capture_method (from 20260912010000)
  v_capture_method := case p_method when 'qr' then 'qr_scan' when 'manual' then 'manual_entry' else 'manual_entry' end;

  -- Record participation evidence (best-effort — attendance is authoritative)
  begin
    perform public.record_participation_evidence(
      p_organisation_id      := v_event.organisation_id,
      p_event_id             := v_event.id,
      p_occurrence_id        := v_occurrence_id,
      p_registration_id      := v_reg.id,
      p_user_id              := v_reg.user_id,
      p_evidence_type        := 'check_in',
      p_capture_method       := v_capture_method,
      p_source               := 'staff_attestation',
      p_captured_at          := now(),
      p_attestation_strength := 'standard',
      p_actor_id             := auth.uid()
    );
  exception when others then
    raise warning 'participation_evidence write failed for registration % (SQLSTATE %): %', v_reg.id, sqlstate, sqlerrm;
  end;

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, v_event.organisation_id,
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
