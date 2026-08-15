-- Task 10.8/10.9, sub-task C3 of 5 — multi-body accreditation schema:
-- event_accreditation_groups / event_accreditations /
-- event_accreditation_occurrences / registration_roles, the tie-validation
-- guard, the freeze extension, the set_event_cpd_config compatibility
-- bridge, and the historical backfill.
-- Design authority: docs/adr/0002-multi-body-accreditation.md
-- "Storage shape" + "Award selection" + "R1, resolved" sections.
--
-- WHY A COMPATIBILITY BRIDGE, NOT A REPLACEMENT. C5 (not this task) builds
-- the actual multi-body organiser UI. Until then, the only write path an
-- organiser has is the existing single-body set_event_cpd_config(), which
-- keeps writing events.accrediting_body_id/cpd_hours exactly as before —
-- that surface, its guards, and its signature are UNCHANGED. What's added
-- is a synchronisation step inside the same function/transaction that
-- projects that single-body write into the new tables as a degenerate
-- one-group/one-row/all-occurrences case, so C4's award engine (reading the
-- new tables) and the legacy columns can never observably diverge.
--
-- ORDERING WITHIN THIS FILE MATTERS. The tables + tie trigger are created
-- first (they don't depend on anything else). The BACKFILL runs BEFORE the
-- freeze triggers are created — deliberately: the local stack already has
-- one pre-existing event with accrediting_body_id set AND a live
-- credit_ledger row (an orphaned eligibility-test fixture, confirmed live:
-- event 8a64d620-1f2e-4b26-9412-2c028cf71172, 1 credit_ledger row). Had the
-- freeze triggers existed first, the backfill's own INSERT into
-- event_accreditation_groups for that event would have been rejected by the
-- very freeze check meant to protect POST-credit changes — the backfill is
-- establishing the historical record for the first time, not changing an
-- already-established one, so it must run before the freeze guard exists.
-- Once the freeze triggers are created (after the backfill), all FUTURE
-- writes — including a future set_event_cpd_config call on that same
-- fixture event — are correctly blocked.

-- ---------------------------------------------------------------------------
-- event_accreditation_groups
-- ---------------------------------------------------------------------------
create table public.event_accreditation_groups (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  body_id        uuid not null references public.accrediting_bodies(id),
  -- Free text, interpreted only against this row's own body_id — no shared
  -- category table, no cross-body normalisation (ADR-0002 "R1, resolved").
  -- Nullable: the compatibility bridge below writes NULL (the pre-R1
  -- single-body flow never had a category concept).
  category_code  text,
  -- Free text (e.g. 'points', 'hours') — different bodies use different
  -- units; no CHECK, same posture as accrediting_bodies.cycle_config->>'units'.
  unit           text,
  -- NEVER inferred from row shape or count — a body's award scheme is a
  -- fact about that body's published rules, not a guess from the data.
  award_scheme   text not null check (award_scheme in ('explicit_schedule', 'proportional')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index event_accreditation_groups_event_idx on public.event_accreditation_groups(event_id);
create index event_accreditation_groups_body_idx on public.event_accreditation_groups(body_id);

create trigger event_accreditation_groups_touch_updated_at
  before update on public.event_accreditation_groups
  for each row execute function public.touch_updated_at();

alter table public.event_accreditation_groups enable row level security;

-- RLS shape mirrors event_occurrences (20260815000000): event-schedule/config
-- metadata, public-readable once the event is published.
create policy "event_accreditation_groups_public_read_when_event_published"
  on public.event_accreditation_groups
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_accreditation_groups.event_id and e.status = 'published'
  ));

create policy "event_accreditation_groups_organizer_select_own"
  on public.event_accreditation_groups
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_accreditation_groups.event_id and e.created_by = app_private.current_staff_id()
  ));

create policy "event_accreditation_groups_manager_select_all"
  on public.event_accreditation_groups
  for select to authenticated
  using (app_private.is_manager());

-- ---------------------------------------------------------------------------
-- event_accreditations
-- ---------------------------------------------------------------------------
create table public.event_accreditations (
  id                      uuid primary key default gen_random_uuid(),
  accreditation_group_id  uuid not null references public.event_accreditation_groups(id) on delete cascade,
  credit_value            numeric not null check (credit_value > 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index event_accreditations_group_idx on public.event_accreditations(accreditation_group_id);

create trigger event_accreditations_touch_updated_at
  before update on public.event_accreditations
  for each row execute function public.touch_updated_at();

alter table public.event_accreditations enable row level security;

create policy "event_accreditations_public_read_when_event_published"
  on public.event_accreditations
  for select to anon, authenticated
  using (exists (
    select 1
    from public.event_accreditation_groups ag
    join public.events e on e.id = ag.event_id
    where ag.id = event_accreditations.accreditation_group_id and e.status = 'published'
  ));

create policy "event_accreditations_organizer_select_own"
  on public.event_accreditations
  for select to authenticated
  using (exists (
    select 1
    from public.event_accreditation_groups ag
    join public.events e on e.id = ag.event_id
    where ag.id = event_accreditations.accreditation_group_id and e.created_by = app_private.current_staff_id()
  ));

create policy "event_accreditations_manager_select_all"
  on public.event_accreditations
  for select to authenticated
  using (app_private.is_manager());

-- ---------------------------------------------------------------------------
-- event_accreditation_occurrences — links an accreditation row to the
-- occurrence(s) it covers, by stable occurrence id (never an ordinal —
-- ADR-0002's "Storage shape" rejects ordinal-based scope for exactly this
-- table's purpose).
-- ---------------------------------------------------------------------------
create table public.event_accreditation_occurrences (
  accreditation_id  uuid not null references public.event_accreditations(id) on delete cascade,
  -- No cascading ON DELETE action (defaults to NO ACTION, same reasoning as
  -- registration_checkins.occurrence_id in 20260815000000): deleting an
  -- occurrence that already backs a live accreditation link is blocked, not
  -- silently unlinked.
  --
  -- DEFERRABLE INITIALLY DEFERRED, found necessary by this migration's own
  -- backtest, not by the task brief. events.id now cascades down TWO
  -- diverging paths that both end up touching event_occurrences:
  -- events -> event_occurrences directly (cascade), and
  -- events -> event_accreditation_groups -> event_accreditations ->
  -- event_accreditation_occurrences (three cascades deep) -> occurrence_id
  -- (this FK, no cascade). With a plain (non-deferrable) FK here, deleting an
  -- EVENTS row that has both an occurrence and an accreditation link on it
  -- failed with a spurious FK violation — Postgres processed the
  -- event_occurrences cascade before finishing the three-hop
  -- event_accreditation_groups cascade that would have cleared the
  -- referencing row first. Proven empirically (see report): the identical
  -- two-hop shape (events -> registrations -> registration_checkins,
  -- referencing event_occurrences the same restricted way) does NOT hit this
  -- — only the extra hop introduced by this migration's table depth does.
  -- DEFERRABLE INITIALLY DEFERRED defers the check to transaction commit,
  -- which fixes the multi-table cascade case (both rows are long gone by
  -- commit) while leaving the single-occurrence-delete protection intact:
  -- a standalone `delete from event_occurrences` is still exactly one
  -- implicit transaction, so the deferred check still fires — and still
  -- blocks the delete — at that same statement's own commit. Confirmed both
  -- ways live (cascading event delete succeeds; standalone occurrence
  -- delete while still linked still fails, in both an explicit
  -- SET CONSTRAINTS ... IMMEDIATE probe and a plain autocommit statement).
  occurrence_id     uuid not null references public.event_occurrences(id) deferrable initially deferred,
  primary key (accreditation_id, occurrence_id)
);

create index event_accreditation_occurrences_occurrence_idx on public.event_accreditation_occurrences(occurrence_id);

alter table public.event_accreditation_occurrences enable row level security;

create policy "event_accreditation_occurrences_public_read_when_event_published"
  on public.event_accreditation_occurrences
  for select to anon, authenticated
  using (exists (
    select 1
    from public.event_accreditations ea
    join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
    join public.events e on e.id = ag.event_id
    where ea.id = event_accreditation_occurrences.accreditation_id and e.status = 'published'
  ));

create policy "event_accreditation_occurrences_organizer_select_own"
  on public.event_accreditation_occurrences
  for select to authenticated
  using (exists (
    select 1
    from public.event_accreditations ea
    join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
    join public.events e on e.id = ag.event_id
    where ea.id = event_accreditation_occurrences.accreditation_id and e.created_by = app_private.current_staff_id()
  ));

create policy "event_accreditation_occurrences_manager_select_all"
  on public.event_accreditation_occurrences
  for select to authenticated
  using (app_private.is_manager());

-- ---------------------------------------------------------------------------
-- registration_roles — what the person DID at the event (attendee/chair/
-- presenter), body-independent. A body maps this to its own category
-- through its own category_taxonomy (ADR-0002 "R1, resolved") — not built
-- here, that's C4's award engine.
-- ---------------------------------------------------------------------------
create table public.registration_roles (
  registration_id  uuid not null references public.registrations(id) on delete cascade,
  role_code        text not null check (role_code in ('attendee', 'chair', 'presenter')),
  assigned_at      timestamptz not null default now(),
  assigned_by      uuid,
  primary key (registration_id, role_code)
);

alter table public.registration_roles enable row level security;

-- RLS shape mirrors registration_checkins (20260815000000): attendee-linked,
-- no anon read, organizer reads via the registration -> event ownership
-- chain, manager reads all.
create policy "registration_roles_organizer_select_own"
  on public.registration_roles
  for select to authenticated
  using (exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = registration_roles.registration_id
      and e.created_by = app_private.current_staff_id()
  ));

create policy "registration_roles_manager_select_all"
  on public.registration_roles
  for select to authenticated
  using (app_private.is_manager());

-- No INSERT/UPDATE/DELETE RLS policies on any of the four tables above —
-- all four are definer-only (Hard Rule 11 grant revoke below); a write
-- policy would be dead code since the grant blocks the write before RLS is
-- ever evaluated.

-- ---------------------------------------------------------------------------
-- Hard Rule 11 grant posture: definer-only, no direct writes for ANY app
-- role including service_role (BYPASSRLS — only the table-level REVOKE
-- protects it). No role retains a DELETE (no cleanup/erasure need
-- identified yet, same posture C1 took for event_occurrences /
-- registration_checkins).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.event_accreditation_groups      from anon, authenticated, service_role;
revoke insert, update, delete on public.event_accreditations            from anon, authenticated, service_role;
revoke insert, update, delete on public.event_accreditation_occurrences from anon, authenticated, service_role;
revoke insert, update, delete on public.registration_roles              from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tie-validation guard (ADR-0002 "Award selection"). Within one
-- explicit_schedule group, two event_accreditations rows whose linked
-- occurrence sets have the SAME cardinality are ambiguous — neither can be
-- said to be the uniquely-largest satisfied subset for an attendance
-- pattern that satisfies both. Deliberately simpler than a fully general
-- subset-containment tie detector: this catches the class of tie the ADR
-- describes (e.g. two different "any 2 of 3 days" rows) at the cost of also
-- rejecting some theoretically-fine configurations where equal-size sets
-- happen not to actually compete for the same attendance pattern. A fuller
-- check can be added later if a real body's schedule needs it — no known
-- body requires it today. Proportional groups never hit this (short-circuit
-- below) — ties are only a concept under explicit_schedule.
-- ---------------------------------------------------------------------------
create or replace function public.check_accreditation_tie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id     uuid;
  v_scheme       text;
  v_target_count integer;
  v_conflict_id  uuid;
begin
  select ag.id, ag.award_scheme into v_group_id, v_scheme
  from public.event_accreditations ea
  join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
  where ea.id = new.accreditation_id;

  if v_scheme is distinct from 'explicit_schedule' then
    return new;
  end if;

  select count(*) into v_target_count
  from public.event_accreditation_occurrences
  where accreditation_id = new.accreditation_id;

  select ea2.id into v_conflict_id
  from public.event_accreditations ea2
  where ea2.accreditation_group_id = v_group_id
    and ea2.id <> new.accreditation_id
    and (
      select count(*) from public.event_accreditation_occurrences eao2
      where eao2.accreditation_id = ea2.id
    ) = v_target_count
  limit 1;

  if v_conflict_id is not null then
    raise exception 'event_accreditation_occurrences: accreditation % and % in group % both link % occurrence(s) — ambiguous award selection under explicit_schedule (ADR-0002 "Award selection")',
      new.accreditation_id, v_conflict_id, v_group_id, v_target_count
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.check_accreditation_tie() from public, anon, authenticated;

-- CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED — not a plain AFTER-ROW
-- trigger. A real explicit_schedule group is built across MULTIPLE inserts
-- into this table (e.g. a "both days" row gets its two occurrence links in
-- two separate statements) — a plain immediate trigger fires after EVERY
-- single row, so it sees and rejects legitimate INTERMEDIATE states: linking
-- a group's first row to occ1 (cardinality 1), then a second row's first
-- link to occ2 (also cardinality 1, transiently) already looks like a tie,
-- even though the second row's FINAL state (occ2+occ3, cardinality 2) does
-- not conflict with anything. Caught empirically by this migration's own
-- self-check DO block below on first run (see the report for exact repro).
-- DEFERRED means every row-level firing still happens, but only once the
-- whole transaction is about to commit (or SET CONSTRAINTS ... IMMEDIATE is
-- called explicitly) — so the check always evaluates the FINAL state a
-- caller intended, not a transient one, while still being enforced inside
-- the database before commit, not one layer above the write. Only
-- INSERT/UPDATE — removing a link can only reduce a cardinality, never
-- create a tie, so DELETE needs no check.
create constraint trigger event_accreditation_occurrences_check_tie
  after insert or update on public.event_accreditation_occurrences
  deferrable initially deferred
  for each row execute function public.check_accreditation_tie();

-- ---------------------------------------------------------------------------
-- BACKFILL — runs BEFORE the freeze triggers below (see file header for why).
-- One group / one accreditation / all-current-occurrences per existing event
-- with a non-null accrediting_body_id, mirroring exactly what the
-- compatibility bridge below produces for a fresh single-body save.
-- ---------------------------------------------------------------------------
with grp as (
  insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
  select id, accrediting_body_id, null, null, 'proportional'
  from public.events
  where accrediting_body_id is not null
  returning id, event_id
),
acc as (
  insert into public.event_accreditations (accreditation_group_id, credit_value)
  select grp.id, e.cpd_hours
  from grp
  join public.events e on e.id = grp.event_id
  returning id, accreditation_group_id
)
insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
select acc.id, eo.id
from acc
join grp on grp.id = acc.accreditation_group_id
join public.event_occurrences eo on eo.event_id = grp.event_id;

-- ---------------------------------------------------------------------------
-- Freeze extension. Once an event has ANY credit_ledger row, its
-- accreditation config becomes immutable — same reasoning as
-- freeze_cpd_config_if_credited (20260725073250): future issuance must not
-- silently drift off the config earlier credits were computed against.
-- ---------------------------------------------------------------------------
create or replace function public.freeze_accreditation_groups_if_credited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  v_event_id := coalesce(new.event_id, old.event_id);
  if exists (select 1 from public.credit_ledger where event_id = v_event_id) then
    raise exception 'event_accreditation_groups: cannot modify accreditation for event % — credit already issued', v_event_id
      using errcode = '22023';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_accreditation_groups_if_credited() from public, anon, authenticated;

create trigger event_accreditation_groups_freeze_if_credited
  before insert or update or delete on public.event_accreditation_groups
  for each row execute function public.freeze_accreditation_groups_if_credited();

create or replace function public.freeze_accreditations_if_credited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_event_id uuid;
begin
  v_group_id := coalesce(new.accreditation_group_id, old.accreditation_group_id);
  select event_id into v_event_id from public.event_accreditation_groups where id = v_group_id;
  if v_event_id is not null and exists (select 1 from public.credit_ledger where event_id = v_event_id) then
    raise exception 'event_accreditations: cannot modify accreditation for event % — credit already issued', v_event_id
      using errcode = '22023';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_accreditations_if_credited() from public, anon, authenticated;

create trigger event_accreditations_freeze_if_credited
  before insert or update or delete on public.event_accreditations
  for each row execute function public.freeze_accreditations_if_credited();

create or replace function public.freeze_accreditation_occurrences_if_credited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_accreditation_id uuid;
  v_event_id         uuid;
begin
  v_accreditation_id := coalesce(new.accreditation_id, old.accreditation_id);
  select ag.event_id into v_event_id
  from public.event_accreditations ea
  join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
  where ea.id = v_accreditation_id;
  if v_event_id is not null and exists (select 1 from public.credit_ledger where event_id = v_event_id) then
    raise exception 'event_accreditation_occurrences: cannot modify occurrence links for event % — credit already issued', v_event_id
      using errcode = '22023';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_accreditation_occurrences_if_credited() from public, anon, authenticated;

create trigger event_accreditation_occurrences_freeze_if_credited
  before insert or update or delete on public.event_accreditation_occurrences
  for each row execute function public.freeze_accreditation_occurrences_if_credited();

-- event_occurrences.starts_at/ends_at — changing an occurrence's time window
-- after credit exists would retroactively change what attendance was scored
-- against. Only these two columns; name and adding brand-new occurrence rows
-- stay allowed (matches events_freeze_cpd_config_if_credited's column-scoped
-- posture, not a blanket table freeze).
create or replace function public.freeze_occurrence_window_if_credited()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
     and exists (select 1 from public.credit_ledger where event_id = old.event_id) then
    raise exception 'event_occurrences: cannot change starts_at/ends_at on occurrence % — event % already has credit issued', old.id, old.event_id
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_occurrence_window_if_credited() from public, anon, authenticated;

create trigger event_occurrences_freeze_window_if_credited
  before update on public.event_occurrences
  for each row execute function public.freeze_occurrence_window_if_credited();

-- ---------------------------------------------------------------------------
-- set_event_cpd_config — compatibility bridge (CREATE OR REPLACE, full body).
-- Signature, existing guards (owner check, active-body check, org-
-- authorisation check) and the events.accrediting_body_id/cpd_hours write
-- are ALL UNCHANGED. Added: an explicit pre-check for existing credit (so
-- this function fails cleanly before it starts deleting the old group out
-- from under itself — the trigger-level freeze above would also catch this,
-- but relying on it alone here would mean the DELETE statement below is the
-- thing that surfaces the error, mid-sync), then the sync into the new
-- tables as a single group / single accreditation / links to every current
-- occurrence, inside the same transaction, before the audit write (Hard
-- Rule: audit insert last).
-- ---------------------------------------------------------------------------
create or replace function public.set_event_cpd_config(p_event_id uuid, p_body_id uuid, p_cpd_hours numeric, p_actor_override uuid default null::uuid)
returns events
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  actor              public.staff%rowtype;
  v_row              public.events;
  v_owner            uuid;
  v_event_org        uuid;
  v_group_id         uuid;
  v_accreditation_id uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  if (p_body_id is null) <> (p_cpd_hours is null) then
    raise exception 'set_event_cpd_config: accrediting body and CPD hours must be set together, or both cleared'
      using errcode = '22023';
  end if;

  select created_by, organisation_id into v_owner, v_event_org
    from public.events where id = p_event_id for update;
  if not found then
    raise exception 'set_event_cpd_config: event % not found', p_event_id
      using errcode = 'P0002';
  end if;

  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'set_event_cpd_config: not the owner of event %', p_event_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  if p_body_id is not null and not exists (
    select 1 from public.accrediting_bodies b where b.id = p_body_id and b.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: accrediting body % is not an active body', p_body_id
      using errcode = 'P0002';
  end if;

  if p_body_id is not null and not exists (
    select 1 from public.organisation_body_authorisations a
     where a.organisation_id = v_event_org
       and a.body_id = p_body_id
       and a.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: this organisation is not authorised to claim accreditation from body %', p_body_id
      using errcode = '42501', detail = 'not_authorised_for_body';
  end if;

  -- Explicit pre-check (see header comment) — must run before the
  -- delete-then-reinsert sync below, not rely solely on the trigger-level
  -- freeze that would otherwise catch it mid-sync.
  if exists (select 1 from public.credit_ledger where event_id = p_event_id) then
    raise exception 'set_event_cpd_config: cannot change accreditation for event % — credit already issued', p_event_id
      using errcode = '22023';
  end if;

  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
   returning * into v_row;

  -- Sync into the multi-body tables (ADR-0002) as a degenerate one-group
  -- case, so C4's award engine and the legacy columns can never diverge.
  -- Clean slate every call: a single-body event has at most one group under
  -- this compatibility path.
  delete from public.event_accreditation_groups where event_id = p_event_id;

  if p_body_id is not null then
    insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
    values (p_event_id, p_body_id, null, null, 'proportional')
    returning id into v_group_id;

    insert into public.event_accreditations (accreditation_group_id, credit_value)
    values (v_group_id, p_cpd_hours)
    returning id into v_accreditation_id;

    -- Query the event's current occurrences rather than assuming "the first
    -- one" — today that's always exactly one (C1's auto-created row), but
    -- this stays correct if C5 later lets an organiser add more occurrences
    -- before ever touching accreditation again.
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
    select v_accreditation_id, eo.id
    from public.event_occurrences eo
    where eo.event_id = p_event_id;
  end if;

  perform public.write_audit_event(
    p_event_type    := 'event_cpd_config_set',
    p_actor_user_id := auth.uid(),
    p_actor_role    := actor.role,
    p_organisation_id := actor.organisation_id,
    p_subject_type  := 'event',
    p_subject_id    := p_event_id,
    p_payload       := jsonb_build_object(
      'accrediting_body_id', p_body_id,
      'cpd_hours', p_cpd_hours
    )
  );

  return v_row;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions. Schema + grant posture only — a live round-trip
-- through set_event_cpd_config needs a real staff JWT to resolve the actor
-- (app_private.resolve_actor's override branch requires auth.role() =
-- 'service_role', which a migration's own executing role never satisfies —
-- same limitation 20260814020000's self-check already documented). That
-- live round-trip is instead exercised by tests/cpd/set_event_cpd_config.rls.test.ts
-- right after this migration applies, using a real service-role JWT.
-- ---------------------------------------------------------------------------
do $$
declare
  v_test_body_id  uuid;
  v_test_event_id uuid;
  v_staff_id      uuid;
  v_start         timestamptz;
  v_occ1          uuid;
  v_occ2          uuid;
  v_occ3          uuid;
  v_group_id      uuid;
  v_acc1          uuid;
  v_acc2          uuid;
  v_tie_caught    boolean := false;
begin
  -- 1. Tables exist with RLS enabled.
  if not (select relrowsecurity from pg_class where oid = 'public.event_accreditation_groups'::regclass) then
    raise exception 'event_accreditation_groups: RLS not enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.event_accreditations'::regclass) then
    raise exception 'event_accreditations: RLS not enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.event_accreditation_occurrences'::regclass) then
    raise exception 'event_accreditation_occurrences: RLS not enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.registration_roles'::regclass) then
    raise exception 'registration_roles: RLS not enabled';
  end if;

  -- 2. Hard Rule 11 grant posture: no INSERT/UPDATE/DELETE for anon,
  -- authenticated, or service_role on any of the four tables.
  if has_table_privilege('anon', 'public.event_accreditation_groups', 'INSERT')
     or has_table_privilege('authenticated', 'public.event_accreditation_groups', 'INSERT')
     or has_table_privilege('service_role', 'public.event_accreditation_groups', 'INSERT') then
    raise exception 'event_accreditation_groups: an app role still has INSERT';
  end if;
  if has_table_privilege('anon', 'public.event_accreditations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.event_accreditations', 'UPDATE')
     or has_table_privilege('service_role', 'public.event_accreditations', 'UPDATE') then
    raise exception 'event_accreditations: an app role still has UPDATE';
  end if;
  if has_table_privilege('anon', 'public.event_accreditation_occurrences', 'DELETE')
     or has_table_privilege('authenticated', 'public.event_accreditation_occurrences', 'DELETE')
     or has_table_privilege('service_role', 'public.event_accreditation_occurrences', 'DELETE') then
    raise exception 'event_accreditation_occurrences: an app role still has DELETE';
  end if;
  if has_table_privilege('anon', 'public.registration_roles', 'INSERT')
     or has_table_privilege('authenticated', 'public.registration_roles', 'INSERT')
     or has_table_privilege('service_role', 'public.registration_roles', 'INSERT') then
    raise exception 'registration_roles: an app role still has INSERT';
  end if;

  -- 3. set_event_cpd_config's grants survived the CREATE OR REPLACE.
  if not has_function_privilege('authenticated', 'public.set_event_cpd_config(uuid, uuid, numeric, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.set_event_cpd_config(uuid, uuid, numeric, uuid)', 'EXECUTE') then
    raise exception 'set_event_cpd_config lost a grant it needs';
  end if;

  -- 4. Backfill sanity: the one known pre-existing credited event
  -- (8a64d620-1f2e-4b26-9412-2c028cf71172, confirmed live before this
  -- migration) now has exactly one group/accreditation, linked to its one
  -- occurrence. Skipped harmlessly if that fixture doesn't exist on this
  -- database (e.g. a fresh project with no pre-existing credited events).
  if exists (select 1 from public.events where id = '8a64d620-1f2e-4b26-9412-2c028cf71172') then
    if (select count(*) from public.event_accreditation_groups where event_id = '8a64d620-1f2e-4b26-9412-2c028cf71172') <> 1 then
      raise exception 'backfill: expected exactly one group for the known pre-existing credited event';
    end if;
  end if;

  -- 5. Tie-validation trigger — direct superuser writes (this DO block runs
  -- as the migration-applying role, which bypasses the Hard Rule 11 grants
  -- entirely; that grant boundary is covered separately by
  -- tests/rls/event_accreditation_groups.rls.test.ts). This exercises the
  -- TRIGGER LOGIC itself.
  select id into v_staff_id from public.staff where status = 'active' limit 1;
  if v_staff_id is null then
    raise notice 'tie-validation self-check skipped: no active staff row on this database yet';
  else
    insert into public.accrediting_bodies (organisation_id, short_name, full_name, status, cycle_config, category_taxonomy)
    values ('00000000-0000-0000-0000-000000000001', 'MIG-TIE-CHECK', 'Migration self-check body (accreditation_groups_and_roles)', 'active', '{}', '{}')
    returning id into v_test_body_id;

    v_start := now();
    insert into public.events (
      title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude, status
    ) values (
      'Migration self-check tie event — DELETE ME', v_start, v_start + interval '1 hour', 'Asia/Hong_Kong',
      v_staff_id, 'Test Venue', 'Hong Kong', 'HK', 22.3, 114.2, 'draft'
    ) returning id into v_test_event_id;

    -- events_create_default_occurrence already created ordinal=1 spanning
    -- [v_start, v_start+1h). Two more occurrences, clear of that window.
    select id into v_occ1 from public.event_occurrences where event_id = v_test_event_id and ordinal = 1;
    insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
    values (v_test_event_id, 2, 'day', v_start + interval '1 day', v_start + interval '1 day 1 hour')
    returning id into v_occ2;
    insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
    values (v_test_event_id, 3, 'day', v_start + interval '2 day', v_start + interval '2 day 1 hour')
    returning id into v_occ3;

    insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
    values (v_test_event_id, v_test_body_id, null, 'points', 'explicit_schedule')
    returning id into v_group_id;

    insert into public.event_accreditations (accreditation_group_id, credit_value) values (v_group_id, 5) returning id into v_acc1;
    insert into public.event_accreditations (accreditation_group_id, credit_value) values (v_group_id, 6) returning id into v_acc2;

    -- acc1 -> occ1 (cardinality 1); acc2 -> occ2, occ3 (cardinality 2). No tie yet.
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_acc1, v_occ1);
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_acc2, v_occ2);
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_acc2, v_occ3);

    -- Push acc1 to cardinality 2 (occ1 + occ2) — ties acc2's cardinality (2).
    -- SET CONSTRAINTS ... IMMEDIATE forces the deferred trigger to fire
    -- right here (inside this catchable sub-block) instead of waiting for
    -- the enclosing transaction's commit.
    begin
      insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id) values (v_acc1, v_occ2);
      set constraints event_accreditation_occurrences_check_tie immediate;
    exception when sqlstate '22023' then
      v_tie_caught := true;
    end;
    if not v_tie_caught then
      raise exception 'tie-validation trigger did not reject two same-cardinality accreditation rows in one explicit_schedule group';
    end if;

    -- Cleanup — no residue. The group must go FIRST: event_occurrences has
    -- no cascade from event_accreditation_occurrences.occurrence_id (by
    -- design — RESTRICT, same reasoning as registration_checkins.occurrence_id),
    -- so deleting the event before the group would fail trying to cascade
    -- into still-referenced occurrences. None of this event has any
    -- credit_ledger row, so the freeze triggers above are no-ops here.
    delete from public.event_accreditation_groups where event_id = v_test_event_id;
    delete from public.events where id = v_test_event_id;
    delete from public.accrediting_bodies where id = v_test_body_id;
  end if;

  raise notice 'accreditation_groups_and_roles self-check: all assertions passed';
end $$;

-- Rollback:
--   drop trigger event_occurrences_freeze_window_if_credited on public.event_occurrences;
--   drop function public.freeze_occurrence_window_if_credited();
--   drop table public.registration_roles;
--   drop table public.event_accreditation_occurrences;  -- (drops its triggers/functions via CASCADE on function drop below)
--   drop table public.event_accreditations;
--   drop table public.event_accreditation_groups;
--   drop function public.freeze_accreditation_occurrences_if_credited();
--   drop function public.freeze_accreditations_if_credited();
--   drop function public.freeze_accreditation_groups_if_credited();
--   drop function public.check_accreditation_tie();
--   create function public.set_event_cpd_config(p_event_id uuid, p_body_id uuid, p_cpd_hours numeric, p_actor_override uuid) ...
--     (restore 20260814020000's body — no new-table sync, no credit pre-check)
