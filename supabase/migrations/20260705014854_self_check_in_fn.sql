-- CPD Sprint 2 / A1+P3 — self check-in becomes atomic + audited. Actor is
-- anonymous (actor_user_id null, actor_role 'self_check_in'); tamper-evidence
-- is on the check-in FACT. Per-event rate-limit (not per-IP) sized for real
-- door-open burst — see design §4 / P2 (200 attendees >> a 10/min cap).
create function public.self_check_in(p_code text)
returns table (result text, event_id uuid)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_event_id uuid;
  v_reg_id   uuid;
  v_status   text;
  v_rl       jsonb;
  v_win      timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
begin
  -- resolve registration + event (definer bypasses RLS)
  select id, event_id, status into v_reg_id, v_event_id, v_status
  from public.registrations where registration_code = p_code;
  if v_reg_id is null then
    result := 'invalid'; event_id := null; return next; return;
  end if;

  -- per-event rate limit (slow work BEFORE audit-write, P2). Sized > burst.
  v_rl := public.rate_limit_check('selfCheckIn:' || v_event_id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then
    result := 'rate_limited'; event_id := v_event_id; return next; return;
  end if;

  if v_status = 'attended' then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = 'qr'
   where id = v_reg_id and status <> 'attended';
  if not found then
    -- lost the idempotency race between read and update
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  -- LAST: audit the check-in fact (anonymous actor).
  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$$;
grant execute on function public.self_check_in(text) to anon, authenticated, service_role;
