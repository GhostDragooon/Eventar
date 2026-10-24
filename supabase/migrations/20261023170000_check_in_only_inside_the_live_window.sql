-- DB-02 (MVP plan, P3; Ivan's MVP scope): check-in only inside the live window, at the database.
--
-- mark_attended (the staff scan and typed-code door, the one that mints a CPD credit) resolved the occurrence as
-- "the one containing now(), else, if the event has exactly one occurrence, that one, at ANY time". So a staff
-- check-in landed days before or after the event. self_check_in already enforced [start - 60 min, end] on the
-- event, but matched occurrences strictly, so a multi-occurrence event refused the 60-minute pre-open of every
-- occurrence after the first (no_matching_occurrence).
--
-- New rule, both functions: check-in is open from 60 minutes before the start until the end (the same
-- CHECKIN_OPEN_MINUTES the app's computeLifecycle uses). For an event with ONE occurrence, which is every event
-- the product creates, the window is the EVENT's own (events.start_time, events.end_time): those are what an
-- organiser edits, and nothing moves the occurrence row along (its only trigger is AFTER INSERT), so the
-- occurrence's dates can be stale (6 of 132 local events had drifted when this was written). For several
-- occurrences (SQL-only today) each occurrence has its own window, open 60 minutes before its start until its
-- end, and where windows overlap the one that has already started wins. Outside the window: `closed` when the
-- end has passed, `not_open_yet` otherwise, and nothing is written (no check-in row, no participation evidence,
-- no audit event, status untouched; the rate-limit counter is still bumped before the refusal, as it was). `no_matching_occurrence` is kept only for an event with no occurrence rows.
--
-- Unchanged: the actor and organisation checks, rate limits, lifecycle guards, evidence and audit writes,
-- idempotency by registration_checkins unique(registration_id, occurrence_id), grants (restated below).
--
-- The credit backstop in award_attendance_credit (+/- 24 h) stays as defence in depth.
--
-- Not covered: this is the function door. `authenticated` still holds column UPDATE on registrations.status and
-- check_in_*, so a staff session can still mark a registration attended through PostgREST at any time with no
-- check-in row or audit event; that is DB-05 (the registrations UPDATE bypass).
--
-- Behaviour note: re-scanning an already checked-in code after the end (or before the window) now answers
-- `closed` / `not_open_yet` instead of `already`, because the window check precedes the idempotent insert.
--
-- Rollback: copy the single function definitions back, do not re-run the old files (they hold other statements):
-- mark_attended from 20260912020000_evidence_org_scope_fix.sql section 2; self_check_in from the latest earlier
-- definition (20260912010000_checkin_writes_evidence.sql section for self_check_in).

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
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if v_event.organisation_id <> actor.organisation_id then result := 'not_recognised'; return next; return; end if;

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

CREATE OR REPLACE FUNCTION public.self_check_in(p_code text, p_ip text)
 RETURNS TABLE(result text, event_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event_id         uuid;
  v_reg_id           uuid;
  v_status           text;
  v_user_id          uuid;
  v_rl               jsonb;
  v_win              timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_ev               public.events%rowtype;
  v_occurrence_id    uuid;
  v_occurrence_count integer;
begin
  select r.id, r.event_id, r.status, r.user_id into v_reg_id, v_event_id, v_status, v_user_id
  from public.registrations r where r.registration_code = p_code;

  if v_reg_id is null then
    v_rl := public.rate_limit_check('selfCheckInGuess:' || p_ip, v_win, 10);
    if (v_rl->>'allowed')::boolean is false then
      result := 'rate_limited'; event_id := null; return next; return;
    end if;
    result := 'invalid'; event_id := null; return next; return;
  end if;

  v_rl := public.rate_limit_check('selfCheckIn:' || v_event_id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then
    result := 'rate_limited'; event_id := v_event_id; return next; return;
  end if;

  -- 'attended' is deliberately NOT a short-circuit here — see
  -- 20260815040000's header. Only 'cancelled' blocks unconditionally.
  if v_status = 'cancelled' then
    result := 'cancelled'; event_id := v_event_id; return next; return;
  end if;

  select * into v_ev from public.events e where e.id = v_event_id;

  if v_ev.status is distinct from 'published' or v_ev.deleted_at is not null then
    result := 'unavailable'; event_id := v_event_id; return next; return;
  end if;

  if (v_ev.checkin_modes->>'self_serve')::boolean is not true then
    result := 'self_serve_off'; event_id := v_event_id; return next; return;
  end if;

  if now() < v_ev.start_time - interval '60 minutes' then
    result := 'not_open_yet'; event_id := v_event_id; return next; return;
  end if;
  if now() > v_ev.end_time then
    result := 'closed'; event_id := v_event_id; return next; return;
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
  from public.event_occurrences eo where eo.event_id = v_event_id;

  if v_occurrence_count = 0 then
    result := 'no_matching_occurrence'; event_id := v_event_id; return next; return;
  elsif v_occurrence_count = 1 then
    if now() < v_ev.start_time - interval '60 minutes' then
      result := 'not_open_yet'; event_id := v_event_id; return next; return;
    elsif now() > v_ev.end_time then
      result := 'closed'; event_id := v_event_id; return next; return;
    end if;
    select eo.id into v_occurrence_id
    from public.event_occurrences eo where eo.event_id = v_event_id;
  else
    select eo.id into v_occurrence_id
    from public.event_occurrences eo
    where eo.event_id = v_event_id
      and tstzrange(eo.starts_at - interval '60 minutes', eo.ends_at, '[)') @> now()
    order by (eo.starts_at <= now()) desc, eo.ordinal
    limit 1;

    if v_occurrence_id is null then
      -- Every occurrence has ended: closed. Otherwise the next one has not opened yet (before the first, or in a gap).
      if not exists (select 1 from public.event_occurrences eo where eo.event_id = v_event_id and eo.ends_at > now()) then
        result := 'closed'; event_id := v_event_id; return next; return;
      end if;
      result := 'not_open_yet'; event_id := v_event_id; return next; return;
    end if;
  end if;

  -- Idempotency via registration_checkins' unique(registration_id, occurrence_id).
  begin
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    values (v_reg_id, v_occurrence_id, now(), 'qr');
  exception when unique_violation then
    result := 'already'; event_id := v_event_id; return next; return;
  end;

  -- First check-in transitions status; later occurrences are a no-op here.
  update public.registrations
     set status = 'attended'
   where id = v_reg_id and status = 'registered';

  -- Record participation evidence (best-effort — attendance is authoritative)
  begin
    perform public.record_participation_evidence(
      p_organisation_id      := v_ev.organisation_id,
      p_event_id             := v_event_id,
      p_occurrence_id        := v_occurrence_id,
      p_registration_id      := v_reg_id,
      p_user_id              := v_user_id,
      p_evidence_type        := 'check_in',
      p_capture_method       := 'self_serve',
      p_source               := 'live_checkin',
      p_captured_at          := now(),
      p_attestation_strength := 'weak',
      p_actor_id             := v_user_id
    );
  exception when others then
    raise warning 'participation_evidence write failed for registration % (SQLSTATE %): %', v_reg_id, sqlstate, sqlerrm;
  end;

  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$function$;

-- CREATE OR REPLACE preserves the ACL; restate it so the migration is self-contained (the two doors differ).
revoke all on function public.mark_attended(text, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_attended(text, text, uuid) to authenticated, service_role;
revoke all on function public.self_check_in(text, text) from public, anon, authenticated;
grant execute on function public.self_check_in(text, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.mark_attended(text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'DB-02: a check-in function is executable by a role that must not have it';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_attended(text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.mark_attended(text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'DB-02: a check-in function lost an EXECUTE grant it needs';
  end if;
end $$;
