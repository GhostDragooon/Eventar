-- Closes the narrow half of doctrine.md's M4/R5 open fork (Decisions Log
-- Q38, 2026-08-15): multi-body eager-posting (ADR-0002, D-A, shipped
-- 20260815030000) can post up to ~13 immutable credit_ledger rows per
-- attendee per event, computed from PROVISIONAL (unconfirmed) per-body rule
-- packs. That is only safe if a wrong provisional row is findable-by-hash
-- and correctable, which requires a reachable `body_confirmed` attestation
-- tier. credit_ledger.attestation_status has allowed 'body_confirmed' since
-- its very first migration (20260709250000) — nothing has ever produced a
-- row at that tier. This migration adds the one function that does.
--
-- EXPLICITLY OUT OF SCOPE (Ivan, 2026-08-15 — do not read this migration as
-- having built any of these; each is its own future decision):
--   * The fuller Sprint-3b "Body reviewer accreditation workflow"
--     (submission -> approval BEFORE an event is even accredited) —
--     separate, still fully Stage-13-gated piece (docs/plans/2026-07-09-
--     cpd-sprint-3b-design.md Task 1).
--   * Any UI or reviewer queue. A body_admin must already know the target
--     credit_ledger.id to call this function.
--   * Per-attendee confirmation granularity questions.
--   * Tightening body_admin's authorization from "owns the body's
--     organisation" to "owns this specific body" — matches the existing,
--     already-shipped credit_ledger_body_admin_read policy's own looser
--     scoping (20260709250000), not a new gap introduced here.
--   * Any check for whether the original row already has a credit_adjusted/
--     credit_revoked compensating entry against it. The ledger stays fully
--     reconstructable either way; whether confirmation should be blocked in
--     that case is a real policy question, not decided here.
--
-- Design authority: docs/doctrine.md "Multi-body eager-posting..." (M4/R5),
-- docs/adr/0002-multi-body-accreditation.md, vault Decisions Log Q38.

-- ---------------------------------------------------------------------------
-- 1. Widen entry_type to add 'credit_confirmed'. Required, not cosmetic:
-- credit_ledger_attendance_uniq is `unique (user_id, event_id, body_id)
-- where entry_type = 'credit_earned'` (20260815030000) — a confirmation row
-- necessarily shares those three columns with the original it confirms, so
-- posting it as a second entry_type='credit_earned' row would collide on
-- that very index. Reusing 'credit_adjusted' was considered and rejected:
-- that entry_type means a VALUE correction to a reader of the ledger, not a
-- sign-off, and conflating the two defeats the exact distinction this
-- migration exists to create. Pure widen (superset of the old CHECK) — can
-- never invalidate an existing row, no pre-check DO block needed.
alter table public.credit_ledger drop constraint credit_ledger_entry_type_check;
alter table public.credit_ledger add constraint credit_ledger_entry_type_check
  check (entry_type in (
    'credit_earned', 'credit_adjusted', 'credit_transferred',
    'credit_expired', 'credit_revoked', 'credit_confirmed'
  ));

-- attestation_status needs NO change — 'body_confirmed' has been
-- CHECK-allowed since 20260709250000; 20260724164730 only ever ADDED
-- 'attendance_verified' alongside it, never removed it.

-- Hash-shape impact: none. The hash preimage (20260709260000, a fixed
-- 18-key jsonb_build_object) already includes entry_type as a hashed
-- column; a new CHECK-allowed VALUE in an already-hashed column changes
-- nothing about the preimage shape or any existing row's hash.

-- ---------------------------------------------------------------------------
-- 2. Structural idempotency: a partial unique index, not just an in-function
-- check. This repo has six recorded prior instances of relying on "a
-- control one layer above where the write happens" instead of a structural
-- constraint (CLAUDE.md rule 14's own history; most recently the
-- 20260815030000 tie-guard fix). A soft pre-check has a real TOCTOU race:
-- two body_admin staff at the same org confirming the same row
-- near-simultaneously could both pass a `select`-then-`insert` check and
-- both insert. This index is what actually closes it; the function below
-- catches its unique_violation rather than duplicating the check.
create unique index credit_ledger_confirm_uniq
  on public.credit_ledger (references_entry_id)
  where entry_type = 'credit_confirmed';

-- ---------------------------------------------------------------------------
-- 3. confirm_credit_entry: staff-actor (body_admin/eventar_staff), org-match
-- gate — same authorization shape as verify_licence/credit_ledger_body_admin_read.
-- Inserts a NEW row referencing the original; never an UPDATE (credit_ledger
-- has UPDATE revoked from every role including service_role, Hard Rule 11 —
-- "corrections are new entries"). No p_points/p_hours parameters BY DESIGN:
-- points/hours/category/effective_date are copied byte-identical from the
-- original. A caller confirming a DIFFERENT amount than was actually earned
-- is definitionally the (out-of-scope) credit_adjusted path, not this one —
-- accepting those as parameters would blur the confirm/adjust boundary this
-- migration exists to keep sharp. No write_audit_event call: the ledger
-- insert IS its own hash chain (unlike practitioner_licences mutations,
-- which write both).
create or replace function public.confirm_credit_entry(
  p_entry_id uuid,
  p_reason   text default null
) returns public.credit_ledger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff    public.staff%rowtype;
  v_original public.credit_ledger%rowtype;
  v_body_org uuid;
  v_row      public.credit_ledger;
begin
  v_staff := app_private.require_active_staff('body_admin', 'eventar_staff');

  select * into v_original from public.credit_ledger where id = p_entry_id;
  if not found then
    raise exception 'confirm_credit_entry: entry % not found', p_entry_id using errcode = 'P0002';
  end if;

  -- Org-match BEFORE the entry_type check, same ordering discipline as
  -- verify_licence: a staff member outside the owning organisation learns
  -- only "not found or not yours" (42501), never a detail about an entry
  -- they have no standing to see.
  select ab.organisation_id into v_body_org
  from public.accrediting_bodies ab where ab.id = v_original.body_id;

  -- Explicit NULL guard, matching verify_licence's own template exactly:
  -- `x <> NULL` evaluates to NULL, and `IF NULL THEN` is false, so without
  -- this the 42501 below would silently not fire if v_body_org were ever
  -- NULL. Currently unreachable (credit_ledger.body_id is NOT NULL with a
  -- NO ACTION FK to accrediting_bodies, whose organisation_id is itself NOT
  -- NULL) — kept as defense-in-depth and for consistency with the sibling
  -- functions this one's shape is copied from, not because a live path
  -- reaches it today.
  if v_body_org is null then
    raise exception 'confirm_credit_entry: entry % not found', p_entry_id using errcode = 'P0002';
  end if;

  if v_staff.organisation_id <> v_body_org then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_original.entry_type <> 'credit_earned' then
    raise exception 'confirm_credit_entry: entry % is not a credit_earned row (entry_type=%)',
      p_entry_id, v_original.entry_type using errcode = 'P0002';
  end if;

  begin
    v_row := public.record_credit_entry(
      p_licence_id           := v_original.licence_id,
      p_user_id              := v_original.user_id,
      p_event_id             := v_original.event_id,
      p_body_id              := v_original.body_id,
      p_entry_type           := 'credit_confirmed',
      p_points               := v_original.points,
      p_hours                := v_original.hours,
      p_category             := v_original.category,
      p_effective_date       := v_original.effective_date,
      p_attestation_status   := 'body_confirmed',
      p_actor_id             := auth.uid(),
      p_references_entry_id  := v_original.id,
      p_reason               := p_reason
    );
  exception when unique_violation then
    -- credit_ledger_confirm_uniq fired: already confirmed by a concurrent or
    -- prior call. Idempotent — return the existing confirmation row rather
    -- than erroring, so a retried/double-clicked confirm is harmless.
    select * into v_row from public.credit_ledger
      where references_entry_id = v_original.id and entry_type = 'credit_confirmed';
  end;

  return v_row;
end;
$$;

revoke all on function public.confirm_credit_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_credit_entry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-verifying checks — STRUCTURAL/METADATA ONLY, deliberately no live
-- insert. credit_ledger is permanent append-only with NO ACTION FKs
-- (DEFERRED items 26/27): a real self-check insert here would leave an
-- undeletable, regulator-facing row on every environment this migration is
-- ever applied to, including production Seoul. Unlike 20260815030000's
-- self-check (which inserts into events/accrediting_bodies/
-- event_accreditation_groups, all of which allow deletion, and cleans up
-- after itself), credit_ledger cannot be cleaned up. Do not "fix" this by
-- adding a functional check — the gated test file (tests/cpd/
-- confirm_credit_entry.rls.test.ts) is where that lives, run manually,
-- never against Seoul.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'credit_ledger_entry_type_check'
      and pg_get_constraintdef(oid) like '%credit_confirmed%'
  ) then
    raise exception 'credit_ledger_entry_type_check: credit_confirmed not present after widen';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_type t on t.oid = p.prorettype
    where p.proname = 'confirm_credit_entry' and t.typname = 'credit_ledger'
  ) then
    raise exception 'confirm_credit_entry: missing, or does not return credit_ledger';
  end if;

  -- Load-bearing, not defensive: a function created by the migrating
  -- postgres role gets NO implicit grant on this project (confirmed by
  -- 20260815030000's own equivalent check) — skipping this would silently
  -- leave the function uncallable by anyone.
  if has_function_privilege('anon', 'public.confirm_credit_entry(uuid, text)', 'EXECUTE') then
    raise exception 'confirm_credit_entry: anon must NOT have EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.confirm_credit_entry(uuid, text)', 'EXECUTE') then
    raise exception 'confirm_credit_entry: authenticated must have EXECUTE';
  end if;

  -- record_credit_entry is untouched by this migration but is called into —
  -- confirm its signature hasn't drifted, same paranoid style as
  -- 20260815030000's equivalent check.
  if not exists (
    select 1 from pg_proc
    where proname = 'record_credit_entry'
      and pg_get_function_arguments(oid) like 'p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid, p_entry_type text, p_points numeric, p_hours numeric, p_category text, p_effective_date date, p_attestation_status text%'
  ) then
    raise exception 'confirm_credit_entry: record_credit_entry signature drifted from what this migration assumes';
  end if;

  -- UNIQUE is checked explicitly, not just column/predicate shape: a future
  -- edit that recreated this index (same name/column/predicate) without the
  -- UNIQUE keyword would defeat the exact idempotency guarantee this
  -- migration exists to add, and would otherwise pass this check silently.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'credit_ledger' and indexname = 'credit_ledger_confirm_uniq'
      and indexdef like '%UNIQUE%'
      and indexdef like '%(references_entry_id)%'
      and indexdef like '%credit_confirmed%'
  ) then
    raise exception 'credit_ledger_confirm_uniq: missing, malformed, or not UNIQUE';
  end if;
end $$;

-- Rollback (only clean before the first real confirmation is ever posted —
-- append-only means the CHECK-narrow step below fails once a
-- 'credit_confirmed' row exists, same as every other append-only CHECK
-- widen in this table's history):
--   drop index if exists public.credit_ledger_confirm_uniq;
--   revoke all on function public.confirm_credit_entry(uuid, text) from authenticated;
--   drop function if exists public.confirm_credit_entry(uuid, text);
--   alter table public.credit_ledger drop constraint credit_ledger_entry_type_check;
--   alter table public.credit_ledger add constraint credit_ledger_entry_type_check
--     check (entry_type in ('credit_earned','credit_adjusted','credit_transferred','credit_expired','credit_revoked'));
