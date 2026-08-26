-- Task 10.4 code half (A2 in the 2026-08-26 spec-review plan).
-- role_award_rule enforcement inside award_attendance_credit.
--
-- ADR-0002 R1 introduced per-body `role_award_rule` values
-- ('highest_only' / 'cumulative' / 'manual_selection') with "unresolved
-- ties fail closed" as an explicit posture. Migration
-- 20260820090000_seed_hkcp_mchk_role_mappings writes the field for HKCP
-- and MCHK. Grepped the entire repo before writing this: outside that
-- seed and its own rollback comment, `role_award_rule` was read NOWHERE
-- (`grep -rn role_award_rule supabase/migrations/ lib/ app/ tests/`
-- returned exactly the seed's three lines). Field present, enforcement
-- absent. This migration closes that gap.
--
-- WHY BEFORE THE §5 SEED PACK (brief §4 ordering rule): a sourced pack
-- can safely publish more nuanced mappings once the ambiguity gate exists.
-- Without this migration, a body that publishes chair→CAT_A + attendee→
-- CAT_B and adds two matching groups would produce two silent credit
-- posts for a two-role registration (or one plus an 'already', see the
-- ledger-index note below) — either way, R1 R1's own "must not assume
-- presenter outranks chair, or that the numerically larger credit value
-- wins" violated silently, at the write layer.
--
-- SHAPE OF THE ENFORCEMENT
--
-- A per-body pre-pass runs BEFORE the existing per-group main loop, so a
-- fail-closed raise leaves no partial ledger writes (a per-group
-- record_credit_entry inside the loop would already be committing rows
-- before an ambiguity was noticed).
--
-- For each distinct body on the event:
--   1. If the practitioner has no verified licence at that body → skip
--      (main loop will emit skipped:no_licence per group).
--   2. Count "satisfied" groups: category_code IS NULL (the compat-bridge
--      case — the ONLY shape on real Seoul data today) OR category_code
--      matches at least one of the practitioner's roles via
--      category_taxonomy → 'role_mappings' → <role_code>.
--   3. 0 or 1 satisfied → skip (identical to today's behaviour — no
--      shipped test breaks). This is the assertion-1 branch.
--   4. >1 satisfied → read role_award_rule and enforce.
--
-- RULE VALUES, ALL FAIL-CLOSED THIS WEEK
--
--   'highest_only' → raises `role_award_ambiguous`.
--       R1 requires the taxonomy to publish its own priority. No
--       priority shape is published in category_taxonomy in this repo
--       today; inventing one is ADR-0003 territory (spec-review Phase B,
--       Ivan-owned outline), forbidden by the brief §4 boundaries.
--
--   'cumulative' → raises `role_award_cumulative_needs_ledger_widening`.
--       ADR-0002 R1 explicitly permits cumulative multi-post per body.
--       The shipped `credit_ledger_attendance_uniq` index is unique on
--       (user_id, event_id, body_id) WHERE entry_type = 'credit_earned'
--       (verified via pg_indexes, not read off a migration). Two
--       credit_earned rows for one body would fail with 23505 and be
--       silently caught by the loop's `exception when unique_violation
--       then outcome := 'already'` block — turning cumulative into
--       first-satisfied-group-wins by iteration order (the loop has no
--       ORDER BY). Widening the index to include category is a change
--       to credit_ledger's write-integrity surface, explicitly out of
--       scope for this dispatch (brief §4: "no changes to credit_ledger's
--       schema, hash envelope, or grants"). Fail closed with a specific
--       message pointing at the dependency, rather than silently
--       deduplicating.
--
--   'manual_selection' → raises `role_award_requires_manual_selection`.
--       No UI exists this week to surface the choice.
--
--   NULL / unknown → raises `role_award_rule_missing`.
--       ADR-0002: "Unresolved ties fail closed."
--
-- CUSTOM SQLSTATE
--
-- The brief specified SQLSTATE 'PT002'. **This does not work through
-- PostgREST** (discovered by direct HTTP probe with curl before this
-- migration was reworked, not inferred): PostgREST maps `PT<NNN>`
-- SQLSTATEs to HTTP status <NNN>, so PT002 returns "HTTP 002" — an
-- invalid response line that Node/undici's fetch rejects with a bare
-- `TypeError: fetch failed`, never reaching the Supabase JS client's
-- error path. Verified in both places: psql shows the raise fires with
-- the correct message; curl over PostgREST shows `HTTP 002` and
-- fetch-level failure.
--
-- Corrected to SQLSTATE 'PT422' — HTTP 422 (Unprocessable Entity),
-- semantically apt for "the request is syntactically valid but the
-- server refuses to process it as configured". PT422 is the same
-- application-namespace approach the brief intended (class 'PT' avoids
-- clashing with PostgreSQL-reserved classes), just with a well-formed
-- HTTP status suffix. Message strings remain the semantic disambiguator
-- across the four fail-closed cases — a caller assert should match on
-- message, not on errcode alone.
--
-- The repo precedent uses standard PG codes (42501 / P0002 / 22023 /
-- 23505) with `using errcode = '...'`; introducing a namespaced code
-- here lets a caller distinguish "engine refused ambiguous
-- configuration" from a generic constraint violation.
--
-- LIVE FUNCTION DEFINITION WAS READ VIA pg_get_functiondef BEFORE
-- WRITING THIS (per the Hard Rule mirrored in CLAUDE.md §2). Note that
-- 20260816080000 refactored the per-group loop body into
-- public.compute_accreditation_credit(...): the main loop now delegates
-- role-check + award computation to that helper and only handles the
-- record_credit_entry post. This migration inserts the pre-pass between
-- role-code resolution and the main loop and preserves every other line
-- byte-for-byte.
--
-- NO SCHEMA CHANGES: no columns, no indexes, no grants. The function
-- signature, return shape, and ACL are unchanged; CREATE OR REPLACE
-- preserves the existing service_role EXECUTE grant (verified by the
-- structural self-check below).

create or replace function public.award_attendance_credit(
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
  -- Concrete rowtype, not `record`: passing `grp` to compute_accreditation_
  -- credit's typed public.event_accreditation_groups parameter needs it —
  -- a generic `record` cannot be implicitly cast to a concrete composite
  -- type even when its runtime shape matches exactly (42846, caught by the
  -- existing RLS test suite, not by this migration's own self-check).
  grp               public.event_accreditation_groups%rowtype;
  v_computed        record;
  v_points          numeric;
  v_hours           numeric;
  -- Pre-pass (this migration's addition).
  v_body            uuid;
  v_taxonomy        jsonb;
  v_satisfied       integer;
  v_rule            text;
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

  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    raise warning 'award_attendance_credit: actor % has no public.users row; issuing credit unattributed', v_actor;
    v_actor := null;
  end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  select array_agg(rr.role_code) into v_role_codes
  from public.registration_roles rr where rr.registration_id = v_reg_id;
  if v_role_codes is null or array_length(v_role_codes, 1) is null then
    v_role_codes := array['attendee'];
  end if;

  -- Per-body role_award_rule pre-pass. Fails closed on ambiguity BEFORE the
  -- main loop begins any ledger writes.
  for v_body in
    select distinct eag.body_id from public.event_accreditation_groups eag
    where eag.event_id = p_event_id
  loop
    if not exists (
      select 1 from public.practitioner_licences pl
      where pl.user_id = v_user_id and pl.body_id = v_body and pl.status = 'verified'
    ) then
      continue;
    end if;

    select ab.category_taxonomy into v_taxonomy
      from public.accrediting_bodies ab where ab.id = v_body;

    select count(*) into v_satisfied
    from public.event_accreditation_groups eag
    where eag.event_id = p_event_id
      and eag.body_id = v_body
      and (
        eag.category_code is null
        or exists (
          select 1 from unnest(v_role_codes) as r(code)
          where v_taxonomy #>> array['role_mappings', r.code] = eag.category_code
        )
      );

    if v_satisfied <= 1 then
      continue;
    end if;

    v_rule := v_taxonomy ->> 'role_award_rule';
    if v_rule = 'highest_only' then
      raise exception 'role_award_ambiguous'
        using errcode = 'PT422',
              detail = format('body %s has %s satisfied groups but no published priority', v_body, v_satisfied);
    elsif v_rule = 'cumulative' then
      raise exception 'role_award_cumulative_needs_ledger_widening'
        using errcode = 'PT422',
              detail = format('body %s has %s satisfied groups; credit_ledger_attendance_uniq is (user_id, event_id, body_id) — a second credit_earned row for one body would silently dedupe as ''already''', v_body, v_satisfied);
    elsif v_rule = 'manual_selection' then
      raise exception 'role_award_requires_manual_selection'
        using errcode = 'PT422',
              detail = format('body %s has %s satisfied groups but no manual-selection UI ships this week', v_body, v_satisfied);
    else
      raise exception 'role_award_rule_missing'
        using errcode = 'PT422',
              detail = format('body %s has %s satisfied groups; no role_award_rule published on this body', v_body, v_satisfied);
    end if;
  end loop;

  for grp in
    select * from public.event_accreditation_groups eag where eag.event_id = p_event_id
  loop
    select * into v_computed
      from public.compute_accreditation_credit(v_reg_id, v_user_id, v_role_codes, grp);

    if v_computed.outcome <> 'computed' then
      body_id := grp.body_id; outcome := v_computed.outcome; return next;
      continue;
    end if;

    v_points := null; v_hours := null;
    if v_computed.unit = 'points' then
      v_points := v_computed.credit;
    else
      v_hours := v_computed.credit;
    end if;

    begin
      perform public.record_credit_entry(
        v_computed.licence_id, v_user_id, p_event_id, grp.body_id,
        'credit_earned', v_points, v_hours, v_computed.category,
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

-- Self-verifying assertions. Structural only — behaviour assertions run in
-- vitest (`tests/cpd/attendance_issuance.rls.test.ts`), where the real
-- fixture harness lives. Migration self-checks that insert credit_ledger
-- rows to prove behaviour would leave permanent residue on any target
-- database that commits the migration (append-only, HR11) — vitest scopes
-- that residue via `RLS_TESTS=1` gating and dedicated fixture bodies.
do $$
declare
  v_def text;
begin
  if has_function_privilege('anon', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: anon must not be executable';
  end if;
  if has_function_privilege('authenticated', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: authenticated must not be executable';
  end if;
  if not has_function_privilege('service_role', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: service_role lost EXECUTE — the app path would break';
  end if;

  -- Structural: the four raise messages are present in the compiled body.
  -- If a future edit removes one, this self-check catches it at migration
  -- time rather than at the first real ambiguous configuration.
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'award_attendance_credit';
  if v_def not like '%role_award_ambiguous%' then
    raise exception 'award_attendance_credit: role_award_ambiguous raise missing from function body';
  end if;
  if v_def not like '%role_award_cumulative_needs_ledger_widening%' then
    raise exception 'award_attendance_credit: role_award_cumulative_needs_ledger_widening raise missing from function body';
  end if;
  if v_def not like '%role_award_requires_manual_selection%' then
    raise exception 'award_attendance_credit: role_award_requires_manual_selection raise missing from function body';
  end if;
  if v_def not like '%role_award_rule_missing%' then
    raise exception 'award_attendance_credit: role_award_rule_missing raise missing from function body';
  end if;
  if v_def not like '%role_award_rule%' then
    raise exception 'award_attendance_credit: role_award_rule taxonomy read missing';
  end if;

  raise notice 'role_award_rule_enforcement self-check: all assertions passed';
end $$;

-- Rollback:
--   Restore the pre-A2 award_attendance_credit body from 20260816080000's
--   "2. award_attendance_credit — pure extraction" block (verified against
--   pg_get_functiondef before this migration was written), i.e. drop the
--   pre-pass and its four v_* declarations. Function signature, return
--   shape, and grants are all unchanged by this migration, so no other
--   objects need touching.
