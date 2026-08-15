-- Task 10.8/10.9, fix — multi-occurrence check-in was structurally
-- unreachable through self_check_in()/mark_attended() (C2, 20260815010000),
-- and award_attendance_credit()'s proportional scheme posted a permanent
-- zero-value credit_earned row instead of skipping (C4, 20260815030000).
-- Found by an independent dev-lens review after C4 shipped, both confirmed
-- live before this fix and again after.
--
-- FINDING 1 (Critical). C2 preserved the pre-C1 idempotency gate verbatim:
-- `if v_status = 'attended' then return 'already'`, checked BEFORE occurrence
-- resolution. Once ANY occurrence's check-in flips status to 'attended', the
-- gate fires on every later call for that registration_code — so a
-- practitioner who checks in on Day 1 of a multi-day event can never check
-- in again on Day 2 through either live path. No error, no skip reason, no
-- symptom: the second tap silently returns 'already' as if nothing were
-- wrong, and no second registration_checkins row is ever written. C4's own
-- ICI-shape test proved the SCORING logic correct by inserting
-- registration_checkins directly via sqlSuperuser — bypassing the very
-- functions this bug lives in — so nothing in the shipped test suite
-- exercised the real multi-day path end to end.
--
-- FIX: idempotency moves from the coarse registrations.status field to
-- registration_checkins' own unique(registration_id, occurrence_id)
-- constraint — exactly the mechanism C4 already uses for per-body
-- idempotency in award_attendance_credit, now applied consistently one
-- layer down. Occurrence resolution moves BEFORE any write (previously
-- after), which also removes the old "revert the status flip on an
-- ambiguous match" special case entirely: status is never touched until a
-- registration_checkins insert has actually succeeded, so there is nothing
-- to revert. status still flips 'registered'->'attended' on the FIRST
-- successful check-in and is a correct no-op on every later one (a
-- practitioner attending 3 of 5 days makes 3 registration_checkins rows and
-- one harmless repeated status UPDATE, not 3 status transitions).
-- 'cancelled' is still checked unconditionally up front, before occurrence
-- resolution, so a cancellation can never be raced past by a check-in
-- attempt for a not-yet-visited occurrence.
--
-- FINDING 2 (Important). award_attendance_credit's proportional branch
-- (20260815030000) computed v_earned as the sum of attendance_points for
-- occurrences the registration actually checked into, correctly guarded
-- v_available=0 (a group with no occurrences at all), but had no equivalent
-- guard for v_earned=0 (the registration checked into occurrences, just none
-- that this group covers) — it fell through to
-- `v_credit := v_best_credit * 0::numeric / v_available = 0` and posted a
-- permanent, undeletable credit_earned row of value 0 with
-- attestation_status='attendance_verified', outcome='issued'. The sibling
-- explicit_schedule branch already handles the identical scenario correctly
-- (skipped:no_matching_schedule) — the two schemes disagreed on the same
-- input shape. Worse, a zero row permanently claims the widened
-- credit_ledger_attendance_uniq slot for that (user, event, body), so no
-- later correct nonzero credit can ever be posted for it without a
-- compensating entry.
--
-- FIX: mirror the existing v_available=0 guard with a v_earned=0 guard,
-- returning skipped:no_attendance rather than posting.

drop function if exists public.self_check_in(text, text);

create function public.self_check_in(p_code text, p_ip text)
returns table(result text, event_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event_id         uuid;
  v_reg_id           uuid;
  v_status           text;
  v_rl               jsonb;
  v_win              timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_ev               public.events%rowtype;
  v_occurrence_id    uuid;
  v_occurrence_count integer;
begin
  select r.id, r.event_id, r.status into v_reg_id, v_event_id, v_status
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

  -- 'attended' is deliberately NOT a short-circuit here anymore — see the
  -- migration header. Only 'cancelled' blocks unconditionally.
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

  -- Two distinct facts, two distinct answers. `not_open_yet` means wait;
  -- `closed` means the moment has passed and only staff can help now.
  -- CHECKIN_OPEN_MINUTES = 60 (lib/lifecycle/eventLifecycle.ts) — see
  -- 20260804010000's header for why the constant is duplicated here.
  if now() < v_ev.start_time - interval '60 minutes' then
    result := 'not_open_yet'; event_id := v_event_id; return next; return;
  end if;
  if now() > v_ev.end_time then
    result := 'closed'; event_id := v_event_id; return next; return;
  end if;

  -- Resolve the occurrence BEFORE any write — moved ahead of the old status
  -- flip (see header). eo.event_id is qualified: this function's own OUT
  -- parameter is also named event_id (PL/pgSQL resolves the bare name
  -- against the variable, not the column, and does not raise).
  select eo.id into v_occurrence_id
  from public.event_occurrences eo
  where eo.event_id = v_event_id
    and tstzrange(eo.starts_at, eo.ends_at, '[)') @> now()
  order by eo.ordinal
  limit 1;

  if v_occurrence_id is null then
    select count(*) into v_occurrence_count
    from public.event_occurrences eo where eo.event_id = v_event_id;

    if v_occurrence_count = 1 then
      select eo.id into v_occurrence_id
      from public.event_occurrences eo where eo.event_id = v_event_id;
    else
      -- Ambiguous — do not guess. No status revert needed: status has not
      -- been touched yet at this point.
      result := 'no_matching_occurrence'; event_id := v_event_id; return next; return;
    end if;
  end if;

  -- Idempotency AND the concurrency race guard both live here now:
  -- registration_checkins' own unique(registration_id, occurrence_id) is
  -- what decides "already checked in for THIS occurrence" — a second tap
  -- resolving to the same occurrence hits unique_violation; a first tap for
  -- a DIFFERENT (later) occurrence does not, and proceeds.
  begin
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    values (v_reg_id, v_occurrence_id, now(), 'qr');
  exception when unique_violation then
    result := 'already'; event_id := v_event_id; return next; return;
  end;

  -- First successful check-in transitions status; a later occurrence's
  -- check-in on an already-'attended' registration is a correct no-op here
  -- (WHERE excludes 'cancelled', so a cancellation racing in between two
  -- check-ins can never be silently overwritten back to 'attended').
  update public.registrations
     set status = 'attended'
   where id = v_reg_id and status = 'registered';

  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$function$;

revoke all on function public.self_check_in(text, text) from public, anon, authenticated;
grant execute on function public.self_check_in(text, text) to service_role;

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
  if v_event.created_by <> actor.id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  -- Only 'cancelled' blocks unconditionally now — see migration header.
  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  -- Resolve the occurrence BEFORE any write.
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
  -- The registration's own check_in_at (C1's summary trigger, earliest
  -- checkin) — NOT necessarily now(): a later occurrence's check-in on an
  -- already-attended registration keeps reporting the FIRST check-in's
  -- moment here, which is correct (check_in_at is a summary field, not
  -- "the moment of this particular call").
  select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
  return next;
end;
$function$;

revoke all on function public.mark_attended(text, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_attended(text, text, uuid) to authenticated, service_role;

-- FINDING 2 fix — award_attendance_credit's proportional branch.
create or replace function public.award_attendance_credit(
  p_event_id uuid,
  p_registration_code text,
  p_actor_id uuid default null::uuid
)
returns table(body_id uuid, outcome text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event           public.events%rowtype;
  v_reg_id          uuid;
  v_email           text;
  v_status          text;
  v_user_id         uuid;
  v_eff             date;
  v_actor           uuid := p_actor_id;
  v_group_count     integer;
  v_role_codes      text[];
  grp               record;
  v_licence         public.practitioner_licences%rowtype;
  v_category        text;
  v_taxonomy        jsonb;
  v_role            text;
  v_mapped_category text;
  v_role_match      boolean;
  v_available       numeric;
  v_earned          numeric;
  v_credit          numeric;
  v_best_id         uuid;
  v_best_card       integer;
  v_best_credit     numeric;
  v_tie_count       integer;
  v_points          numeric;
  v_hours           numeric;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    body_id := null; outcome := 'skipped:no_event'; return next; return;
  end if;

  select count(*) into v_group_count
  from public.event_accreditation_groups eag
  where eag.event_id = p_event_id;

  if v_group_count = 0 then
    body_id := null; outcome := 'skipped:not_cpd'; return next; return;
  end if;

  if now() < v_event.start_time - interval '24 hours'
     or now() > v_event.end_time + interval '24 hours' then
    body_id := null; outcome := 'skipped:outside_window'; return next; return;
  end if;

  select r.id, r.email, r.status into v_reg_id, v_email, v_status
  from public.registrations r
  where r.event_id = p_event_id and r.registration_code = p_registration_code;
  if not found then
    body_id := null; outcome := 'skipped:no_registration'; return next; return;
  end if;

  if v_status = 'cancelled' then
    body_id := null; outcome := 'skipped:cancelled'; return next; return;
  end if;

  select u.id into v_user_id from auth.users u
    where lower(u.email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then
    body_id := null; outcome := 'skipped:no_user'; return next; return;
  end if;

  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    raise warning 'award_attendance_credit: actor % has no public.users row; issuing credit unattributed', v_actor;
    v_actor := null;
  end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  select array_agg(rr.role_code) into v_role_codes
  from public.registration_roles rr where rr.registration_id = v_reg_id;
  if v_role_codes is null or array_length(v_role_codes, 1) is null then
    v_role_codes := array['attendee'];
  end if;

  for grp in
    select * from public.event_accreditation_groups eag where eag.event_id = p_event_id
  loop
    select pl.* into v_licence from public.practitioner_licences pl
      where pl.user_id = v_user_id and pl.body_id = grp.body_id and pl.status = 'verified'
      order by pl.created_at desc limit 1;
    if not found then
      body_id := grp.body_id; outcome := 'skipped:no_licence'; return next;
      continue;
    end if;

    if grp.category_code is null then
      v_category := null;
    else
      v_role_match := false;
      select ab.category_taxonomy into v_taxonomy
        from public.accrediting_bodies ab where ab.id = grp.body_id;
      foreach v_role in array v_role_codes loop
        v_mapped_category := v_taxonomy #>> array['role_mappings', v_role];
        if v_mapped_category is not null and v_mapped_category = grp.category_code then
          v_role_match := true;
          exit;
        end if;
      end loop;
      if not v_role_match then
        body_id := grp.body_id; outcome := 'skipped:no_role_match'; return next;
        continue;
      end if;
      v_category := grp.category_code;
    end if;

    v_points := null;
    v_hours := null;

    if grp.award_scheme = 'proportional' then
      select ea.credit_value into v_best_credit
        from public.event_accreditations ea
        where ea.accreditation_group_id = grp.id
        order by ea.created_at
        limit 1;

      select coalesce(sum(x.pts), 0) into v_available from (
        select distinct eo.id, eo.attendance_points as pts
        from public.event_accreditation_occurrences eao
        join public.event_accreditations ea on ea.id = eao.accreditation_id
        join public.event_occurrences eo on eo.id = eao.occurrence_id
        where ea.accreditation_group_id = grp.id
      ) x;

      if v_available = 0 then
        body_id := grp.body_id; outcome := 'skipped:no_occurrences'; return next;
        continue;
      end if;

      select coalesce(sum(x.pts), 0) into v_earned from (
        select distinct eo.id, eo.attendance_points as pts
        from public.event_accreditation_occurrences eao
        join public.event_accreditations ea on ea.id = eao.accreditation_id
        join public.event_occurrences eo on eo.id = eao.occurrence_id
        join public.registration_checkins rc
          on rc.occurrence_id = eo.id and rc.registration_id = v_reg_id
        where ea.accreditation_group_id = grp.id
      ) x;

      -- FINDING 2 fix: attended nothing this group covers -> skip, don't
      -- post a permanent zero-value row. Mirrors the v_available=0 guard
      -- three lines above and explicit_schedule's own
      -- skipped:no_matching_schedule for the identical scenario.
      if v_earned = 0 then
        body_id := grp.body_id; outcome := 'skipped:no_attendance'; return next;
        continue;
      end if;

      v_credit := v_best_credit * v_earned::numeric / v_available;

    elsif grp.award_scheme = 'explicit_schedule' then
      v_best_id := null; v_best_card := null; v_best_credit := null;

      select ea.id, cnt.card, ea.credit_value
        into v_best_id, v_best_card, v_best_credit
      from public.event_accreditations ea
      join lateral (
        select count(*) as card
        from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
      ) cnt on true
      where ea.accreditation_group_id = grp.id
        and cnt.card > 0
        and not exists (
          select 1 from public.event_accreditation_occurrences eao
          where eao.accreditation_id = ea.id
            and eao.occurrence_id not in (
              select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = v_reg_id
            )
        )
      order by cnt.card desc
      limit 1;

      if v_best_id is null then
        body_id := grp.body_id; outcome := 'skipped:no_matching_schedule'; return next;
        continue;
      end if;

      select count(*) into v_tie_count
      from public.event_accreditations ea
      join lateral (
        select count(*) as card
        from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
      ) cnt on true
      where ea.accreditation_group_id = grp.id
        and cnt.card = v_best_card
        and not exists (
          select 1 from public.event_accreditation_occurrences eao
          where eao.accreditation_id = ea.id
            and eao.occurrence_id not in (
              select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = v_reg_id
            )
        );

      if v_tie_count > 1 then
        body_id := grp.body_id; outcome := 'skipped:ambiguous_schedule'; return next;
        continue;
      end if;

      v_credit := v_best_credit;
    else
      raise exception 'award_attendance_credit: unrecognised award_scheme % on group %', grp.award_scheme, grp.id;
    end if;

    if grp.unit = 'points' then
      v_points := v_credit;
    else
      v_hours := v_credit;
    end if;

    begin
      perform public.record_credit_entry(
        v_licence.id, v_user_id, p_event_id, grp.body_id,
        'credit_earned', v_points, v_hours, v_category,
        v_eff, 'attendance_verified', v_actor
      );
      body_id := grp.body_id; outcome := 'issued'; return next;
    exception when unique_violation then
      body_id := grp.body_id; outcome := 'already'; return next;
    end;
  end loop;

  return;
end;
$function$;

revoke all on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff_id  uuid;
  v_event_id  uuid;
  v_start     timestamptz;
  v_occ1      uuid;
  v_occ2      uuid;
  v_reg_id    uuid;
  v_code      text := 'MIGFIX' || substr(md5(random()::text), 1, 6);
  v_result    text;
  v_result2   text;
  v_checkins  integer;
begin
  -- Grant posture survived the DROP+CREATE (ACLs are NOT preserved across a
  -- DROP the way they are across CREATE OR REPLACE — same lesson as C4's
  -- own header comment on award_attendance_credit).
  if has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in: anon must not be executable';
  end if;
  if not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in: service_role lost EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_attended(text, text, uuid)', 'EXECUTE') then
    raise exception 'mark_attended: authenticated lost EXECUTE';
  end if;
  if has_function_privilege('anon', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: anon must not be executable';
  end if;

  -- Live multi-occurrence check-in proof, through the real RPC (not a direct
  -- registration_checkins insert) — the exact path C4's own tests did not
  -- exercise.
  select id into v_staff_id from public.staff where status = 'active' limit 1;
  if v_staff_id is null then
    raise notice 'multi-occurrence check-in self-check skipped: no active staff row on this database yet';
  else
    v_start := now() - interval '30 minutes';
    insert into public.events (
      title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude,
      status, checkin_modes
    ) values (
      'Migration self-check multi-occurrence — DELETE ME', v_start, v_start + interval '1 hour', 'Asia/Hong_Kong',
      v_staff_id, 'Test Venue', 'Hong Kong', 'HK', 22.3, 114.2, 'published',
      '{"staff": true, "self_serve": true}'::jsonb
    ) returning id into v_event_id;

    -- occurrence 1 covers "now" so the first call resolves to it.
    select id into v_occ1 from public.event_occurrences where event_id = v_event_id and ordinal = 1;
    update public.event_occurrences set starts_at = now() - interval '5 minutes', ends_at = now() + interval '5 minutes'
      where id = v_occ1;

    insert into public.registrations (event_id, email, full_name, status, registration_code)
    values (v_event_id, 'migfix-selfcheck@example.com', 'Migration Fix Self-Check', 'registered', v_code)
    returning id into v_reg_id;

    select result into v_result from public.self_check_in(v_code, '203.0.113.1');
    if v_result <> 'ok' then
      raise exception 'multi-occurrence self-check: first check-in expected ok, got %', v_result;
    end if;

    -- Immediately re-tap: same occurrence still covers "now" -> must be
    -- 'already', not a second row (idempotency preserved).
    select result into v_result from public.self_check_in(v_code, '203.0.113.1');
    if v_result <> 'already' then
      raise exception 'multi-occurrence self-check: immediate re-tap expected already, got %', v_result;
    end if;

    -- Simulate day 2: shift occurrence 1 out of "now" and bring occurrence 2
    -- into it — occurrence time changes are allowed here (no credit exists
    -- for this event, so freeze_occurrence_window_if_credited is a no-op).
    update public.event_occurrences set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '1 hour'
      where id = v_occ1;
    insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
    values (v_event_id, 2, 'day', now() - interval '5 minutes', now() + interval '5 minutes')
    returning id into v_occ2;

    select result into v_result2 from public.self_check_in(v_code, '203.0.113.1');
    if v_result2 <> 'ok' then
      raise exception 'multi-occurrence self-check: THE BUG THIS MIGRATION FIXES — day-2 check-in expected ok, got %', v_result2;
    end if;

    select count(*) into v_checkins from public.registration_checkins where registration_id = v_reg_id;
    if v_checkins <> 2 then
      raise exception 'multi-occurrence self-check: expected 2 registration_checkins rows (one per occurrence), got %', v_checkins;
    end if;

    delete from public.registration_checkins where registration_id = v_reg_id;
    delete from public.registrations where id = v_reg_id;
    delete from public.events where id = v_event_id;
  end if;

  raise notice 'multi_occurrence_checkin_fix self-check: all assertions passed';
end $$;

-- Rollback:
--   restore self_check_in/mark_attended from 20260815010000
--   restore award_attendance_credit's proportional branch from 20260815030000 (no v_earned=0 guard)
