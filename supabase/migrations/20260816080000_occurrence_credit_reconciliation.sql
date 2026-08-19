-- Closes claim 6 from the external code-review doc (2026-08-16), scoped
-- down through investigation, not as originally described. The doc's
-- framing ("occurrence moved after attendance") doesn't match reality:
-- verified live that event_accreditation_groups, event_accreditations
-- (incl. credit_value), event_accreditation_occurrences membership, and
-- event_occurrences.starts_at/ends_at are ALL already frozen once any
-- credit_ledger row exists for the event (freeze_*_if_credited triggers,
-- 20260815020000). Only event_occurrences.attendance_points has no such
-- guard — confirmed live by editing it on an event with existing credit
-- and watching it succeed. That's the one real, narrow gap.
--
-- Ivan's call (after seeing the freeze-trigger precedent, three times):
-- reconcile, don't freeze. So attendance_points stays editable, and this
-- migration makes an edit AUTOMATICALLY correct already-posted credit for
-- the proportional-scheme groups it actually affects (explicit_schedule
-- groups never read attendance_points at all — computed delta will always
-- be 0 for them, which is correct, not a gap needing separate handling).
--
-- Delta semantics decided this session (no prior code settles it):
-- credit_adjusted rows are DELTAS, summed against the original
-- credit_earned row to get the effective total — standard ledger practice,
-- matches this repo's own "corrections flow through new entries, never
-- mutations" doctrine (docs/doctrine.md).
--
-- THREE PIECES:
--   1. compute_accreditation_credit() — the proportional/explicit_schedule
--      computation, EXTRACTED byte-for-byte from award_attendance_credit's
--      inline per-group loop body (verified against the live function
--      before writing this), so award and reconcile share ONE computation,
--      never two copies that can drift.
--   2. award_attendance_credit() — refactored to CALL the extracted
--      function instead of duplicating the logic inline. Same signature,
--      same outcome codes, same result shape — a pure extraction, not a
--      behavior change. Backtested against the full existing suite before
--      this shipped.
--   3. reconcile_group_credit() + a trigger on event_occurrences AFTER
--      UPDATE OF attendance_points — finds every accreditation group that
--      includes the edited occurrence, recomputes each already-credited
--      registration's credit under CURRENT data, and posts a credit_adjusted
--      delta if it differs. Idempotent: an edit that doesn't change the
--      computed value posts nothing.
--
-- EXPLICITLY OUT OF SCOPE:
--   * Reconciling anything OTHER than attendance_points edits. The other
--     four sibling fields are already frozen; this migration does not
--     touch that pattern.
--   * Any UI surfacing these automatic corrections. They land in
--     credit_ledger and are discoverable there; no notification/queue
--     exists (same "mechanism before UI" gap as confirm_credit_entry).
--   * Occurrence DELETION — already structurally blocked (registration_
--     checkins.occurrence_id has no ON DELETE action once checkins exist).

-- ---------------------------------------------------------------------------
-- 1. compute_accreditation_credit — pure computation, no writes. STABLE
--    (not VOLATILE): reads only, safe to mark so, and accurate. SECURITY
--    DEFINER + explicit grants (not relying on owner-implicit rights
--    during nested definer calls) matches this repo's established posture
--    for internal-only helpers (e.g. write_audit_event, granted despite
--    zero direct app-layer callers).
create or replace function public.compute_accreditation_credit(
  p_reg_id      uuid,
  p_user_id     uuid,
  p_role_codes  text[],
  p_grp         public.event_accreditation_groups
) returns table(
  category    text,
  unit        text,
  credit      numeric,
  outcome     text,
  licence_id  uuid
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_licence         public.practitioner_licences%rowtype;
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
begin
  select pl.* into v_licence from public.practitioner_licences pl
    where pl.user_id = p_user_id and pl.body_id = p_grp.body_id and pl.status = 'verified'
    order by pl.created_at desc limit 1;
  if not found then
    outcome := 'skipped:no_licence'; return next; return;
  end if;
  licence_id := v_licence.id;

  if p_grp.category_code is null then
    category := null;
  else
    v_role_match := false;
    select ab.category_taxonomy into v_taxonomy
      from public.accrediting_bodies ab where ab.id = p_grp.body_id;
    foreach v_role in array p_role_codes loop
      v_mapped_category := v_taxonomy #>> array['role_mappings', v_role];
      if v_mapped_category is not null and v_mapped_category = p_grp.category_code then
        v_role_match := true;
        exit;
      end if;
    end loop;
    if not v_role_match then
      outcome := 'skipped:no_role_match'; return next; return;
    end if;
    category := p_grp.category_code;
  end if;

  if p_grp.award_scheme = 'proportional' then
    select ea.credit_value into v_best_credit
      from public.event_accreditations ea
      where ea.accreditation_group_id = p_grp.id
      order by ea.created_at
      limit 1;

    select coalesce(sum(x.pts), 0) into v_available from (
      select distinct eo.id, eo.attendance_points as pts
      from public.event_accreditation_occurrences eao
      join public.event_accreditations ea on ea.id = eao.accreditation_id
      join public.event_occurrences eo on eo.id = eao.occurrence_id
      where ea.accreditation_group_id = p_grp.id
    ) x;

    if v_available = 0 then
      outcome := 'skipped:no_occurrences'; return next; return;
    end if;

    select coalesce(sum(x.pts), 0) into v_earned from (
      select distinct eo.id, eo.attendance_points as pts
      from public.event_accreditation_occurrences eao
      join public.event_accreditations ea on ea.id = eao.accreditation_id
      join public.event_occurrences eo on eo.id = eao.occurrence_id
      join public.registration_checkins rc
        on rc.occurrence_id = eo.id and rc.registration_id = p_reg_id
      where ea.accreditation_group_id = p_grp.id
    ) x;

    if v_earned = 0 then
      outcome := 'skipped:no_attendance'; return next; return;
    end if;

    v_credit := v_best_credit * v_earned::numeric / v_available;

  elsif p_grp.award_scheme = 'explicit_schedule' then
    v_best_id := null; v_best_card := null; v_best_credit := null;

    select ea.id, cnt.card, ea.credit_value
      into v_best_id, v_best_card, v_best_credit
    from public.event_accreditations ea
    join lateral (
      select count(*) as card
      from public.event_accreditation_occurrences eao
      where eao.accreditation_id = ea.id
    ) cnt on true
    where ea.accreditation_group_id = p_grp.id
      and cnt.card > 0
      and not exists (
        select 1 from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
          and eao.occurrence_id not in (
            select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = p_reg_id
          )
      )
    order by cnt.card desc
    limit 1;

    if v_best_id is null then
      outcome := 'skipped:no_matching_schedule'; return next; return;
    end if;

    select count(*) into v_tie_count
    from public.event_accreditations ea
    join lateral (
      select count(*) as card
      from public.event_accreditation_occurrences eao
      where eao.accreditation_id = ea.id
    ) cnt on true
    where ea.accreditation_group_id = p_grp.id
      and cnt.card = v_best_card
      and not exists (
        select 1 from public.event_accreditation_occurrences eao
        where eao.accreditation_id = ea.id
          and eao.occurrence_id not in (
            select rc.occurrence_id from public.registration_checkins rc where rc.registration_id = p_reg_id
          )
      );

    if v_tie_count > 1 then
      outcome := 'skipped:ambiguous_schedule'; return next; return;
    end if;

    v_credit := v_best_credit;
  else
    raise exception 'compute_accreditation_credit: unrecognised award_scheme % on group %', p_grp.award_scheme, p_grp.id;
  end if;

  unit := case when p_grp.unit = 'points' then 'points' else 'hours' end;
  credit := v_credit;
  outcome := 'computed';
  return next;
end;
$$;

revoke execute on function public.compute_accreditation_credit(uuid, uuid, text[], public.event_accreditation_groups) from public, anon;
grant execute on function public.compute_accreditation_credit(uuid, uuid, text[], public.event_accreditation_groups) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. award_attendance_credit — pure extraction. Every check, every order of
--    operations, every outcome code is byte-identical to the live function
--    (20260815040000); the only change is that the per-group computation
--    now calls compute_accreditation_credit() instead of inlining it.
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

revoke all on function public.award_attendance_credit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. reconcile_group_credit — for every registration already credited
--    under this group, recompute under CURRENT data and post a credit_
--    adjusted DELTA if it differs. Never blocks, never touches anything
--    when the delta is 0 (idempotent — an attendance_points edit that
--    doesn't change the computed value posts nothing, same discipline as
--    20260816070000's cancel/soft_delete/restore no-op guards).
create or replace function public.reconcile_group_credit(p_group_id uuid)
returns table(registration_id uuid, outcome text, delta numeric)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_grp         public.event_accreditation_groups%rowtype;
  v_original    public.credit_ledger%rowtype;
  v_reg_id      uuid;
  v_role_codes  text[];
  v_computed    record;
  v_adj_sum     numeric;
  v_effective   numeric;
  v_new_value   numeric;
  v_delta       numeric;
begin
  select * into v_grp from public.event_accreditation_groups where id = p_group_id;
  if not found then
    return;
  end if;

  -- credit_ledger stores user_id, not registration_id — registration_roles
  -- (needed for the role->category resolution) is keyed on registration_id,
  -- so each already-credited row needs its registration resolved back via
  -- the same email-join award_attendance_credit itself uses elsewhere.
  for v_original in
    select * from public.credit_ledger
    where event_id = v_grp.event_id and body_id = v_grp.body_id and entry_type = 'credit_earned'
  loop
    select r.id into v_reg_id
    from public.registrations r
    join auth.users u on lower(u.email) = lower(trim(r.email))
    where r.event_id = v_grp.event_id and u.id = v_original.user_id
    limit 1;

    if v_reg_id is null then
      continue;
    end if;

    select array_agg(rr.role_code) into v_role_codes
      from public.registration_roles rr where rr.registration_id = v_reg_id;
    if v_role_codes is null or array_length(v_role_codes, 1) is null then
      v_role_codes := array['attendee'];
    end if;

    select * into v_computed
      from public.compute_accreditation_credit(v_reg_id, v_original.user_id, v_role_codes, v_grp);

    v_adj_sum := coalesce((
      select sum(case when v_grp.unit = 'points' then points else hours end)
      from public.credit_ledger
      where references_entry_id = v_original.id and entry_type = 'credit_adjusted'
    ), 0);
    v_effective := coalesce(case when v_grp.unit = 'points' then v_original.points else v_original.hours end, 0) + v_adj_sum;
    -- A registrant who no longer qualifies at all under current data
    -- (outcome starts with 'skipped:') is treated as credit=0, not as
    -- "leave the old value alone" — an accurate reconciliation corrects
    -- the effective total to what current data actually supports.
    v_new_value := case when v_computed.outcome = 'computed' then v_computed.credit else 0 end;
    v_delta := v_new_value - v_effective;

    if v_delta = 0 then
      continue;
    end if;

    perform public.record_credit_entry(
      p_licence_id           := v_original.licence_id,
      p_user_id              := v_original.user_id,
      p_event_id             := v_grp.event_id,
      p_body_id              := v_grp.body_id,
      p_entry_type           := 'credit_adjusted',
      p_points               := case when v_grp.unit = 'points' then v_delta else null end,
      p_hours                := case when v_grp.unit = 'hours' then v_delta else null end,
      p_category             := v_original.category,
      p_effective_date       := v_original.effective_date,
      p_attestation_status   := v_original.attestation_status,
      p_actor_id             := null,
      p_references_entry_id  := v_original.id,
      p_reason               := format('automatic reconciliation: accreditation group %s recomputed after attendance_points change', p_group_id)
    );

    registration_id := v_reg_id;
    outcome := v_computed.outcome;
    delta := v_delta;
    return next;
  end loop;
end;
$$;

revoke execute on function public.reconcile_group_credit(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_group_credit(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The trigger — fires only on an actual attendance_points change, finds
--    every accreditation group that includes the edited occurrence, and
--    reconciles each. SECURITY DEFINER so it runs with consistent rights
--    regardless of which role performed the UPDATE (an organiser via the
--    normal edit path, not necessarily service_role).
create or replace function public.trigger_reconcile_on_attendance_points_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_grp_id uuid;
begin
  if new.attendance_points is distinct from old.attendance_points then
    for v_grp_id in
      select distinct eag.id
      from public.event_accreditation_occurrences eao
      join public.event_accreditations ea on ea.id = eao.accreditation_id
      join public.event_accreditation_groups eag on eag.id = ea.accreditation_group_id
      where eao.occurrence_id = new.id
    loop
      perform public.reconcile_group_credit(v_grp_id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger event_occurrences_reconcile_on_points_change
  after update on public.event_occurrences
  for each row
  execute function public.trigger_reconcile_on_attendance_points_change();

-- ---------------------------------------------------------------------------
-- Self-verifying checks — structural/metadata only. No live insert: same
-- reasoning as every prior migration touching credit_ledger (permanent,
-- undeletable rows on every environment this runs on, including Seoul).
-- Functional correctness is covered by the full existing test suite
-- (proves the award_attendance_credit extraction is behavior-preserving)
-- plus manual local verification before this ships to Seoul.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    where p.proname = 'compute_accreditation_credit'
  ) then
    raise exception 'compute_accreditation_credit: missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_type t on t.oid = p.prorettype
    where p.proname = 'award_attendance_credit'
      and pg_get_function_arguments(p.oid) = 'p_event_id uuid, p_registration_code text, p_actor_id uuid DEFAULT NULL::uuid'
  ) then
    raise exception 'award_attendance_credit: signature drifted during extraction';
  end if;
  if has_function_privilege('anon', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: anon/authenticated must NOT have EXECUTE after extraction';
  end if;
  if not has_function_privilege('service_role', 'public.award_attendance_credit(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'award_attendance_credit: service_role lost EXECUTE after extraction';
  end if;

  if not exists (
    select 1 from pg_proc where proname = 'reconcile_group_credit'
  ) then
    raise exception 'reconcile_group_credit: missing';
  end if;
  if has_function_privilege('anon', 'public.reconcile_group_credit(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_group_credit(uuid)', 'EXECUTE') then
    raise exception 'reconcile_group_credit: anon/authenticated must NOT have EXECUTE';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'event_occurrences_reconcile_on_points_change'
      and tgrelid = 'public.event_occurrences'::regclass
      and not tgisinternal
  ) then
    raise exception 'event_occurrences_reconcile_on_points_change: trigger missing';
  end if;

  -- record_credit_entry is called into but untouched — confirm its
  -- signature hasn't drifted, same paranoid style as every prior migration
  -- that calls into it.
  if not exists (
    select 1 from pg_proc
    where proname = 'record_credit_entry'
      and pg_get_function_arguments(oid) like 'p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid, p_entry_type text, p_points numeric, p_hours numeric, p_category text, p_effective_date date, p_attestation_status text%'
  ) then
    raise exception 'reconcile_group_credit: record_credit_entry signature drifted from what this migration assumes';
  end if;
end $$;

-- Rollback (safe any time — adds no column; reverting means dropping the
-- trigger + 3 new functions and restoring award_attendance_credit's prior
-- inline body from supabase/migrations/20260815040000_multi_occurrence_checkin_fix.sql):
--   drop trigger if exists event_occurrences_reconcile_on_points_change on public.event_occurrences;
--   drop function if exists public.trigger_reconcile_on_attendance_points_change();
--   drop function if exists public.reconcile_group_credit(uuid);
--   drop function if exists public.compute_accreditation_credit(uuid, uuid, text[], public.event_accreditation_groups);
--   -- then re-apply 20260815040000's award_attendance_credit body verbatim
