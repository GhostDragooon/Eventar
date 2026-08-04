-- 2026-08-04 — Stage 7: roster licence eligibility.
--
-- THE GAP. award_attendance_credit() resolves identity at AWARD time
-- (registration email → auth.users → verified licence at the event's body).
-- There is no READ-time equivalent, so nothing anywhere tells an operator that
-- a given registrant's credit will silently never post. The 2026-08-01
-- frontend↔backend map called this out: "that one missing view is what nearly
-- every organiser eligibility feature depends on." The 2026-08-04 user-lens
-- review reached the same place from the other end — a practitioner without a
-- verified licence checks in, sees unqualified success, and discovers at audit
-- that no credit exists. Newly sharper now that self-serve check-in is
-- settable, because that is the configuration where NO human observes the skip.
--
-- WHY A DEFINER FUNCTION AND NOT AN RLS READ. Verified 2026-08-02 and
-- re-verified here: `registrations` has no `user_id` (only `email`),
-- `public.users` has no email column, email lives ONLY in `auth.users` (not
-- readable from PostgREST at all), and `practitioner_licences` carries only
-- self-read + body_admin_read policies — organiser staff have NO read policy on
-- it. Every hop of the identity chain is invisible to an organiser's session,
-- so this cannot be a join in the page query.
--
-- NO PII CROSSES THE BOUNDARY (Hard Rule 10). The function returns
-- registration_id plus an enum, nothing else — no email, no licence number, no
-- body, no name. The caller already has the roster rows and joins on
-- registration_id client-side. An organiser learns "this person's credit will
-- not post", never "this person holds licence X at body Y", which is
-- cross-tenant information they have no claim to.
--
-- THE ENUM MIRRORS award_attendance_credit's SKIP REASONS ON PURPOSE. It is a
-- prediction of what that function will do, and a prediction that can drift
-- from the decision it predicts is worse than none. Anything that changes there
-- must change here — the two are checked against each other by
-- tests/cpd/roster_eligibility.rls.test.ts, which drives a real check-in and
-- asserts the prediction matched the outcome.
--
-- `verified`, never `active`: the same mistake already required corrective
-- migration 20260724170650.

create or replace function public.event_registration_eligibility(p_event_id uuid)
returns table (registration_id uuid, eligibility text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor   public.staff%rowtype;
  v_event public.events%rowtype;
begin
  -- Same gate and same owner-exclusivity as mark_attended: this is the
  -- check-in roster's data, and a definer bypasses RLS, so the ownership check
  -- MUST live in the body or any organiser could enumerate another tenant's
  -- roster state.
  actor := app_private.require_active_staff('organiser_admin','organiser_member','eventar_staff');

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_registration_eligibility: event % not found', p_event_id
      using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_event.created_by <> actor.id then
    raise exception 'event_registration_eligibility: not the owner of event %', p_event_id
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    case
      -- Event-level first: on a non-CPD event NOBODY earns credit, and saying
      -- "no licence" per person there would be noise implying a fixable
      -- problem.
      when v_event.accrediting_body_id is null or coalesce(v_event.cpd_hours, 0) <= 0
        then 'not_cpd'
      when r.status = 'cancelled' then 'cancelled'
      when u.id is null then 'no_account'
      when l.id is null then 'no_licence'
      else 'eligible'
    end
  from public.registrations r
  left join auth.users u
    on lower(u.email) = lower(trim(r.email))
  left join lateral (
    select pl.id from public.practitioner_licences pl
     where pl.user_id = u.id
       and pl.body_id = v_event.accrediting_body_id
       and pl.status = 'verified'
     order by pl.created_at desc
     limit 1
  ) l on true
  where r.event_id = p_event_id;
end;
$$;

comment on function public.event_registration_eligibility(uuid) is
  'Read-time prediction of whether each registrant''s attendance will post a CPD credit. Returns registration_id + enum only — no PII. Mirrors award_attendance_credit''s skip reasons.';

revoke all on function public.event_registration_eligibility(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.event_registration_eligibility(uuid)
  to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon','public.event_registration_eligibility(uuid)','EXECUTE') then
    raise exception 'roster eligibility is anon-executable';
  end if;
  if not has_function_privilege('authenticated','public.event_registration_eligibility(uuid)','EXECUTE') then
    raise exception 'roster eligibility is not reachable by staff';
  end if;
  -- The whole point is that it leaks nothing: assert the return shape is
  -- exactly (registration_id, eligibility).
  if (select count(*)
        from pg_proc p
        join pg_namespace ns on ns.oid = p.pronamespace,
             unnest(p.proargnames) as n
       where ns.nspname = 'public'
         and p.proname = 'event_registration_eligibility'
         and n in ('registration_id', 'eligibility')) <> 2 then
    raise exception 'roster eligibility return shape changed — check for PII';
  end if;
end $$;

-- Rollback: drop function public.event_registration_eligibility(uuid);
