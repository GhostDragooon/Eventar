-- Dev-lens finding (post-C5 review): add_event_accreditation_group had no
-- guard against a double-submit (double-click, or a retried request after a
-- dropped response) creating two groups for the same (event_id, body_id).
-- Confirmed live: calling it twice with identical args produced 2 rows.
--
-- This is a real data-integrity gap, not just double-click hygiene: the
-- wizard's own add-body picker already treats "one group per body per
-- event" as a hard invariant (it filters an already-added body out of the
-- picker entirely), so the DB should enforce what the UI already assumes.
--
-- The stronger argument is that the LEDGER already enforces it downstream.
-- credit_ledger_attendance_uniq is unique on (user_id, event_id, body_id)
-- where entry_type = 'credit_earned' (verified against pg_indexes on a live
-- database, not read off a migration), so at most one earned-credit row per
-- practitioner per body per event can ever exist. Two groups for the same
-- body could therefore never both pay out: the second would raise a unique
-- violation and be swallowed by award_attendance_credit's per-group
-- `exception when unique_violation` handler, making WHICH group's terms win
-- depend on iteration order (the loop has no ORDER BY). This index turns
-- that silent, order-dependent skip into an explicit constraint at the
-- layer where the config is written.
-- add_event_accreditation_row is NOT touched here — a group legitimately
-- holds multiple rows (explicit_schedule's Day1/Day2/Both), so there is no
-- natural key to dedupe on, and the resulting risk is already bounded by
-- credit_ledger_attendance_uniq's per-(user,event,body) unique index inside
-- award_attendance_credit's per-group exception block (20260815030000).
--
-- Pattern mirrors set_registration_role (20260820000000): ON CONFLICT DO
-- NOTHING, then re-select the existing row and skip the audit write on the
-- no-op path — a retried add must not fabricate a second "group added"
-- audit event for a group that already existed.

do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select event_id, body_id from public.event_accreditation_groups
    group by event_id, body_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'accreditation_group_idempotent_add: % duplicate (event_id, body_id) pair(s) already exist — resolve before adding the unique index', v_dupes;
  end if;
end $$;

create unique index event_accreditation_groups_event_body_uniq
  on public.event_accreditation_groups (event_id, body_id);

create or replace function public.add_event_accreditation_group(
  p_event_id uuid,
  p_body_id uuid,
  p_category_code text,
  p_unit text,
  p_award_scheme text,
  p_actor_override uuid default null
) returns public.event_accreditation_groups
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor       public.staff%rowtype;
  v_owner     uuid;
  v_event_org uuid;
  v_row       public.event_accreditation_groups;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select created_by, organisation_id into v_owner, v_event_org
    from public.events where id = p_event_id for update;
  if not found then
    raise exception 'add_event_accreditation_group: event % not found', p_event_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'add_event_accreditation_group: not the owner of event %', p_event_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  if not exists (select 1 from public.accrediting_bodies b where b.id = p_body_id and b.status = 'active') then
    raise exception 'add_event_accreditation_group: accrediting body % is not an active body', p_body_id
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organisation_body_authorisations a
     where a.organisation_id = v_event_org and a.body_id = p_body_id and a.status = 'active'
  ) then
    raise exception 'add_event_accreditation_group: this organisation is not authorised to claim accreditation from body %', p_body_id
      using errcode = '42501', detail = 'not_authorised_for_body';
  end if;

  insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
  values (p_event_id, p_body_id, p_category_code, p_unit, p_award_scheme)
  on conflict (event_id, body_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.event_accreditation_groups
     where event_id = p_event_id and body_id = p_body_id;
  else
    perform public.write_audit_event(
      p_event_type := 'event_accreditation_group_added', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
      p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation_group', p_subject_id := v_row.id,
      p_payload := jsonb_build_object('event_id', p_event_id, 'body_id', p_body_id, 'award_scheme', p_award_scheme)
    );
  end if;
  return v_row;
end;
$$;
revoke execute on function public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid) to authenticated, service_role;

-- Self-verifying assertions.
do $$
begin
  if has_function_privilege('anon', 'public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid)', 'EXECUTE') then
    raise exception 'add_event_accreditation_group: anon must not be executable';
  end if;
  if not has_function_privilege('authenticated', 'public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid)', 'EXECUTE') then
    raise exception 'add_event_accreditation_group: lost a grant it needs';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'event_accreditation_groups'
       and indexname = 'event_accreditation_groups_event_body_uniq'
  ) then
    raise exception 'event_accreditation_groups_event_body_uniq: index missing';
  end if;
  raise notice 'accreditation_group_idempotent_add self-check: passed';
end $$;

-- Rollback:
--   create or replace function public.add_event_accreditation_group(...) restoring
--     the plain INSERT (no ON CONFLICT) from 20260820000000;
--   drop index public.event_accreditation_groups_event_body_uniq;
