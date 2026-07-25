-- CPD MVP — review finding MEDIUM-4: staff-issued credits recorded no actor.
--
-- The execution plan said the staff path should pass `actorId = staff.id`, but
-- credit_ledger.actor_id references public.users(id) and staff.id is an
-- independent gen_random_uuid() — zero staff.id values exist in public.users, so
-- the plan's literal instruction would have raised 23503 on every staff-scanned
-- check-in. (award_attendance_credit's `exception when unique_violation` does
-- NOT catch that, so the credit would have failed while attendance succeeded.)
-- The implementer omitting it was accidentally protective; the cost is that
-- "who caused this credit" is recorded nowhere on a regulator-facing ledger.
--
-- Correct mapping: the staff member's own auth.users id (they authenticate as an
-- auth user; public.users mirrors auth.users via on_auth_user_created). The TS
-- staff path now passes it. actor_id is already inside the hash envelope
-- (compute_credit_ledger_hash covers all 18 columns since the 20260709260000
-- hardening), so no chain versioning is needed.
--
-- Defensive guard, and why it is NOT theoretical: verified live on Seoul that
-- 1 of 5 staff rows currently has no public.users mirror row (staff is matched
-- to auth by email and has no FK to it, so the two can drift). Without this
-- guard such a staff member's every scan would raise 23503 and cost the
-- practitioner a legitimate credit. Attribution is best-effort; the credit is
-- not. `raise warning` surfaces the drop in the Postgres log rather than
-- dropping it silently (CLAUDE.md rule 12) while keeping the return contract.
create or replace function public.award_attendance_credit(
  p_event_id uuid, p_registration_code text, p_actor_id uuid default null
) returns text
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_event   public.events%rowtype;
  v_email   text;
  v_status  text;
  v_user_id uuid;
  v_licence public.practitioner_licences%rowtype;
  v_eff     date;
  v_actor   uuid := p_actor_id;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then return 'skipped:no_event'; end if;
  if v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0 then
    return 'skipped:not_cpd';
  end if;

  if now() < v_event.start_time - interval '24 hours'
     or now() > v_event.end_time + interval '24 hours' then
    return 'skipped:outside_window';
  end if;

  select email, status into v_email, v_status from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  if not found then return 'skipped:no_registration'; end if;

  if v_status = 'cancelled' then return 'skipped:cancelled'; end if;

  select id into v_user_id from auth.users
    where lower(email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then return 'skipped:no_user'; end if;

  select * into v_licence from public.practitioner_licences
    where user_id = v_user_id and body_id = v_event.accrediting_body_id and status = 'verified'
    order by created_at desc limit 1;
  if not found then return 'skipped:no_licence'; end if;

  -- attribution degrades, the credit does not (see header).
  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    raise warning 'award_attendance_credit: actor % has no public.users row; issuing credit unattributed', v_actor;
    v_actor := null;
  end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  begin
    perform public.record_credit_entry(
      v_licence.id, v_user_id, p_event_id, v_event.accrediting_body_id,
      'credit_earned', null, v_event.cpd_hours, null,
      v_eff, 'attendance_verified', v_actor
    );
  exception when unique_violation then
    return 'already';
  end;
  return 'issued';
end;
$$;

revoke all on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;

-- Rollback: re-apply 20260725144446's function body (drops the actor guard).
