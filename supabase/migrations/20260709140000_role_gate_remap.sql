-- CPD Sprint 3a / Task 2 follow-up — three shipped SECURITY DEFINER
-- functions (transition_dsr, mark_attended, publish_event) hardcoded
-- role literals from the pre-widen 2-role vocabulary ('organizer',
-- 'manager') into their app_private.require_active_staff(...) gate.
-- 20260709130000_staff_5role_widen.sql replaced that vocabulary
-- entirely with 5 new roles, making 'organizer'/'manager' permanently
-- unsatisfiable in these three calls — invisible today (the only live
-- staff row is already 'eventar_staff') but a silent access regression
-- the moment a real 'organiser_admin'/'organiser_member' account is
-- onboarded (Sprint 3b). Ivan's decision: DSR handling stays admin-tier
-- only; check-in/publish stay open to any organiser-side staff. Neither
-- list includes 'body_admin'/'auditor' (accrediting-body side — none of
-- these three actions are body-side). CREATE OR REPLACE preserves the
-- functions' existing grants (verified after apply, not assumed).

create or replace function public.transition_dsr(p_id uuid, p_status text, p_notes text default null)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  actor := app_private.require_active_staff('organiser_admin','eventar_staff');  -- gate: 42501 otherwise
  if p_status not in ('pending','in_progress','completed','rejected','escalated') then
    raise exception 'transition_dsr: invalid status %', p_status;
  end if;

  update public.data_subject_requests
     set status = p_status,
         resolver_staff_id = actor.id,
         resolution_notes = coalesce(p_notes, resolution_notes),
         resolved_at = case when p_status in ('completed','rejected') then now() else resolved_at end
   where id = p_id;
  if not found then
    raise exception 'transition_dsr: request % not found', p_id;
  end if;

  perform public.write_audit_event(
    'dsr_transitioned', auth.uid(), actor.role, actor.organisation_id,
    'data_subject_request', p_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.mark_attended(p_code text, p_method text)
returns table (
  result text, registration_id uuid, full_name text, event_id uuid,
  event_title text, check_in_at timestamptz
)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor    public.staff%rowtype;
  v_reg    public.registrations%rowtype;
  v_event  public.events%rowtype;
  v_win    timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl     jsonb;
begin
  actor := app_private.require_active_staff('organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  -- owner-exclusive check-in (Q19 / 2026-06-02): non-owner sees not_recognised
  if v_event.created_by <> actor.id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  if v_reg.status = 'attended' then
    result := 'already'; registration_id := v_reg.id; check_in_at := v_reg.check_in_at;
    return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = p_method
   where id = v_reg.id and status <> 'attended';
  if not found then
    -- lost the idempotency race between read and update — re-fetch the
    -- real winner's timestamp. Table-aliased: `check_in_at` (bare) would be
    -- ambiguous against this function's own OUT parameter of the same name.
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end if;

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, actor.organisation_id,
    'registration', v_reg.id,
    jsonb_build_object('event_id', v_event.id, 'method', p_method, 'via', 'staff_scan')
  );
  result := 'ok'; registration_id := v_reg.id; full_name := v_reg.full_name;
  event_id := v_event.id; event_title := v_event.title; return next;
end;
$$;

create or replace function public.publish_event(p_event_id uuid)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.require_active_staff('organiser_admin','organiser_member','eventar_staff');
  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id and created_by = actor.id   -- owner-exclusive
   returning organisation_id into v_org;
  if not found then
    raise exception 'publish_event: event % not found or not owned by caller', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')  -- Sprint 3 forward-compat
  );
end;
$$;
