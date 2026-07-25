-- CPD MVP — hardening from the three-lens phase-completion review (2026-07-25).
-- Five findings, all verified live against Seoul before this migration was written.
-- Ordered least-to-most invasive; every statement is re-runnable (plan issue #7).

-- ---------------------------------------------------------------------------
-- (1) HIGH-1a — cpd_hours had no upper bound.
-- The only constraint was `> 0`, so 1e9 was legal and would be snapshotted
-- immutably onto an append-only, regulator-facing ledger row. 24 is the
-- defensible ceiling for a single event's contact hours.
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_cpd_hours_check;
alter table public.events add constraint events_cpd_hours_check
  check (cpd_hours is null or (cpd_hours > 0 and cpd_hours <= 24));

-- ---------------------------------------------------------------------------
-- (2) HIGH-1b — an organiser could bind their own event to ANY accrediting
-- body, with any hours, straight through PostgREST: events_organizer_update_own
-- is `for update to authenticated using (created_by = current_staff_id())` with
-- NO column restriction, and both columns carried a table-level UPDATE grant.
-- Every registrant holding a verified licence at that body then earned a
-- permanent credit the body never authorised.
--
-- Table REVOKE must come FIRST: a column-level `revoke update (col)` is a
-- silent no-op while a table-level UPDATE grant still stands.
--
-- Nothing legitimate loses access — verified before writing this: the organiser
-- edit path is the `update_event_with_blocks` SECURITY DEFINER RPC (runs as the
-- owner), `publish_event` likewise, and both direct `.update()` call sites in
-- app code (dashboard bulk actions, edit fallback) use the service_role client.
-- anon is revoked and NOT re-granted: it has no UPDATE policy on events, so its
-- grant was already inert.
-- ---------------------------------------------------------------------------
revoke update on public.events from anon, authenticated;
grant update (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, status, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at, organisation_id, published_at
) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- (3) MEDIUM-1 — the idempotency index enforced a narrower rule than every
-- comment and the plan claimed. Predicate included attestation_status, so the
-- stated invariant ("at most ONE credit per practitioner per event") did not
-- hold across tiers: a second credit_earned row with organiser_attested did not
-- conflict. Sprint 3b's organiser-attested issuance would have had no DB
-- backstop. Verified zero existing rows violate the widened form before applying.
-- ---------------------------------------------------------------------------
drop index if exists public.credit_ledger_attendance_uniq;
create unique index if not exists credit_ledger_attendance_uniq
  on public.credit_ledger (user_id, event_id)
  where entry_type = 'credit_earned';

-- ---------------------------------------------------------------------------
-- (4) LOW-3 — the freeze trigger function kept a service_role EXECUTE grant it
-- never needs (a trigger runs under the owner). Not exploitable — Postgres
-- raises 0A000 on any direct call to a trigger function — but it breaks the
-- "grant back only what's needed" convention.
-- ---------------------------------------------------------------------------
revoke all on function public.freeze_cpd_config_if_credited() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (5) HIGH-2 — 'attendance_verified' asserted venue-captured presence, but
-- nothing bound the credit to the event's lifecycle. self_check_in enforces no
-- time window and its predicate is only `status <> 'attended'` — and
-- 'cancelled' is a legal registrations.status. So a registrant who cancelled,
-- or who never attended, could POST their emailed code and mint a permanent
-- credit labelled venue-verified.
--
-- The guards live HERE, inside the issuance definer, NOT in the attendance
-- path: attendance stays authoritative and must never be blocked by a credit
-- rule (Runtime Contract invariant 1).
--
-- ponytail: the window is deliberately generous (start-24h .. end+24h) rather
-- than the app's real check-in window (start - CHECKIN_OPEN_MINUTES). The demo
-- fixture registers at Beat 3 and checks in at Beat 4 minutes later, ~170 min
-- BEFORE start_time — registration closes exactly when the check-in window
-- opens, so the two beats cannot both sit inside a strict window. A 24h bound
-- kills the real fraud (checking in from home days later) without breaking the
-- demo. Tighten to the check-in window when the fixture no longer needs both
-- beats in one sitting — tracked in docs/DEFERRED.md.
-- ---------------------------------------------------------------------------
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
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then return 'skipped:no_event'; end if;
  if v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0 then
    return 'skipped:not_cpd';
  end if;

  -- (5a) lifecycle window — see the ponytail note above.
  if now() < v_event.start_time - interval '24 hours'
     or now() > v_event.end_time + interval '24 hours' then
    return 'skipped:outside_window';
  end if;

  select email, status into v_email, v_status from public.registrations
    where event_id = p_event_id and registration_code = p_registration_code;
  if not found then return 'skipped:no_registration'; end if;

  -- (5b) a cancelled registration must never earn credit. self_check_in's
  -- predicate is `status <> 'attended'`, which 'cancelled' satisfies.
  if v_status = 'cancelled' then return 'skipped:cancelled'; end if;

  select id into v_user_id from auth.users
    where lower(email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then return 'skipped:no_user'; end if;

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

-- create or replace preserves the ACL, but re-assert it explicitly: this repo
-- has a schema-wide ALTER DEFAULT PRIVILEGES that re-grants EXECUTE to
-- anon/authenticated on every function at CREATE time, so a future DROP+CREATE
-- would silently re-widen this. (Review finding LOW-1.)
revoke all on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions (repo doctrine: prove grants live, never read them
-- from migration text — this class of hole has recurred four times).
-- ---------------------------------------------------------------------------
do $$
begin
  if has_column_privilege('authenticated','public.events','cpd_hours','UPDATE')
     or has_column_privilege('authenticated','public.events','accrediting_body_id','UPDATE') then
    raise exception 'HIGH-1 not closed: authenticated can still UPDATE the CPD config columns';
  end if;
  if not has_column_privilege('authenticated','public.events','title','UPDATE') then
    raise exception 'over-revoked: authenticated lost UPDATE on a non-CPD column (title)';
  end if;
  if has_function_privilege('anon','public.award_attendance_credit(uuid,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.award_attendance_credit(uuid,text,uuid)','EXECUTE') then
    raise exception 'award_attendance_credit is executable by an app role';
  end if;
  if not has_function_privilege('service_role','public.award_attendance_credit(uuid,text,uuid)','EXECUTE') then
    raise exception 'award_attendance_credit lost its service_role grant';
  end if;
end $$;

-- Rollback:
--   drop index if exists public.credit_ledger_attendance_uniq;
--   create unique index credit_ledger_attendance_uniq on public.credit_ledger (user_id, event_id)
--     where entry_type='credit_earned' and attestation_status='attendance_verified';
--   grant update on public.events to authenticated;  -- restores the pre-lock posture
--   alter table public.events drop constraint events_cpd_hours_check;
--   alter table public.events add constraint events_cpd_hours_check
--     check (cpd_hours is null or cpd_hours > 0);
--   (award_attendance_credit: re-apply 20260724170650's body to drop the new guards)
