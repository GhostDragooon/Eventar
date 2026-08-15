-- Task 10.8/10.9, sub-task C2 of 5 — self_check_in / mark_attended write
-- through registration_checkins against a resolved event_occurrences row,
-- instead of the inline registrations.check_in_at/check_in_method columns
-- C1 (20260815000000) turned into legacy summary fields. C1's
-- sync_registration_checkin_summary trigger propagates the insert back into
-- those two columns, so every existing reader keeps working unchanged.
--
-- Design authority: docs/adr/0002-multi-body-accreditation.md "Storage
-- shape" + "Attendance units" sections.
--
-- WHAT CHANGES, PRECISELY. In both functions the atomic conditional UPDATE
-- (`... WHERE id = ... AND status = 'registered'`) is UNCHANGED as the sole
-- concurrency gate against a double check-in race — a losing concurrent call
-- still finds `not found` and returns 'already' before ever attempting a
-- registration_checkins insert, so that table's own
-- unique(registration_id, occurrence_id) is never exercised by the race.
-- Only the SET list shrinks (drops check_in_at/check_in_method, which the
-- trigger now derives). Every other guard — rate limits, checkin_modes,
-- the not_open_yet/closed window, the owner info-hiding shape in
-- mark_attended — is untouched.
--
-- OCCURRENCE RESOLUTION (new). After the UPDATE succeeds and before
-- write_audit_event (Hard Rule: audit insert last):
--   1. Find the event_occurrences row whose [starts_at, ends_at) contains
--      now(). Today this is always exactly one row (C1's trigger
--      auto-creates one per event; no UI yet creates more), and the
--      not_open_yet/closed guards upstream already gate the overall
--      window, so falling back to "the event's only occurrence" when none
--      matches by time is safe, not a guess.
--   2. If the event has MORE than one occurrence and none contains now(),
--      this is genuinely ambiguous (multi-day event, no matching window —
--      e.g. a manual scan outside every occurrence's hours). Per rule 12
--      (fail visibly) and ADR-0002's own reasoning, do not guess which day
--      to attribute attendance to: return a new result code,
--      'no_matching_occurrence', AND undo the status flip back to
--      'registered'. This last part is NOT explicitly spelled out in the
--      task brief but is added deliberately — without it, the registration
--      would be left permanently 'attended' with no registration_checkins
--      row and no audit event (the status guard would then return
--      'already' forever, silently losing the ability to ever record real
--      attendance for it). Reverting keeps the invariant "status='attended'
--      implies a registration_checkins row exists" intact and lets the
--      caller retry once the occurrence configuration is fixed. Currently
--      unreachable through the live app (no UI creates a second
--      occurrence yet) — only reachable via a direct-SQL fixture, which is
--      exactly how this migration's own test suite exercises it.
--   3. Insert into registration_checkins. Both functions are already
--      SECURITY DEFINER owned by the table owner, so this succeeds despite
--      C1's table-level revoke on anon/authenticated/service_role.

create or replace function public.self_check_in(p_code text, p_ip text)
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

  if v_status = 'attended' then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

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

  update public.registrations
     set status = 'attended'
   where id = v_reg_id and status = 'registered';
  if not found then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  -- Resolve the occurrence this check-in belongs to (ADR-0002 storage
  -- shape). eo.event_id is qualified: this function's own OUT parameter is
  -- also named event_id, and PL/pgSQL resolves an unqualified column
  -- reference against a variable of the same name over the table column,
  -- which silently breaks the WHERE clause rather than raising — confirmed
  -- live during backtest (see report).
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
      -- Ambiguous — do not guess (see migration header). Undo the status
      -- flip so the registration is not left 'attended' with no matching
      -- registration_checkins row.
      update public.registrations set status = 'registered' where id = v_reg_id;
      result := 'no_matching_occurrence'; event_id := v_event_id; return next; return;
    end if;
  end if;

  insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
  values (v_reg_id, v_occurrence_id, now(), 'qr');

  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$function$;

create or replace function public.mark_attended(p_code text, p_method text, p_actor_override uuid default null::uuid)
returns table(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamp with time zone)
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

  if v_reg.status = 'attended' then
    result := 'already'; registration_id := v_reg.id; check_in_at := v_reg.check_in_at;
    return next; return;
  end if;

  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  update public.registrations
     set status = 'attended'
   where id = v_reg.id and status = 'registered';
  if not found then
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end if;

  -- Resolve the occurrence this check-in belongs to (ADR-0002 storage
  -- shape). eo.event_id is qualified — see self_check_in above for why:
  -- this function's own OUT parameter is also named event_id.
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
      -- Ambiguous — do not guess (see migration header). Undo the status
      -- flip so the registration is not left 'attended' with no matching
      -- registration_checkins row.
      update public.registrations set status = 'registered' where id = v_reg.id;
      result := 'no_matching_occurrence'; registration_id := v_reg.id; return next; return;
    end if;
  end if;

  insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
  values (v_reg.id, v_occurrence_id, now(), p_method);

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
  check_in_at := now();
  return next;
end;
$function$;

-- CREATE OR REPLACE preserves each function's existing ACL (self_check_in:
-- service_role only, since 20260806000100; mark_attended: authenticated +
-- service_role, since 20260705044719 / 20260814020000). Verify that held,
-- plus the new insert path and the preserved race guard.
do $$
declare
  src_self text;
  src_mark text;
begin
  select pg_get_functiondef(p.oid) into src_self
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'self_check_in';
  select pg_get_functiondef(p.oid) into src_mark
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mark_attended';

  if src_self not like '%registration_checkins%' then
    raise exception 'self_check_in no longer writes registration_checkins';
  end if;
  if src_self not like '%and status = ''registered''%' then
    raise exception 'self_check_in lost its atomic conditional UPDATE race guard';
  end if;
  if src_self like '%check_in_at = now(), check_in_method%' then
    raise exception 'self_check_in still writes check_in_at/check_in_method inline — should be trigger-derived now';
  end if;
  if src_self not like '%no_matching_occurrence%' then
    raise exception 'self_check_in is missing the ambiguous-occurrence guard';
  end if;

  if src_mark not like '%registration_checkins%' then
    raise exception 'mark_attended no longer writes registration_checkins';
  end if;
  if src_mark not like '%and status = ''registered''%' then
    raise exception 'mark_attended lost its atomic conditional UPDATE race guard';
  end if;
  if src_mark like '%check_in_at = now(), check_in_method = p_method%' then
    raise exception 'mark_attended still writes check_in_at/check_in_method inline — should be trigger-derived now';
  end if;
  if src_mark not like '%no_matching_occurrence%' then
    raise exception 'mark_attended is missing the ambiguous-occurrence guard';
  end if;

  if has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in must not be anon-executable';
  end if;
  if not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in lost service_role EXECUTE — the app path would break';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_attended(text, text, uuid)', 'EXECUTE') then
    raise exception 'mark_attended lost authenticated EXECUTE — the staff scan path would break';
  end if;
end $$;

-- Rollback: re-apply the pre-existing CREATE OR REPLACE from
-- 20260814020000 (mark_attended) and 20260804010000 (self_check_in), which
-- write check_in_at/check_in_method inline again.
