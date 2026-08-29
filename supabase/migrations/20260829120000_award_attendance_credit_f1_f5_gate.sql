-- Stage B / B4 — F1-F5 CPD release gate on award_attendance_credit.
--
-- Plan authority: docs/plans/2026-08-29-account-professional-profile-plan.md
--   §2  F1-F5 definition
--   §6.1 gate insertion site
--   §6.2 must-not-change (credit_ledger, licence_id key, HR11, attendance
--         success on credit skip)
--
-- Two changes in this migration:
--
--   1. compute_accreditation_credit broadens its licence-status accept-set
--      from {'verified'} to {'declared', 'verified'} per plan F4 product
--      rule: "claimed membership is not treated as verified; verification
--      may remain async; 'declared' is enough to release points unless a
--      specific body later requires 'verified' only (body-level override
--      is a later config, not this slice)". Real Impact today: users who
--      self-declared a licence but have not been body-verified now become
--      eligible for credit. This is the pilot posture.
--
--   2. award_attendance_credit gains a new pre-loop gate that evaluates
--      F1-F5. Skip codes:
--        skipped:registration_unlinked  (F5)
--        skipped:email_unverified       (F1)
--        skipped:missing_consents       (F2)
--        skipped:profile_incomplete     (F3)
--        skipped:no_licence             (F4 — already emitted by
--                                       compute_accreditation_credit)
--      All new skip codes flow through the existing AwardOutcome shape
--      (bodyId: null for the pre-loop ones, per-body for F4). The caller
--      wrappers (lib/cpd/awardAttendanceCredit.ts + the two check-in
--      Server Actions) already tolerate arbitrary skip reasons and let
--      attendance stand — plan §6.2 attendance-authoritative invariant
--      is preserved without any caller change.
--
--   A new parameter p_enforce_full_setup boolean default true gives an
--   emergency opt-out (e.g. if a body config change bricks the gate on a
--   real event day). No caller sets it today; it exists as a documented
--   escape hatch. When false, the function falls back to the pre-gate
--   behaviour and resolves user_id via email lookup for legacy rows.
--
-- Consent version currency: F2 pins versions to the current values from
-- lib/legalVersions.ts (pp-0.2-draft, tos-0.1-draft) at migration time.
-- Update them in lockstep. A test in tests/rls/consent_audited.rls.test.ts
-- catches drift the next time either surface is touched.

-- ---------------------------------------------------------------------------
-- 1. compute_accreditation_credit — broaden licence status accept set
-- ---------------------------------------------------------------------------

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
  -- Plan F4: accept declared OR verified. 'declared' = practitioner
  -- self-registered a licence number; 'verified' = body confirmed. Per-body
  -- override to require verified-only is a future config surface. Prefer
  -- verified over declared when both exist so real-verification always wins
  -- attribution when available.
  select pl.* into v_licence from public.practitioner_licences pl
    where pl.user_id = p_user_id
      and pl.body_id = p_grp.body_id
      and pl.status in ('declared', 'verified')
    order by (pl.status = 'verified') desc, pl.created_at desc
    limit 1;
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

  -- Body below ported verbatim from 20260816080000_occurrence_credit_reconciliation.sql
  -- so registration_checkins (the real table name) is used. An earlier draft
  -- of this migration copied stale SQL that referenced a non-existent
  -- 'event_checkins' relation and produced 42P01 at runtime.
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

-- ---------------------------------------------------------------------------
-- 2. award_attendance_credit — F1-F5 gate + optional opt-out parameter
-- ---------------------------------------------------------------------------
--
-- Signature CHANGE: adds p_enforce_full_setup boolean default true. Existing
-- callers (lib/cpd/awardAttendanceCredit.ts wrapper, its two check-in call
-- sites) call the RPC positionally / by name without this parameter — the
-- default true keeps them getting the new gate behaviour automatically.

-- Drop the previous four-arity/three-arity function bodies before recreating
-- so the parameter change lands cleanly. Postgres treats different parameter
-- signatures as separate functions; we need the old one gone so it doesn't
-- shadow the new default-based signature at call time.
drop function if exists public.award_attendance_credit(uuid, text, uuid);

create or replace function public.award_attendance_credit(
  p_event_id uuid,
  p_registration_code text,
  p_actor_id uuid default null::uuid,
  p_enforce_full_setup boolean default true
)
returns table(body_id uuid, outcome text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_event           public.events%rowtype;
  v_reg             public.registrations%rowtype;
  v_user_id         uuid;
  v_actor           uuid := p_actor_id;
  v_eff             date;
  v_group_count     integer;
  v_role_codes      text[];
  v_email_confirmed timestamptz;
  v_consents        integer;
  v_pp              public.professional_profiles%rowtype;
  grp               public.event_accreditation_groups%rowtype;
  v_computed        record;
  v_points          numeric;
  v_hours           numeric;
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

  select * into v_reg
  from public.registrations r
  where r.event_id = p_event_id and r.registration_code = p_registration_code;
  if not found then
    body_id := null; outcome := 'skipped:no_registration'; return next; return;
  end if;

  if v_reg.status = 'cancelled' then
    body_id := null; outcome := 'skipped:cancelled'; return next; return;
  end if;

  ---------------------------------------------------------------------------
  -- F5 — registration must be linked to a user (plan §5.5).
  --      When p_enforce_full_setup=false, fall back to legacy email lookup
  --      so reconcile of pre-plan attendance can still resolve a user.
  ---------------------------------------------------------------------------
  if v_reg.user_id is not null then
    v_user_id := v_reg.user_id;
  elsif not p_enforce_full_setup then
    -- Legacy email-lookup path. Reserved for one-off reconcile scripts.
    select u.id into v_user_id from auth.users u
      where lower(u.email) = lower(trim(v_reg.email)) limit 1;
    if v_user_id is null then
      body_id := null; outcome := 'skipped:no_user'; return next; return;
    end if;
  else
    body_id := null; outcome := 'skipped:registration_unlinked'; return next; return;
  end if;

  ---------------------------------------------------------------------------
  -- F1-F3 evaluated ONCE (user-scoped, same for every body on the event).
  -- Skipped entirely when p_enforce_full_setup=false. F4 stays inside
  -- compute_accreditation_credit (per-body licence check).
  ---------------------------------------------------------------------------
  if p_enforce_full_setup then
    -- F1: verified auth email.
    select u.email_confirmed_at into v_email_confirmed
      from auth.users u where u.id = v_user_id;
    if v_email_confirmed is null then
      body_id := null; outcome := 'skipped:email_unverified'; return next; return;
    end if;

    -- F2: consent_records for both privacy_policy AND terms_of_service at the
    -- current pinned versions (see lib/legalVersions.ts — update lockstep).
    -- Withdrawn rows do not count. Multi-row per type is fine — we ask for
    -- at least one non-withdrawn row with the current version.
    select count(distinct consent_type) into v_consents
    from public.consent_records
    where user_id = v_user_id
      and withdrawn_at is null
      and (
        (consent_type = 'privacy_policy'   and version = 'pp-0.2-draft')
        or
        (consent_type = 'terms_of_service' and version = 'tos-0.1-draft')
      );
    if v_consents < 2 then
      body_id := null; outcome := 'skipped:missing_consents'; return next; return;
    end if;

    -- F3: professional_profiles row + workplace + position + profession.
    -- workplace_text or workplace_organisation_id counts; position_code or
    -- position_other counts. profession_code must be present.
    select * into v_pp
      from public.professional_profiles pp where pp.user_id = v_user_id;
    if not found then
      body_id := null; outcome := 'skipped:profile_incomplete'; return next; return;
    end if;
    if (coalesce(nullif(v_pp.workplace_text, ''), null) is null
          and v_pp.workplace_organisation_id is null)
       or (coalesce(nullif(v_pp.position_code, ''), null) is null
             and coalesce(nullif(v_pp.position_other, ''), null) is null)
       or coalesce(nullif(v_pp.profession_code, ''), null) is null then
      body_id := null; outcome := 'skipped:profile_incomplete'; return next; return;
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- Existing per-body award logic. F4 is inside compute_accreditation_credit.
  ---------------------------------------------------------------------------
  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    raise warning 'award_attendance_credit: actor % has no public.users row; issuing credit unattributed', v_actor;
    v_actor := null;
  end if;

  v_eff := (v_event.start_time at time zone v_event.timezone)::date;

  select array_agg(rr.role_code) into v_role_codes
  from public.registration_roles rr where rr.registration_id = v_reg.id;
  if v_role_codes is null or array_length(v_role_codes, 1) is null then
    v_role_codes := array['attendee'];
  end if;

  -- Per-body role_award_rule pre-pass — unchanged from 20260826000000.
  for v_body in
    select distinct eag.body_id from public.event_accreditation_groups eag
    where eag.event_id = p_event_id
  loop
    if not exists (
      select 1 from public.practitioner_licences pl
      where pl.user_id = v_user_id and pl.body_id = v_body
        and pl.status in ('declared', 'verified')
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
      from public.compute_accreditation_credit(v_reg.id, v_user_id, v_role_codes, grp);

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
$$;

-- Grant posture unchanged from 20260826000000: service_role only.
revoke all on function public.award_attendance_credit(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.award_attendance_credit(uuid, text, uuid, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  -- Grants
  if has_function_privilege('anon',
       'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'stage-b4 self-check: anon must not be executable';
  end if;
  if has_function_privilege('authenticated',
       'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'stage-b4 self-check: authenticated must not be executable';
  end if;
  if not has_function_privilege('service_role',
       'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'stage-b4 self-check: service_role lost EXECUTE — the app path would break';
  end if;

  -- Structural: the four new skip codes are compiled into the function body.
  -- If a future edit removes one silently, this fails fast.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='award_attendance_credit'
     and pg_get_function_identity_arguments(p.oid) = 'p_event_id uuid, p_registration_code text, p_actor_id uuid, p_enforce_full_setup boolean';
  if v_def is null then
    raise exception 'stage-b4 self-check: 4-arity award_attendance_credit not found';
  end if;
  if v_def not like '%skipped:registration_unlinked%' then
    raise exception 'stage-b4 self-check: registration_unlinked missing';
  end if;
  if v_def not like '%skipped:email_unverified%' then
    raise exception 'stage-b4 self-check: email_unverified missing';
  end if;
  if v_def not like '%skipped:missing_consents%' then
    raise exception 'stage-b4 self-check: missing_consents missing';
  end if;
  if v_def not like '%skipped:profile_incomplete%' then
    raise exception 'stage-b4 self-check: profile_incomplete missing';
  end if;

  -- Structural: consent versions match lib/legalVersions.ts today. Update
  -- the version literals in both files in lockstep.
  if v_def not like '%pp-0.2-draft%' or v_def not like '%tos-0.1-draft%' then
    raise exception 'stage-b4 self-check: consent version pins drifted from lib/legalVersions.ts';
  end if;

  raise notice 'stage-b4 self-check: all assertions passed';
end $$;
