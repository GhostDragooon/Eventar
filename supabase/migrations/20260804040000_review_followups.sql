-- 2026-08-04 — the DB half of the Stage 7 three-lens review follow-ups.
-- Four independent fixes; the app-layer half lands in the same commit.
--
-- ===========================================================================
-- (1) self_check_in: `not_open` was TWO different facts wearing one name.
--
-- The code covered both `now() < start − 60min` and `now() > end_time`, and the
-- attendee copy read "Check-in isn't open yet. It opens an hour before the event
-- starts." Someone tapping an hour AFTER the event ended was told to wait for a
-- moment that had already passed — and nothing suggested finding staff, so
-- nobody corrects them. Attendance is the evidentiary base of the whole ledger
-- and there is no self-service recovery (recovery is reconcile-event.ts, run by
-- an engineer).
--
-- This is the same defect the distinct result codes existed to prevent, so the
-- fix is to finish the job: `not_open_yet` and `closed`.
-- ===========================================================================
create or replace function public.self_check_in(p_code text, p_ip text)
 returns table(result text, event_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event_id uuid;
  v_reg_id   uuid;
  v_status   text;
  v_rl       jsonb;
  v_win      timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_ev       public.events%rowtype;
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
     set status = 'attended', check_in_at = now(), check_in_method = 'qr'
   where id = v_reg_id and status = 'registered';
  if not found then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$function$;

grant execute on function public.self_check_in(text, text) to anon, authenticated, service_role;

-- ===========================================================================
-- (2) set_event_cpd_config: two different causes raised the SAME SQLSTATE.
--
-- 20260804000000 added an authorisation refusal at 42501, alongside the
-- pre-existing not-the-owner refusal at 42501. The single caller branch in
-- app/events/[id]/details/cpdActions.ts therefore told an organiser "Only the
-- event owner can set its accreditation" — when they ARE the owner and the real
-- remedy is an out-of-band relationship with the accrediting body. Wrong remedy
-- is worse than no remedy: it sends them hunting for a colleague.
--
-- 42501 is semantically right for both, so the discriminator goes in DETAIL
-- (surfaced by PostgREST as `details`) rather than abusing an unrelated
-- SQLSTATE.
-- ===========================================================================
create or replace function public.set_event_cpd_config(
  p_event_id  uuid,
  p_body_id   uuid,
  p_cpd_hours numeric
) returns public.events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.staff%rowtype;
  v_row public.events;
  v_owner uuid;
  v_event_org uuid;
begin
  actor := app_private.require_active_staff('organiser_admin', 'eventar_staff');

  if (p_body_id is null) <> (p_cpd_hours is null) then
    raise exception 'set_event_cpd_config: accrediting body and CPD hours must be set together, or both cleared'
      using errcode = '22023';
  end if;

  select created_by, organisation_id into v_owner, v_event_org
    from public.events where id = p_event_id for update;
  if not found then
    raise exception 'set_event_cpd_config: event % not found', p_event_id
      using errcode = 'P0002';
  end if;

  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'set_event_cpd_config: not the owner of event %', p_event_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  if p_body_id is not null and not exists (
    select 1 from public.accrediting_bodies b where b.id = p_body_id and b.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: accrediting body % is not an active body', p_body_id
      using errcode = 'P0002';
  end if;

  -- DEFERRED 56. Checked against the EVENT's organisation, with no
  -- eventar_staff exception — the body's authority is not ours to override.
  -- Only asserting a claim is gated; clearing stays open.
  if p_body_id is not null and not exists (
    select 1 from public.organisation_body_authorisations a
     where a.organisation_id = v_event_org
       and a.body_id = p_body_id
       and a.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: this organisation is not authorised to claim accreditation from body %', p_body_id
      using errcode = '42501', detail = 'not_authorised_for_body';
  end if;

  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
  returning * into v_row;

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

revoke all on function public.set_event_cpd_config(uuid, uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.set_event_cpd_config(uuid, uuid, numeric)
  to authenticated, service_role;

-- ===========================================================================
-- (3) publish_event was not idempotent: re-calling it RESET published_at to now
--     and appended a SECOND event_published row to the hash chain. For a
--     regulator-facing chain, "published at" must be the first publication, and
--     a double-click must not manufacture a second event that never happened.
-- ===========================================================================
create or replace function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.require_active_staff('organiser_admin','organiser_member','eventar_staff');
  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id and created_by = actor.id   -- owner-exclusive
     and status is distinct from 'published'
   returning organisation_id into v_org;
  if not found then
    -- Already published by this same owner: a no-op, NOT an error. Returning
    -- here preserves the original published_at and writes no second chain row.
    if exists (
      select 1 from public.events
       where id = p_event_id and created_by = actor.id and status = 'published'
    ) then
      return;
    end if;
    raise exception 'publish_event: event % not found or not owned by caller', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')  -- Sprint 3 forward-compat
  );
end;
$function$;

-- ===========================================================================
-- (4) credit_disputes held table-level UPDATE/DELETE/TRUNCATE for anon AND
--     authenticated, with only self-read + self-raise policies. RLS denies
--     today, so nothing is exploitable — but `status`, `resolved_by`,
--     `resolution_reference` and `resolution_note` are RESOLUTION fields on a
--     regulator-facing dispute record, and they sit one added policy away from
--     self-resolution. Hard Rule 11 exists because RLS-as-the-only-control has
--     failed this repo four times.
--
--     INSERT stays for authenticated (credit_disputes_self_raise is a real
--     surface); anon keeps nothing, having no policy at all.
-- ===========================================================================
revoke update, delete, truncate on public.credit_disputes from anon, authenticated;
revoke insert, select on public.credit_disputes from anon;

do $$
begin
  if has_table_privilege('authenticated','public.credit_disputes','UPDATE')
     or has_table_privilege('authenticated','public.credit_disputes','DELETE') then
    raise exception 'credit_disputes resolution fields are still writable by authenticated';
  end if;
  if not has_table_privilege('authenticated','public.credit_disputes','INSERT') then
    raise exception 'over-revoked: authenticated can no longer raise a dispute';
  end if;

  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='self_check_in') not like '%not_open_yet%' then
    raise exception 'self_check_in did not gain the split window codes';
  end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='publish_event') not like '%is distinct from ''published''%' then
    raise exception 'publish_event is still non-idempotent';
  end if;
end $$;

-- NOT changed, deliberately: public.staff holds column-level UPDATE on
-- (email, full_name, organisation_id, status) for authenticated with ZERO
-- UPDATE policies, so RLS denies every write. Flagged by the same review as
-- credit_disputes' shape. Left alone because those columns are the natural
-- surface for a future staff self-profile edit, and revoking now would remove a
-- grant a shipped policy would need — whereas credit_disputes' resolution
-- fields must NEVER be self-writable. Recorded in docs/DEFERRED.md rather than
-- silently either way.
