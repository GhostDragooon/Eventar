-- 2026-08-04 — DEFERRED item 57: self_check_in gets its own lifecycle guards.
--
-- THE HOLE. self_check_in()'s only predicate was `status <> 'attended'`.
-- Verified live before this migration, every case returning 'ok':
--
--   · check-in 3 hours BEFORE the check-in window opens        -> ok
--   · check-in AFTER the event ended                           -> ok
--   · check-in on a DRAFT event                                -> ok
--   · check-in on a CANCELLED event                            -> ok
--   · check-in with checkin_modes.self_serve = false           -> ok
--   · check-in on a CANCELLED registration (flipped to attended) -> ok
--
-- Attendance — the fact the whole CPD ledger is built on — was minted by mere
-- possession of an emailed code, at any time, on any event, in any state.
--
-- award_attendance_credit()'s ±24h window was compensating for all of this at
-- one remove: it refused to ISSUE CREDIT outside a generous bound, but the
-- attendance row itself was already written. The 2026-07-25 review called that
-- out (HIGH-2) and could not tighten the bound, because the demo fixture
-- registers and checks in ~170 min before start. Fixing the guard at source is
-- what unblocks it; the ±24h stays as defence in depth, and still matters
-- because mark_attended() (staff scan, a trusted physically-present actor) is
-- deliberately NOT given a time window here.
--
-- WHY THE UI WAS NOT ENOUGH. The pass page already hides the "Confirm I'm
-- here" button when self_serve is off (app/(public)/checkin/confirm/page.tsx).
-- The Server Action behind it takes the registration code and nothing else, so
-- a direct POST bypassed the only thing enforcing that setting. UI-as-gate is
-- exactly the shape this repo's block architecture forbids: business rules
-- live behind definer functions, never in the surface.
--
-- RESULT CODES, not a bare boolean. An attendee standing at a door needs the
-- real reason: 'not_open' and 'self_serve_off' lead to completely different
-- actions (wait vs see reception). Returning one generic refusal is the same
-- defect class as the door UI advertising a 4-character code when codes are 6
-- — wrong information at the one moment that has to be frictionless.
-- app/(public)/checkin/confirm/actions.ts maps each to its own copy.
--
-- ORDER OF CHECKS is deliberate:
--   rate limit (unchanged, before any slow work) → 'already' (a checked-in
--   attendee is told they are in, even if the event has since ended) →
--   registration-level ('cancelled', about YOU) → event-level ('unavailable',
--   'self_serve_off', 'not_open').
--
-- THE 60 IS DUPLICATED. CHECKIN_OPEN_MINUTES lives in
-- lib/lifecycle/eventLifecycle.ts and drives the reminder dispatcher and the
-- lifecycle badge; Postgres cannot import it. Changing one without the other
-- makes the QR arrive before check-in opens (or the badge say "live" while the
-- door refuses). Grep for CHECKIN_OPEN_MINUTES when touching either.
-- ponytail: duplicated constant, promote to a settings row only if a second
-- caller needs it DB-side.

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

  -- Before any lifecycle refusal: someone already checked in is told they are
  -- in, even if the event has since ended. Their state is not in question.
  if v_status = 'attended' then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  -- Registration-level. The old predicate (`status <> 'attended'`) let a
  -- cancelled registration be flipped straight to attended.
  if v_status = 'cancelled' then
    result := 'cancelled'; event_id := v_event_id; return next; return;
  end if;

  select * into v_ev from public.events e where e.id = v_event_id;

  -- Event-level. A soft-deleted event is treated exactly as an unpublished
  -- one: every other surface (/events, /checkin, /analytics, the dispatcher)
  -- filters deleted_at, and a check-in is not the place to make an exception.
  if v_ev.status is distinct from 'published' or v_ev.deleted_at is not null then
    result := 'unavailable'; event_id := v_event_id; return next; return;
  end if;

  -- `is not true` rather than `= false`: a malformed or absent key yields SQL
  -- NULL, which must read as OFF.
  -- CORRECTION (2026-08-04 review): an earlier version of this comment claimed
  -- rows predating events_checkin_modes_shape (20260803023000) are not
  -- retro-validated. That is wrong — the constraint is convalidated = t and no
  -- row violates it. The null-safe read is still correct defensive style, but
  -- it is not load-bearing for legacy rows, because there are none.
  if (v_ev.checkin_modes->>'self_serve')::boolean is not true then
    result := 'self_serve_off'; event_id := v_event_id; return next; return;
  end if;

  -- The event's own check-in window: opens CHECKIN_OPEN_MINUTES before start
  -- (when the reminder email carrying this QR goes out), closes at end_time.
  -- Same boundary computeLifecycle() calls 'live'.
  if now() < v_ev.start_time - interval '60 minutes' or now() > v_ev.end_time then
    result := 'not_open'; event_id := v_event_id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = 'qr'
   where id = v_reg_id and status = 'registered';
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
$function$;

-- CREATE OR REPLACE preserves the ACL; re-asserted so the posture is readable
-- here rather than five migrations back. self_check_in is deliberately
-- anon-open (20260716233440 re-asserted this by design): the registration code
-- IS the bearer token, and check-in happens before any account exists.
grant execute on function public.self_check_in(text, text) to anon, authenticated, service_role;

do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'self_check_in';

  if src not like '%self_serve_off%' or src not like '%not_open%'
     or src not like '%unavailable%' or src not like '%cancelled%' then
    raise exception 'self_check_in is missing a lifecycle guard';
  end if;
  -- Assert the NEW predicate positively. A negative grep for the old
  -- `status <> 'attended'` matches this file's own comment describing it —
  -- pg_get_functiondef returns comments too, so absence-of-string assertions
  -- on a well-commented function are unreliable by construction.
  if src not like '%and status = ''registered''%' then
    raise exception 'self_check_in does not restrict its UPDATE to registered rows — a cancelled registration could still be checked in';
  end if;
  if not has_function_privilege('anon','public.self_check_in(text,text)','EXECUTE') then
    raise exception 'self_check_in lost its anon grant — the door would stop working';
  end if;
end $$;

-- Rollback: re-apply 20260708104826 (restores the unguarded function, and with
-- it the ability to check in on a cancelled registration at any time).
