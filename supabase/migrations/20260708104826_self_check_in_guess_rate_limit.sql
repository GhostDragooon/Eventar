-- CPD Sprint 2 / Task 14 follow-up (user-lens review at the exit gate) --
-- restores brute-force protection for the guessing path, which the
-- per-IP -> per-event conversion silently dropped. Before this sprint,
-- EVERY self-check-in attempt (valid or not) was rate-limited 10/min/IP.
-- After the conversion, an invalid code returns immediately, before the
-- per-event rate_limit_check is ever reached -- so guessing against
-- /checkin/confirm had NO rate limit at all, undermining the explicit
-- security model in lib/registrationCode.ts ("887M codes -- resists
-- brute-force search ... paired with rate-limiting").
--
-- Fix: rate-limit ONLY the invalid-code (guessing) path, by IP. A
-- blanket per-IP limit can't be restored wholesale -- that's exactly the
-- venue-NAT false-positive problem the per-event switch was designed to
-- fix (200 legitimate attendees behind one venue router IP must all
-- succeed, per this sprint's own P3 acceptance criterion). But a
-- legitimate attendee's code always resolves to a real registration, so
-- they never touch this branch -- only pure guessing does. This changes
-- self_check_in's signature (adds p_ip), so the old 1-arg overload is
-- dropped explicitly rather than left reachable alongside the new one.
drop function if exists public.self_check_in(text);

create function public.self_check_in(p_code text, p_ip text)
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
  -- resolve registration + event (definer bypasses RLS). Table alias needed:
  -- the bare column name `event_id` is ambiguous against the OUT parameter
  -- of the same name declared in `returns table (result text, event_id uuid)`.
  select r.id, r.event_id, r.status into v_reg_id, v_event_id, v_status
  from public.registrations r where r.registration_code = p_code;

  if v_reg_id is null then
    -- Guessing-path guard: tight per-IP limit, only reached when the code
    -- doesn't resolve. Legitimate attendees never hit this.
    v_rl := public.rate_limit_check('selfCheckInGuess:' || p_ip, v_win, 10);
    if (v_rl->>'allowed')::boolean is false then
      result := 'rate_limited'; event_id := null; return next; return;
    end if;
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

-- Re-apply the same grants the original function had (anon-callable,
-- public unauthenticated pass) -- DROP does not preserve grants.
revoke execute on function public.self_check_in(text, text) from public;
grant execute on function public.self_check_in(text, text) to anon, authenticated, service_role;
