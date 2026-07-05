-- CPD Sprint 2 / Task 11 — staff-scan check-in becomes atomic + audited.
-- Owner-exclusive check-in preserved (Q19 / 2026-06-02): the definer
-- bypasses RLS entirely, so THIS in-function owner check is now the sole
-- enforcement (A5) — non-owners get the same "not_recognised" a
-- nonexistent code would, preserving info-hiding by design.
create function public.mark_attended(p_code text, p_method text)
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
  actor := app_private.require_active_staff('organizer','manager','eventar_staff');
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
revoke execute on function public.mark_attended(text, text) from public, anon;
grant execute on function public.mark_attended(text, text) to authenticated, service_role;
