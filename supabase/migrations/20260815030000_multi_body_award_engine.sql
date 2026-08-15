-- Task 10.8/10.9, sub-task C4 of 5 — the multi-body award engine.
-- award_attendance_credit() no longer reads events.accrediting_body_id /
-- events.cpd_hours (the legacy scalar pair). It now iterates this event's
-- event_accreditation_groups (C3, 20260815020000) and posts ZERO, ONE, or
-- SEVERAL credit_ledger rows — one per group whose body both accredits the
-- event AND where the practitioner holds a verified licence. The iteration
-- is over the EVENT's accreditations, never over the practitioner's
-- licences (ADR-0002 "The attribution model", point 1).
-- record_credit_entry() is UNCHANGED — not touched by this migration.
-- Design authority: docs/adr/0002-multi-body-accreditation.md
-- "The attribution model" + "Award selection" + "R1, resolved" sections.
--
-- RETURN SHAPE CHANGE. Was `returns text` (one string). Now
-- `returns table(body_id uuid, outcome text)` — a set, zero-to-N rows, one
-- per group evaluated. The zero-groups case (no body has ever accredited
-- this event) still returns exactly one row: (null::uuid, 'skipped:not_cpd')
-- — the direct descendant of the old scalar 'skipped:not_cpd', preserved so
-- a caller checking "was this event ever CPD-configured at all" still gets
-- a single unambiguous answer. Every other pre-loop guard (no_event,
-- outside_window, no_registration, cancelled, no_user) is likewise
-- single-outcome — they gate the WHOLE function before any group is ever
-- looked at, so there is nothing per-group to report yet.
--
-- WHAT RUNS ONCE, NOT PER GROUP (preserved from the single-body function,
-- unchanged in substance): event lookup, the +-24h window check, the
-- registration lookup + cancelled check, auth.users email resolution, the
-- actor-id degrade-to-unattributed logic. Duplicating any of these inside
-- the loop would mean 13 redundant auth.users scans for a 13-body event —
-- wasteful and pointless, since none of them vary per group.
--
-- WHAT RUNS PER GROUP, INDEPENDENTLY (a failure or skip in one group must
-- never affect another — ADR-0002 "Nothing is summed or averaged across
-- bodies at any point"):
--   1. Licence check — verified practitioner_licences row at group.body_id.
--      Not found => skipped:no_licence, next group (NOT a fatal return).
--   2. Role -> category resolution (ADR-0002 "R1, resolved"). Registration's
--      roles default to 'attendee' (ADR-0001's own stated default) when
--      registration_roles has no rows for this registration. If
--      group.category_code IS NULL (the compatibility-bridge/backfill
--      degenerate case — the ONLY path with real data on this database
--      today, since no seeded body has role-mapping data), the group
--      applies unconditionally. If group.category_code IS NOT NULL (the
--      real multi-body path — nothing seeds this yet, tested via a
--      synthetic fixture, see tests/cpd/attendance_issuance.rls.test.ts),
--      each role is mapped through the body's own category_taxonomy and
--      must match group.category_code for the group to apply.
--      PROVISIONAL, NOT YET VALIDATED AGAINST REAL DATA: the JSON path
--      chosen is `category_taxonomy->'role_mappings'->>role_code`. No
--      seeded body populates `role_mappings` today, so there is no existing
--      convention this could conflict with or confirm against — this is a
--      deliberate, documented guess, subject to revision the first time a
--      real body's rule pack needs role->category mapping (R1's own note:
--      "not yet decided, not yet built" for the mapping's storage detail).
--      No match across any role => skipped:no_role_match, next group.
--   3. Occurrence/attendance data — this registration's checked-in
--      occurrences (registration_checkins) vs. this group's accreditation
--      rows' linked occurrences (event_accreditation_occurrences, via
--      event_accreditations).
--   4. Award computation by group.award_scheme (never inferred — ADR-0002
--      "shall not be inferred from event duration, occurrence count or
--      accreditation row structure"):
--      - proportional: available = attendance_points summed over every
--        DISTINCT occurrence linked to any of this group's accreditation
--        row(s); earned = the same sum restricted to occurrences this
--        registration actually checked into. available = 0 =>
--        skipped:no_occurrences (never divide by zero — this also silently
--        covers the degenerate "group has zero accreditation rows" case,
--        since the join finds nothing and available comes back 0 before
--        credit_value is ever used). Otherwise
--        credit = credit_value * earned / earned, cast so the division is
--        NUMERIC, never truncated to integer (earned/available are summed
--        integer attendance_points, and plain `/` between two integers in
--        Postgres is integer division — earned is cast to numeric first).
--      - explicit_schedule: among the group's event_accreditations rows,
--        find every row whose FULL linked-occurrence-set is a subset of the
--        registration's attended-occurrence-set ("fully satisfied"), select
--        the one with the largest such set, and use ITS credit_value
--        directly — never summed with any other row in the group. Zero
--        fully-satisfied rows => skipped:no_matching_schedule. Two or more
--        rows tying for the largest satisfied set => skipped:ambiguous_schedule,
--        nothing posted for this group. C3's check_accreditation_tie
--        constraint trigger already forbids two event_accreditations rows
--        in one explicit_schedule group from having equal cardinality AT
--        ALL, unconditionally (not just when they would tie for a specific
--        attendance pattern) — so two fully-satisfied rows of equal size
--        should already be structurally unreachable via any normal write
--        path into this schema. This check exists anyway as a
--        belt-and-suspenders fail-closed guard at the layer that actually
--        matters (the ledger write, not the config write — this repo has
--        six recorded instances of a control placed one layer above where
--        the write happens), in case a future loosening of C3's guard
--        reopens the possibility. See the test file for whether this path
--        was actually exercised or only reasoned about.
--   5. Unit -> points/hours mapping. group.unit = 'points' => the computed
--      credit goes to p_points (p_hours stays null). 'hours' or null (the
--      compatibility-bridge default) => p_hours (p_points stays null) —
--      this exactly matches today's only-ever-hours behavior for the
--      compatibility path.
--   6. Post via record_credit_entry(), inside ITS OWN
--      begin...exception when unique_violation...end block — scoped per
--      group, so one group's idempotency collision cannot abort the loop
--      and skip evaluating the remaining groups.
--   7. (body_id, outcome) is appended to the result set for every group —
--      issued, already, or any skipped:* reason.

-- Return type changes (text -> table(uuid, text)), which Postgres refuses
-- under CREATE OR REPLACE ("cannot change return type of existing
-- function") — DROP first. This also means the function's ACL is NOT
-- preserved across this migration (unlike every sibling CREATE OR REPLACE
-- in this repo) — the explicit grant/revoke block right after CREATE below
-- is not belt-and-suspenders here, it is the ONLY thing that gives
-- service_role EXECUTE back. Confirmed via pg_default_acl before writing
-- this: functions created by the `postgres` role (the migrating role on
-- this project) get a default ACL of postgres-only, no implicit PUBLIC
-- grant and no anon/authenticated/service_role — so skipping the explicit
-- grant below would silently break the app's only caller.
drop function if exists public.award_attendance_credit(uuid, text, uuid);

create function public.award_attendance_credit(
  p_event_id uuid,
  p_registration_code text,
  p_actor_id uuid default null::uuid
)
returns table(body_id uuid, outcome text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event           public.events%rowtype;
  v_reg_id          uuid;
  v_email           text;
  v_status          text;
  v_user_id         uuid;
  v_eff             date;
  v_actor           uuid := p_actor_id;
  v_group_count     integer;
  v_role_codes      text[];
  grp               record;
  v_licence         public.practitioner_licences%rowtype;
  v_category        text;
  v_taxonomy        jsonb;
  v_role            text;
  v_mapped_category text;
  v_role_match      boolean;
  v_available       numeric;
  v_earned          numeric;
  v_credit          numeric;
  v_best_id         uuid;
  v_best_card       integer;
  v_best_credit     numeric;
  v_tie_count       integer;
  v_points          numeric;
  v_hours           numeric;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    body_id := null; outcome := 'skipped:no_event'; return next; return;
  end if;

  select count(*) into v_group_count
  from public.event_accreditation_groups eag
  where eag.event_id = p_event_id;

  if v_group_count = 0 then
    body_id := null; outcome := 'skipped:not_cpd'; return next; return;
  end if;

  if now() < v_event.start_time - interval '24 hours'
     or now() > v_event.end_time + interval '24 hours' then
    body_id := null; outcome := 'skipped:outside_window'; return next; return;
  end if;

  select r.id, r.email, r.status into v_reg_id, v_email, v_status
  from public.registrations r
  where r.event_id = p_event_id and r.registration_code = p_registration_code;
  if not found then
    body_id := null; outcome := 'skipped:no_registration'; return next; return;
  end if;

  if v_status = 'cancelled' then
    body_id := null; outcome := 'skipped:cancelled'; return next; return;
  end if;

  select u.id into v_user_id from auth.users u
    where lower(u.email) = lower(trim(v_email)) limit 1;
  if v_user_id is null then
    body_id := null; outcome := 'skipped:no_user'; return next; return;
  end if;

  -- attribution degrades, the credit does not (see the original header).
  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    raise warning 'award_attendance_credit: actor % has no public.users row; issuing credit unattributed', v_actor;
    v_actor := null;
  end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  -- Resolve this registration's roles ONCE — default 'attendee' when no
  -- registration_roles rows exist (ADR-0001: "Participation is captured per
  -- registration, defaulting to attendee").
  select array_agg(rr.role_code) into v_role_codes
  from public.registration_roles rr where rr.registration_id = v_reg_id;
  if v_role_codes is null or array_length(v_role_codes, 1) is null then
    v_role_codes := array['attendee'];
  end if;

  for grp in
    select * from public.event_accreditation_groups eag where eag.event_id = p_event_id
  loop
    -- 1. Licence check.
    select pl.* into v_licence from public.practitioner_licences pl
      where pl.user_id = v_user_id and pl.body_id = grp.body_id and pl.status = 'verified'
      order by pl.created_at desc limit 1;
    if not found then
      body_id := grp.body_id; outcome := 'skipped:no_licence'; return next;
      continue;
    end if;

    -- 2. Role -> category resolution.
    if grp.category_code is null then
      v_category := null;
    else
      v_role_match := false;
      select ab.category_taxonomy into v_taxonomy
        from public.accrediting_bodies ab where ab.id = grp.body_id;
      foreach v_role in array v_role_codes loop
        v_mapped_category := v_taxonomy #>> array['role_mappings', v_role];
        if v_mapped_category is not null and v_mapped_category = grp.category_code then
          v_role_match := true;
          exit;
        end if;
      end loop;
      if not v_role_match then
        body_id := grp.body_id; outcome := 'skipped:no_role_match'; return next;
        continue;
      end if;
      v_category := grp.category_code;
    end if;

    v_points := null;
    v_hours := null;

    -- 4. Award computation, by award_scheme (never inferred).
    if grp.award_scheme = 'proportional' then
      -- Assumes exactly one event_accreditations row per proportional group
      -- (ADR-0002's model, and the ONLY shape the compatibility bridge /
      -- backfill ever produce). If a future writer creates more than one,
      -- this takes the earliest-created row's credit_value; `available`
      -- below still unions every linked occurrence across ALL of the
      -- group's rows, so a proportional group with zero accreditation rows
      -- safely falls through to the available=0 guard rather than reading
      -- a null credit_value.
      select ea.credit_value into v_best_credit
        from public.event_accreditations ea
        where ea.accreditation_group_id = grp.id
        order by ea.created_at
        limit 1;

      select coalesce(sum(x.pts), 0) into v_available from (
        select distinct eo.id, eo.attendance_points as pts
        from public.event_accreditation_occurrences eao
        join public.event_accreditations ea on ea.id = eao.accreditation_id
        join public.event_occurrences eo on eo.id = eao.occurrence_id
        where ea.accreditation_group_id = grp.id
      ) x;

      if v_available = 0 then
        body_id := grp.body_id; outcome := 'skipped:no_occurrences'; return next;
        continue;
      end if;

      select coalesce(sum(x.pts), 0) into v_earned from (
        select distinct eo.id, eo.attendance_points as pts
        from public.event_accreditation_occurrences eao
        join public.event_accreditations ea on ea.id = eao.accreditation_id
        join public.event_occurrences eo on eo.id = eao.occurrence_id
        join public.registration_checkins rc
          on rc.occurrence_id = eo.id and rc.registration_id = v_reg_id
        where ea.accreditation_group_id = grp.id
      ) x;

      -- Numeric division: earned is cast explicitly so this is never
      -- integer-truncated (attendance_points are integer columns; plain
      -- integer `/` in Postgres truncates).
      v_credit := v_best_credit * v_earned::numeric / v_available;

    elsif grp.award_scheme = 'explicit_schedule' then
      v_best_id := null; v_best_card := null; v_best_credit := null;

      select ea.id, cnt.card, ea.credit_value
        into v_best_id, v_best_card, v_best_credit
      from public.event_accreditations ea
      join lateral (
        select count(*) as card
        from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
      ) cnt on true
      where ea.accreditation_group_id = grp.id
        and cnt.card > 0
        and not exists (
          select 1 from public.event_accreditation_occurrences eao
          where eao.accreditation_id = ea.id
            and eao.occurrence_id not in (
              select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = v_reg_id
            )
        )
      order by cnt.card desc
      limit 1;

      if v_best_id is null then
        body_id := grp.body_id; outcome := 'skipped:no_matching_schedule'; return next;
        continue;
      end if;

      -- Tie guard — see the migration header for why this is expected to
      -- be structurally unreachable given C3's check_accreditation_tie.
      select count(*) into v_tie_count
      from public.event_accreditations ea
      join lateral (
        select count(*) as card
        from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
      ) cnt on true
      where ea.accreditation_group_id = grp.id
        and cnt.card = v_best_card
        and not exists (
          select 1 from public.event_accreditation_occurrences eao
          where eao.accreditation_id = ea.id
            and eao.occurrence_id not in (
              select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = v_reg_id
            )
        );

      if v_tie_count > 1 then
        body_id := grp.body_id; outcome := 'skipped:ambiguous_schedule'; return next;
        continue;
      end if;

      v_credit := v_best_credit;
    else
      -- Structurally unreachable: event_accreditation_groups_award_scheme_check
      -- bounds the column to exactly these two values. Guards against a
      -- future third scheme being added to the CHECK without this function
      -- being updated to handle it — fails loudly rather than silently
      -- posting nothing.
      raise exception 'award_attendance_credit: unrecognised award_scheme % on group %', grp.award_scheme, grp.id;
    end if;

    -- 5. Unit -> points/hours mapping.
    if grp.unit = 'points' then
      v_points := v_credit;
    else
      v_hours := v_credit;
    end if;

    -- 6. Post, scoped per group — one group's unique_violation must not
    -- abort evaluation of the remaining groups.
    begin
      perform public.record_credit_entry(
        v_licence.id, v_user_id, p_event_id, grp.body_id,
        'credit_earned', v_points, v_hours, v_category,
        v_eff, 'attendance_verified', v_actor
      );
      body_id := grp.body_id; outcome := 'issued'; return next;
    exception when unique_violation then
      body_id := grp.body_id; outcome := 'already'; return next;
    end;
  end loop;

  return;
end;
$function$;

-- Explicit grant/revoke — see the header comment above the DROP: this
-- function's ACL was NOT carried forward from the old text-returning
-- version, so this block is load-bearing, not defensive. Same posture as
-- the single-body function it replaces: service_role only.
revoke all on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- credit_ledger_attendance_uniq widened: (user_id, event_id) -> (user_id,
-- event_id, body_id). Idempotency is now per-body, matching the new
-- per-group posting model — the OLD form would have made the second body's
-- 'issued' collide with the first body's row on (user_id, event_id) alone.
-- Pre-check per repo convention (verify zero existing rows would violate the
-- new form before creating it) — logically this can never find a violation
-- since the OLD index already guarantees at most ONE credit_earned row per
-- (user_id, event_id), which trivially satisfies the new, wider key too, but
-- the check is cheap and this repo's own convention is to verify rather than
-- assume.
-- ---------------------------------------------------------------------------
do $$
declare
  v_violations integer;
begin
  select count(*) into v_violations from (
    select user_id, event_id, body_id
    from public.credit_ledger
    where entry_type = 'credit_earned'
    group by user_id, event_id, body_id
    having count(*) > 1
  ) dupes;
  if v_violations > 0 then
    raise exception 'credit_ledger_attendance_uniq widen: % (user_id, event_id, body_id) group(s) already have duplicate credit_earned rows', v_violations;
  end if;
end $$;

drop index if exists public.credit_ledger_attendance_uniq;
create unique index credit_ledger_attendance_uniq
  on public.credit_ledger (user_id, event_id, body_id)
  where entry_type = 'credit_earned';

-- ---------------------------------------------------------------------------
-- CORRECTION TO C3 (20260815020000), found empirically while building this
-- migration's own test fixtures — not part of the original C4 task brief,
-- added because without it the ADR's own flagship worked example cannot be
-- constructed in this schema at all.
--
-- check_accreditation_tie() (C3) rejects two event_accreditations rows in
-- one explicit_schedule group whenever they have the SAME CARDINALITY,
-- regardless of which specific occurrences they cover. Reproduced live
-- (see this migration's report): inserting ADR-0002's own worked example —
-- HK College of Pathologists, Day 1 -> 5, Day 2 -> 6, Both Days -> 11 — is
-- REJECTED by that trigger, because the Day-1-only row and the Day-2-only
-- row both have cardinality 1, even though they cover entirely different,
-- non-overlapping occurrences and are never actually ambiguous with each
-- other: Day-1-only is satisfied only by attendance patterns containing
-- Day 1, Day-2-only only by patterns containing Day 2, and a pattern
-- containing BOTH is instead won by the strictly-larger Both-Days row under
-- C4's own "largest satisfied row wins" rule (award_attendance_credit,
-- above) — so neither singleton row can ever be the one C4 actually
-- selects in a genuine three-way tie. C3's own migration comment already
-- named this trade-off as deliberate ("also rejecting some theoretically-
-- fine configurations... no known body requires it today") — that
-- assumption did not survive contact with the ADR's own example.
--
-- Fix: ambiguity is redefined as two rows covering the IDENTICAL occurrence
-- SET (a genuine data-entry duplicate — nothing could ever distinguish
-- which applies), not merely the same cardinality. This still rejects a
-- true duplicate-scope row pair. It no longer rejects same-size,
-- different-content rows like Day-1-only vs. Day-2-only. The genuinely
-- harder case C3's own comment cited as its reason for existing — two
-- DIFFERENT "any 2 of 3 days" rows that could both be satisfied, and tied,
-- by a specific attendance pattern with no covering row published — is
-- real and is NOT caught by this narrower config-time check; it is caught
-- by C4's own ledger-write-time `ambiguous_schedule` branch instead
-- (above), which is exactly the "control at the layer where the write
-- happens, not one layer above it" backstop this repo's own doctrine
-- requires (see that branch's comment) and exactly what the original task
-- brief anticipated when it said this repo's belt-and-suspenders guard
-- "must exist in case a future loosening of C3's check reopens the
-- possibility" — that loosening is this correction.
create or replace function public.check_accreditation_tie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id    uuid;
  v_scheme      text;
  v_conflict_id uuid;
begin
  select ag.id, ag.award_scheme into v_group_id, v_scheme
  from public.event_accreditations ea
  join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
  where ea.id = new.accreditation_id;

  if v_scheme is distinct from 'explicit_schedule' then
    return new;
  end if;

  select ea2.id into v_conflict_id
  from public.event_accreditations ea2
  where ea2.accreditation_group_id = v_group_id
    and ea2.id <> new.accreditation_id
    -- Set equality via double EXCEPT: no occurrence in one row's set is
    -- missing from the other's, in either direction.
    and not exists (
      select occurrence_id from public.event_accreditation_occurrences where accreditation_id = new.accreditation_id
      except
      select occurrence_id from public.event_accreditation_occurrences where accreditation_id = ea2.id
    )
    and not exists (
      select occurrence_id from public.event_accreditation_occurrences where accreditation_id = ea2.id
      except
      select occurrence_id from public.event_accreditation_occurrences where accreditation_id = new.accreditation_id
    )
  limit 1;

  if v_conflict_id is not null then
    raise exception 'event_accreditation_occurrences: accreditation % and % in group % link the IDENTICAL occurrence set — ambiguous award selection under explicit_schedule (ADR-0002 "Award selection")',
      new.accreditation_id, v_conflict_id, v_group_id
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_body_id  uuid;
  v_event_id uuid;
  v_staff_id uuid;
  v_start    timestamptz;
  v_occ1     uuid;
  v_occ2     uuid;
  v_g        uuid;
  v_day1     uuid;
  v_day2     uuid;
  v_dup      uuid;
  v_rejected boolean;
begin
  -- 1. Return shape is now a set of (body_id, outcome), not a bare text.
  if (select pg_get_function_result(oid) from pg_proc where proname = 'award_attendance_credit')
     is distinct from 'TABLE(body_id uuid, outcome text)' then
    raise exception 'award_attendance_credit: return shape is not TABLE(body_id uuid, outcome text)';
  end if;

  -- 2. Grant posture unchanged: service_role only (same as the single-body
  -- function this replaces) — CREATE OR REPLACE preserves ACLs, this just
  -- confirms it actually held.
  if has_function_privilege('anon', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: anon must not be executable';
  end if;
  if has_function_privilege('authenticated', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: authenticated must not be executable';
  end if;
  if not has_function_privilege('service_role', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: service_role lost EXECUTE — the app path would break';
  end if;

  -- 3. record_credit_entry untouched by this migration (no CREATE OR REPLACE
  -- for it here) — confirm its signature is exactly what this function
  -- calls into, so a drifted assumption fails loudly at migration time
  -- rather than at the first real multi-body check-in.
  if not exists (
    select 1 from pg_proc
    where proname = 'record_credit_entry'
      and pg_get_function_arguments(oid) like 'p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid, p_entry_type text, p_points numeric, p_hours numeric, p_category text, p_effective_date date, p_attestation_status text%'
  ) then
    raise exception 'award_attendance_credit: record_credit_entry signature drifted from what this migration assumes';
  end if;

  -- 4. credit_ledger_attendance_uniq is now 3-column and still partial on
  -- entry_type = 'credit_earned'.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'credit_ledger' and indexname = 'credit_ledger_attendance_uniq'
      and indexdef like '%(user_id, event_id, body_id)%'
      and indexdef like '%credit_earned%'
  ) then
    raise exception 'credit_ledger_attendance_uniq: widened index missing or malformed';
  end if;

  -- 5. The corrected tie-guard: ADR-0002's own worked example (two
  -- different-content, equal-cardinality day rows plus a covering
  -- both-days row) must now be constructible; a genuine identical-set
  -- duplicate must still be rejected.
  select id into v_staff_id from public.staff where status = 'active' limit 1;
  if v_staff_id is null then
    raise notice 'tie-guard correction self-check skipped: no active staff row on this database yet';
  else
    insert into public.accrediting_bodies (organisation_id, short_name, full_name, status, cycle_config, category_taxonomy)
    values ('00000000-0000-0000-0000-000000000001', 'MIG-TIE-FIX-CHECK', 'Migration self-check body (multi_body_award_engine tie fix)', 'active', '{}', '{}')
    returning id into v_body_id;

    v_start := now();
    insert into public.events (
      title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude, status
    ) values (
      'Migration self-check tie-fix event — DELETE ME', v_start, v_start + interval '1 hour', 'Asia/Hong_Kong',
      v_staff_id, 'Test Venue', 'Hong Kong', 'HK', 22.3, 114.2, 'draft'
    ) returning id into v_event_id;

    select id into v_occ1 from public.event_occurrences where event_id = v_event_id and ordinal = 1;
    insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
    values (v_event_id, 2, 'day', v_start + interval '1 day', v_start + interval '1 day 1 hour')
    returning id into v_occ2;

    insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
    values (v_event_id, v_body_id, null, 'points', 'explicit_schedule')
    returning id into v_g;

    -- Day-1-only (card 1) and Day-2-only (card 1, different content) must
    -- now coexist — this is exactly ADR-0002's Pathologists shape and was
    -- rejected before this fix.
    insert into public.event_accreditations (accreditation_group_id, credit_value) values (v_g, 5) returning id into v_day1;
    insert into public.event_accreditations (accreditation_group_id, credit_value) values (v_g, 6) returning id into v_day2;
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_day1, v_occ1);
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_day2, v_occ2);
    set constraints event_accreditation_occurrences_check_tie immediate;

    -- A genuine duplicate — a THIRD row covering the exact same single
    -- occurrence as Day-1-only — must still be rejected.
    v_rejected := false;
    begin
      insert into public.event_accreditations (accreditation_group_id, credit_value) values (v_g, 99) returning id into v_dup;
      insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_dup, v_occ1);
      set constraints event_accreditation_occurrences_check_tie immediate;
    exception when sqlstate '22023' then
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception 'check_accreditation_tie correction: a genuine identical-occurrence-set duplicate was NOT rejected';
    end if;

    delete from public.event_accreditation_groups where event_id = v_event_id;
    delete from public.events where id = v_event_id;
    delete from public.accrediting_bodies where id = v_body_id;
  end if;

  raise notice 'multi_body_award_engine self-check: all assertions passed';
end $$;

-- Rollback:
--   drop index credit_ledger_attendance_uniq;
--   create unique index credit_ledger_attendance_uniq on public.credit_ledger (user_id, event_id) where entry_type = 'credit_earned';
--   create or replace function public.award_attendance_credit(p_event_id uuid, p_registration_code text, p_actor_id uuid default null::uuid)
--     returns text ... (restore the single-body body from 20260725073250 / the pre-C4 version, reading events.accrediting_body_id/cpd_hours directly)
