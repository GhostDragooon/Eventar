-- ADR-0003 Weekend MVP — Step 2: wire mark_attended / self_check_in to
-- record participation_evidence after the registration_checkins write.
-- Evidence write failure is logged (RAISE WARNING) but does NOT roll back
-- the check-in — attendance is authoritative, evidence is the durable record.
--
-- IMPORTANT: function bodies are based on 20260815040000_multi_occurrence_checkin_fix.sql
-- (the LATEST definition), NOT 20260815010000. The earlier version had a
-- v_status = 'attended' short-circuit BEFORE occurrence resolution that killed
-- multi-occurrence check-ins. See that migration's header for the full story.

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

  -- Resolve the occurrence BEFORE any write (20260815040000 fix).
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
      result := 'no_matching_occurrence'; event_id := v_event_id; return next; return;
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

create or replace function public.mark_attended(p_code text, p_method text, p_actor_override uuid default null::uuid)
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
  v_capture_method   text;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if v_event.created_by <> actor.id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  -- Only 'cancelled' blocks unconditionally (20260815040000 fix).
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

  -- Map p_method to evidence capture_method
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

-- ---------------------------------------------------------------------------
-- Assertions — CREATE OR REPLACE preserves each function's existing ACL.
-- ---------------------------------------------------------------------------
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

  -- Preserved guards
  if src_self not like '%registration_checkins%' then
    raise exception 'self_check_in no longer writes registration_checkins';
  end if;
  if src_self not like '%no_matching_occurrence%' then
    raise exception 'self_check_in is missing the ambiguous-occurrence guard';
  end if;
  if src_mark not like '%registration_checkins%' then
    raise exception 'mark_attended no longer writes registration_checkins';
  end if;
  if src_mark not like '%no_matching_occurrence%' then
    raise exception 'mark_attended is missing the ambiguous-occurrence guard';
  end if;

  -- Multi-occurrence fix preserved (20260815040000): status is NOT a short-circuit
  if src_self like '%v_status = ''attended''%' then
    raise exception 'self_check_in still has the pre-fix attended short-circuit — multi-occurrence check-in is broken';
  end if;

  -- New: evidence write is present
  if src_self not like '%record_participation_evidence%' then
    raise exception 'self_check_in does not call record_participation_evidence';
  end if;
  if src_mark not like '%record_participation_evidence%' then
    raise exception 'mark_attended does not call record_participation_evidence';
  end if;

  -- Preserved ACLs
  if has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in must not be anon-executable';
  end if;
  if not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in lost service_role EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_attended(text, text, uuid)', 'EXECUTE') then
    raise exception 'mark_attended lost authenticated EXECUTE';
  end if;
end $$;
