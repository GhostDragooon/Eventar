-- CPD Sprint 2 / self_check_in bug fix — the initial version's
-- `select id, event_id, status into ... from public.registrations where ...`
-- has an ambiguous column reference: `event_id` is both a registrations
-- column and the function's own RETURNS TABLE output-parameter name, and
-- PL/pgSQL's default `variable_conflict = error` behavior means this either
-- raises "column reference event_id is ambiguous" or silently resolves to
-- the wrong binding depending on session settings. Table-alias every
-- reference to unambiguously mean the registrations columns.
create or replace function public.self_check_in(p_code text)
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
-- CREATE OR REPLACE preserves the existing grants (anon, authenticated,
-- service_role from the original migration) — no grant restatement needed.
