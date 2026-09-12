-- Fix: 20260912000000 / 20260912010000 both regressed to created_by-based
-- access, undoing the 20260910 authority sweep that moved event access to
-- organisation_id membership. Three separate bugs, same root cause (all
-- three were authored against a pre-sweep copy of the function/policy):
--
--   1. participation_evidence_organizer_select_own used
--      e.created_by = app_private.current_staff_id() instead of
--      app_private.is_org_member(participation_evidence.organisation_id).
--   2. mark_attended's CREATE OR REPLACE in 20260912010000 clobbered the
--      sweep's v_event.organisation_id <> actor.organisation_id guard back
--      to v_event.created_by <> actor.id.
--   3. participation_evidence_manager_select_all used app_private.is_manager(),
--      which is true for BOTH 'eventar_staff' (intentionally global) and
--      'organiser_admin' (should be org-scoped) with no organisation filter
--      at all — any organiser_admin in any organisation could read every
--      organisation's evidence through this policy alone, regardless of the
--      org-scoped policy above (RLS policies are OR'd). Caught in code
--      review, not caught by this migration's own first draft. The sweep's
--      analogous fix for events (events_manager_read_all, sweep lines 57-62)
--      already split this into is_eventar_staff() OR is_org_member(...); this
--      migration applies the same split here.
--
-- This migration restores org-scoped access for all three, preserving the
-- evidence-recording behaviour added in 20260912010000.

-- ---------------------------------------------------------------------------
-- 1. participation_evidence RLS — org-scoped, not creator-scoped
-- ---------------------------------------------------------------------------
drop policy "participation_evidence_organizer_select_own" on public.participation_evidence;

create policy "participation_evidence_org_member_select"
  on public.participation_evidence
  for select to authenticated
  using (app_private.is_org_member(participation_evidence.organisation_id));

-- The manager policy OR's with the one above (RLS policies are permissive),
-- so it must be org-scoped too — is_manager() alone (true for organiser_admin
-- OR eventar_staff, no org filter) would otherwise let any organiser_admin
-- read every organisation's evidence regardless of the policy above.
drop policy "participation_evidence_manager_select_all" on public.participation_evidence;

create policy "participation_evidence_manager_select_all"
  on public.participation_evidence
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or app_private.is_org_member(participation_evidence.organisation_id)
  );

-- ---------------------------------------------------------------------------
-- 1b. record_participation_evidence — validate p_organisation_id against the
-- event it claims to belong to. The column is now load-bearing for RLS
-- access control (both policies above read it directly) but nothing
-- previously constrained it; both current callers already pass the event's
-- own organisation_id correctly, so this closes a latent gap rather than
-- changing observed behaviour.
-- ---------------------------------------------------------------------------
create or replace function public.record_participation_evidence(
  p_organisation_id       uuid,
  p_event_id              uuid,
  p_occurrence_id         uuid default null,
  p_registration_id       uuid default null,
  p_user_id               uuid default null,
  p_evidence_type         text default 'check_in',
  p_capture_method        text default 'manual_entry',
  p_source                text default 'staff_attestation',
  p_captured_at           timestamptz default now(),
  p_attestation_strength  text default 'standard',
  p_actor_id              uuid default null,
  p_device_metadata       jsonb default '{}',
  p_source_nonce          text default null,
  p_previous_evidence_id  uuid default null,
  p_local_unlock_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
  v_event_org uuid;
begin
  select organisation_id into v_event_org from public.events where id = p_event_id;
  if v_event_org is null then
    raise exception 'record_participation_evidence: event % not found', p_event_id;
  end if;
  if p_organisation_id is distinct from v_event_org then
    raise exception 'record_participation_evidence: organisation_id % does not match event %''s organisation %',
      p_organisation_id, p_event_id, v_event_org;
  end if;

  -- Idempotent on source_nonce
  if p_source_nonce is not null then
    select id into v_existing_id
    from public.participation_evidence
    where source_nonce = p_source_nonce;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.participation_evidence (
    organisation_id, event_id, occurrence_id, registration_id, user_id,
    evidence_type, capture_method, source, captured_at, attestation_strength,
    actor_id, device_metadata, source_nonce, previous_evidence_id,
    local_unlock_metadata
  ) values (
    p_organisation_id, p_event_id, p_occurrence_id, p_registration_id, p_user_id,
    p_evidence_type, p_capture_method, p_source, p_captured_at, p_attestation_strength,
    p_actor_id, p_device_metadata, p_source_nonce, p_previous_evidence_id,
    p_local_unlock_metadata
  ) returning id into v_new_id;

  -- Audit insert last (Hard Rule: audit_events is the last write)
  perform public.write_audit_event(
    'evidence_recorded', p_actor_id, 'system',
    p_organisation_id, 'participation_evidence', v_new_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'evidence_type', p_evidence_type,
      'capture_method', p_capture_method,
      'source', p_source,
      'attestation_strength', p_attestation_strength
    )
  );

  return v_new_id;
end;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but assert it explicitly.
revoke all on function public.record_participation_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, text,
  uuid, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_participation_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, text,
  uuid, jsonb, text, uuid, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- 2. mark_attended — restore org-scoped guard, keep evidence recording
-- ---------------------------------------------------------------------------
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

-- CREATE OR REPLACE preserves the existing ACL, but assert it explicitly —
-- this is exactly the class of silent drift this migration exists to fix.
revoke all on function public.mark_attended(text, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_attended(text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
do $$
declare
  src_mark text;
  src_record text;
  qual_member text;
  qual_manager text;
begin
  select pg_get_functiondef(p.oid) into src_mark
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mark_attended';

  if src_mark like '%v_event.created_by%' then
    raise exception 'mark_attended still gates on created_by — org-scope fix failed';
  end if;
  if src_mark not like '%v_event.organisation_id <> actor.organisation_id%' then
    raise exception 'mark_attended is missing the org-scoped guard';
  end if;
  if src_mark not like '%record_participation_evidence%' then
    raise exception 'mark_attended lost its evidence-recording call';
  end if;

  if not has_function_privilege('authenticated', 'public.mark_attended(text, text, uuid)', 'EXECUTE') then
    raise exception 'mark_attended lost authenticated EXECUTE';
  end if;
  if has_function_privilege('anon', 'public.mark_attended(text, text, uuid)', 'EXECUTE') then
    raise exception 'mark_attended must not be anon-executable';
  end if;

  select pg_get_functiondef(p.oid) into src_record
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_participation_evidence';
  if src_record not like '%organisation_id % does not match event%' then
    raise exception 'record_participation_evidence lost its organisation_id/event validation';
  end if;

  -- Check policy SEMANTICS (qual text), not just that a name exists — a
  -- name-only check would pass a future drop-and-recreate under the same
  -- name with a created_by predicate, which is exactly how this bug reached
  -- production the first time.
  select qual into qual_member from pg_policies
    where schemaname = 'public' and tablename = 'participation_evidence'
      and policyname = 'participation_evidence_org_member_select';
  if qual_member is null then
    raise exception 'participation_evidence_org_member_select policy was not created';
  end if;
  if qual_member not like '%is_org_member%' or qual_member like '%created_by%' then
    raise exception 'participation_evidence_org_member_select does not check is_org_member: %', qual_member;
  end if;

  select qual into qual_manager from pg_policies
    where schemaname = 'public' and tablename = 'participation_evidence'
      and policyname = 'participation_evidence_manager_select_all';
  if qual_manager is null then
    raise exception 'participation_evidence_manager_select_all policy was not created';
  end if;
  if qual_manager not like '%is_org_member%' then
    raise exception 'participation_evidence_manager_select_all is missing the org-scoped OR branch — organiser_admin cross-org read is open: %', qual_manager;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'participation_evidence'
      and policyname = 'participation_evidence_organizer_select_own'
  ) then
    raise exception 'stale creator-scoped policy participation_evidence_organizer_select_own still exists';
  end if;
end $$;
