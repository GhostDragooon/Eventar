-- WP-A — F3 gate widen: specialty required alongside workplace/position/
-- profession for CPD credit release.
-- Plan Phase 3. B2->B3 block-contract change (widens what "profile
-- complete" means for credit release) — logged in Decisions Log per the
-- block architecture change-control tiers.
--
-- Department is deliberately NOT added here — it is required at account
-- creation (UI/completion-gate concern) but is organisational-structure
-- metadata, not CPD identity, so it does not gate credit release.
--
-- Only the F3 block of award_attendance_credit changes; everything else in
-- this function body is copied verbatim from 20260829120000 so the
-- create-or-replace doesn't silently drop unrelated logic.

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

    -- F3: professional_profiles row + workplace + position + profession +
    -- specialty. workplace_text or workplace_organisation_id counts;
    -- position_code or position_other counts; specialty_code or
    -- specialty_other counts (added 20260916 — write-up §5 makes specialty
    -- first-class professional identity, not an afterthought).
    -- profession_code must be present.
    select * into v_pp
      from public.professional_profiles pp where pp.user_id = v_user_id;
    if not found then
      body_id := null; outcome := 'skipped:profile_incomplete'; return next; return;
    end if;
    if (coalesce(nullif(v_pp.workplace_text, ''), null) is null
          and v_pp.workplace_organisation_id is null)
       or (coalesce(nullif(v_pp.position_code, ''), null) is null
             and coalesce(nullif(v_pp.position_other, ''), null) is null)
       or coalesce(nullif(v_pp.profession_code, ''), null) is null
       or (coalesce(nullif(v_pp.specialty_code, ''), null) is null
             and coalesce(nullif(v_pp.specialty_other, ''), null) is null) then
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

-- Grant posture unchanged: service_role only.
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
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='award_attendance_credit'
     and pg_get_function_identity_arguments(p.oid) = 'p_event_id uuid, p_registration_code text, p_actor_id uuid, p_enforce_full_setup boolean';
  if v_def is null then
    raise exception 'f3-gate-widen self-check: award_attendance_credit not found';
  end if;
  if v_def not like '%v_pp.specialty_code%' or v_def not like '%v_pp.specialty_other%' then
    raise exception 'f3-gate-widen self-check: specialty check missing from F3 block';
  end if;
  if has_function_privilege('anon', 'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'f3-gate-widen self-check: anon/authenticated must not be able to execute';
  end if;
  if not has_function_privilege('service_role', 'public.award_attendance_credit(uuid, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'f3-gate-widen self-check: service_role lost EXECUTE';
  end if;
end $$;
