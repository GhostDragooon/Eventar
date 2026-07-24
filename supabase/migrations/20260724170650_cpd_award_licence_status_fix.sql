-- CPD MVP Stage 4 corrective — award_attendance_credit matched status='active',
-- but practitioner_licences.status has no 'active' (declared|verified|lapsed|
-- revoked|superseded). The good-standing, credit-earning state is 'verified'
-- (set by verify_licence). With 'active' the resolver always returned no_licence,
-- so no credit could ever issue. Re-create the function matching 'verified'.
-- (create or replace — body identical except the licence status filter.)
create or replace function public.award_attendance_credit(
  p_event_id uuid, p_registration_code text, p_actor_id uuid default null
) returns text
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_event   public.events%rowtype;
  v_email   text;
  v_user_id uuid;
  v_licence public.practitioner_licences%rowtype;
  v_eff     date;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then return 'skipped:no_event'; end if;
  if v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0 then
    return 'skipped:not_cpd';
  end if;
  select email into v_email from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  if not found then return 'skipped:no_registration'; end if;
  select id into v_user_id from auth.users
    where lower(email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then return 'skipped:no_user'; end if;
  -- verified licence at THIS event's body, deterministic pick.
  select * into v_licence from public.practitioner_licences
    where user_id = v_user_id and body_id = v_event.accrediting_body_id and status = 'verified'
    order by created_at desc limit 1;
  if not found then return 'skipped:no_licence'; end if;
  v_eff := (v_event.start_time at time zone v_event.timezone)::date;
  begin
    perform public.record_credit_entry(
      v_licence.id, v_user_id, p_event_id, v_event.accrediting_body_id,
      'credit_earned', null, v_event.cpd_hours, null,
      v_eff, 'attendance_verified', p_actor_id
    );
  exception when unique_violation then
    return 'already';
  end;
  return 'issued';
end;
$$;
