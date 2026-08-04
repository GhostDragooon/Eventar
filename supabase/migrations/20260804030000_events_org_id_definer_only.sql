-- 2026-08-04 — close two holes the Stage 7 three-lens review found. Both are
-- the same class this repo has now hit five times: THE CONTROL WAS PLACED ONE
-- LAYER ABOVE WHERE THE WRITE ACTUALLY HAPPENS.
--
-- ===========================================================================
-- CRITICAL 1 — the DEFERRED-56 authorisation gate was bypassable in two
-- statements, live.
--
-- set_event_cpd_config (20260804000000) checks the authorisation allow-list
-- against the EVENT's organisation_id. But `authenticated` held column-level
-- INSERT *and* UPDATE on events.organisation_id, and events_organizer_update_own
-- constrains only created_by — never the org. So, as a real organiser_admin in
-- an organisation holding no authorisation whatsoever:
--
--   1. set_event_cpd_config(evt, body, 3)  -> 42501, correctly refused
--   2. PATCH /rest/v1/events?id=eq.<my own event>
--        { "organisation_id": "00000000-0000-0000-0000-000000000001" }  -> 200
--   3. set_event_cpd_config(evt, body, 3)  -> bound.
--
-- No Server Action involved. The default-org UUID is a hardcoded repo constant,
-- and it is the organisation that holds every authorisation that exists.
--
-- The column was pure liability: a grep of app/, lib/ and scripts/ finds NOTHING
-- that writes events.organisation_id, and neither event RPC names it. It has
-- always been populated by the column DEFAULT alone.
--
-- WHICH EXPOSED A SECOND, QUIETER BUG. Because nothing ever set it, EVERY event
-- created through the product landed in the Default Organisation regardless of
-- the creating staff member's organisation — Q20 reversed the single-org
-- decision in July and this write path never caught up. Latent while one tenant
-- exists (Seoul: 1 organisation, 0 events and 0 staff outside it); wrong the
-- moment a second onboards. Found by a closed-loop backtest, not by any test:
-- every RLS fixture inserts events with organisation_id set explicitly, so only
-- the real RPC path exposes it.
--
-- THE FIX IS A TRIGGER, NOT AN RPC EDIT. create_event_with_blocks is SECURITY
-- INVOKER (20260725144446's comment claims otherwise and is wrong — see
-- 20260802022345's header), so naming organisation_id in its INSERT would check
-- the INVOKER's column privilege, and we are revoking exactly that. A
-- BEFORE INSERT trigger assigns the value after privilege checking, so it fixes
-- every write path at once — both RPCs, seed scripts, and raw PostgREST — with
-- the column writable by nobody.
--
-- ===========================================================================
-- CRITICAL 2 — mark_attended mints attendance AND permanent credit on a
-- cancelled registration.
--
-- DEFERRED 57 tightened self_check_in to `status = 'registered'` and left
-- mark_attended on the old `status <> 'attended'`. The two doors then disagreed
-- about the same person in the same second — and the staff door is the one that
-- mints the credit. Confirmed end to end by the review: mark_attended -> ok,
-- award_attendance_credit -> issued, a real credit_earned/attendance_verified
-- row, on a cancelled registration for a draft, soft-deleted event.
--
-- 20260725144446's guard (5b) was written as the compensating control for
-- exactly this ("a cancelled registration must never earn credit"). It has been
-- VACUOUS since the day it shipped, on BOTH paths: the check-in function flips
-- the row to 'attended' and commits, then awardAttendanceCredit calls a separate
-- RPC, so award_attendance_credit only ever reads 'attended' and never sees
-- 'cancelled'. (5b) can only fire via reconcile-event.ts.
--
-- Fixing only the door the ticket named is what created the divergence; this
-- closes the sibling. Result codes mirror self_check_in's vocabulary so the two
-- surfaces stay describable in the same words.

-- ---------------------------------------------------------------------------
-- (1) Derive events.organisation_id from the creating staff member.
-- ---------------------------------------------------------------------------
create or replace function public.set_event_organisation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
begin
  -- created_by is NOT NULL and FKs to staff, but a defensive miss leaves the
  -- column default rather than nulling a NOT NULL column.
  select s.organisation_id into v_org from public.staff s where s.id = new.created_by;
  if v_org is not null then
    new.organisation_id := v_org;
  end if;
  return new;
end;
$$;

comment on function public.set_event_organisation() is
  'Assigns events.organisation_id from the creating staff row. The column is not writable by any app role (20260804030000), so this is its only writer.';

drop trigger if exists set_event_organisation_trg on public.events;
create trigger set_event_organisation_trg
  before insert on public.events
  for each row execute function public.set_event_organisation();

-- Backfill any event whose org disagrees with its creator's. Expected to be a
-- no-op wherever only the default organisation exists.
update public.events e
   set organisation_id = s.organisation_id
  from public.staff s
 where s.id = e.created_by
   and e.organisation_id is distinct from s.organisation_id;

-- ---------------------------------------------------------------------------
-- (2) The grant lock. Table REVOKE first — a column revoke is a silent no-op
--     while a table grant stands (Hard Rule 11, learned four times).
--     organisation_id joins status/published_at/accrediting_body_id/cpd_hours
--     as definer-only. service_role keeps its table grants (seed scripts,
--     dashboard bulk cancel, reconcile).
-- ---------------------------------------------------------------------------
revoke insert, update on public.events from anon, authenticated;
grant insert (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at
) on public.events to authenticated;
grant update (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at
) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- (3) mark_attended — refuse a cancelled registration and a dead event.
--     Body otherwise unchanged from the live definition.
-- ---------------------------------------------------------------------------
create or replace function public.mark_attended(p_code text, p_method text)
 returns table(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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

  -- A cancelled registration is cancelled at either door. Deliberately NOT a
  -- time check: mark_attended stays un-time-gated because a staff member is a
  -- trusted, physically-present actor, which is a statement about WHEN, not
  -- about WHO is entitled to be there.
  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  -- A soft-deleted or unpublished event is not running. Every other surface
  -- (/events, /checkin, /analytics, the dispatcher) filters deleted_at; a door
  -- that mints regulator-facing credit is not the place for an exception.
  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = p_method
   where id = v_reg.id and status = 'registered';
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

  result := 'ok';
  registration_id := v_reg.id;
  full_name := v_reg.full_name;
  event_id := v_event.id;
  event_title := v_event.title;
  check_in_at := now();
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare src text;
begin
  if has_column_privilege('authenticated','public.events','organisation_id','UPDATE')
     or has_column_privilege('authenticated','public.events','organisation_id','INSERT') then
    raise exception 'events.organisation_id is still writable by authenticated — the DEFERRED-56 gate stays bypassable';
  end if;
  if not has_column_privilege('authenticated','public.events','title','UPDATE') then
    raise exception 'over-revoked: authenticated lost a normal events column';
  end if;
  if not has_table_privilege('service_role','public.events','INSERT') then
    raise exception 'service_role lost its events write path';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_event_organisation_trg'
                   and tgrelid = 'public.events'::regclass) then
    raise exception 'the organisation-assignment trigger is missing';
  end if;

  select pg_get_functiondef(p.oid) into src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='mark_attended';
  if src not like '%and status = ''registered''%' then
    raise exception 'mark_attended does not restrict its UPDATE to registered rows';
  end if;
  if src not like '%''cancelled''%' then
    raise exception 'mark_attended has no cancelled-registration guard';
  end if;
end $$;

-- Rollback:
--   drop trigger set_event_organisation_trg on public.events;
--   grant insert (organisation_id), update (organisation_id) on public.events to authenticated;
--   (re-apply 20260709140000's mark_attended body)
