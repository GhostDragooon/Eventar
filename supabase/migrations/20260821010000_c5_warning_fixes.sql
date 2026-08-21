-- Bundles the WARNING-level fixes from dev-lens review of Task 10.8/10.9 C5
-- (all verified live by the reviewing agent before this migration was written):
--
--   1. check_accreditation_tie's ambiguous-schedule raise carried no `detail`,
--      so the TS translator's generic 22023 branch told an organiser
--      "credits have already been issued" — false, and sent them down the
--      wrong recovery path (raise a correction) for what is actually a
--      config mistake (two schedule rows covering the same days) they need
--      to fix by unticking a day. Same discipline 20260820010000 already
--      applied to the cross-event-occurrence case.
--   2. remove_registration_role and unlink_accreditation_occurrence wrote a
--      "removed" audit event even when nothing was removed (role never set /
--      link never existed) — a false statement into K2's hash chain, whose
--      entire job is "can anyone silently change the past" (rule 12). Their
--      sibling remove_* functions already guard with `if not found`; this
--      brings the other two in line.
--   3. link_accreditation_occurrence had no ON CONFLICT guard, so a
--      double-click / second tab raised a bare 23505 the translator has no
--      branch for. Its sibling set_registration_role chose idempotency;
--      matching that here rather than leaving one write path inconsistent.

-- ---------------------------------------------------------------------------
-- 1. check_accreditation_tie — add detail = 'ambiguous_schedule'.
-- ---------------------------------------------------------------------------
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
      using errcode = '22023', detail = 'ambiguous_schedule';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2a. remove_registration_role — no-op guard.
-- ---------------------------------------------------------------------------
create or replace function public.remove_registration_role(
  p_registration_id uuid,
  p_role_code text,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_deleted boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select e.created_by into v_owner
    from public.registrations r join public.events e on e.id = r.event_id
   where r.id = p_registration_id;
  if not found then
    raise exception 'remove_registration_role: registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'remove_registration_role: not the owner of the event behind registration %', p_registration_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  delete from public.registration_roles where registration_id = p_registration_id and role_code = p_role_code;
  get diagnostics v_deleted = row_count;
  if not v_deleted then
    return;
  end if;

  perform public.write_audit_event(
    p_event_type := 'registration_role_removed', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'registration', p_subject_id := p_registration_id,
    p_payload := jsonb_build_object('role_code', p_role_code)
  );
end;
$$;
revoke execute on function public.remove_registration_role(uuid, text, uuid) from public, anon;
grant execute on function public.remove_registration_role(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2b + 3. unlink_accreditation_occurrence (no-op guard) and
-- link_accreditation_occurrence (ON CONFLICT DO NOTHING + no-op guard).
-- ---------------------------------------------------------------------------
create or replace function public.link_accreditation_occurrence(
  p_accreditation_id uuid,
  p_occurrence_id uuid,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor          public.staff%rowtype;
  v_owner        uuid;
  v_event        uuid;
  v_occ_event    uuid;
  v_inserted     boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select e.created_by, e.id into v_owner, v_event
    from public.event_accreditations a
    join public.event_accreditation_groups g on g.id = a.accreditation_group_id
    join public.events e on e.id = g.event_id
   where a.id = p_accreditation_id for update of e;
  if not found then
    raise exception 'link_accreditation_occurrence: accreditation % not found', p_accreditation_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'link_accreditation_occurrence: not the owner of the event behind accreditation %', p_accreditation_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  select event_id into v_occ_event from public.event_occurrences where id = p_occurrence_id;
  if not found then
    raise exception 'link_accreditation_occurrence: occurrence % not found', p_occurrence_id using errcode = 'P0002';
  end if;
  if v_occ_event is distinct from v_event then
    raise exception 'link_accreditation_occurrence: occurrence % does not belong to event % behind accreditation %',
      p_occurrence_id, v_event, p_accreditation_id using errcode = '22023', detail = 'cross_event_occurrence';
  end if;

  insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
  values (p_accreditation_id, p_occurrence_id)
  on conflict (accreditation_id, occurrence_id) do nothing;
  get diagnostics v_inserted = row_count;
  if not v_inserted then
    return;
  end if;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_occurrence_linked', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('occurrence_id', p_occurrence_id, 'event_id', v_event)
  );
end;
$$;
revoke execute on function public.link_accreditation_occurrence(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_accreditation_occurrence(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.unlink_accreditation_occurrence(
  p_accreditation_id uuid,
  p_occurrence_id uuid,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor      public.staff%rowtype;
  v_owner    uuid;
  v_event    uuid;
  v_deleted  boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select e.created_by, e.id into v_owner, v_event
    from public.event_accreditations a
    join public.event_accreditation_groups g on g.id = a.accreditation_group_id
    join public.events e on e.id = g.event_id
   where a.id = p_accreditation_id for update of e;
  if not found then
    raise exception 'unlink_accreditation_occurrence: accreditation % not found', p_accreditation_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'unlink_accreditation_occurrence: not the owner of the event behind accreditation %', p_accreditation_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  delete from public.event_accreditation_occurrences
   where accreditation_id = p_accreditation_id and occurrence_id = p_occurrence_id;
  get diagnostics v_deleted = row_count;
  if not v_deleted then
    return;
  end if;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_occurrence_unlinked', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('occurrence_id', p_occurrence_id, 'event_id', v_event)
  );
end;
$$;
revoke execute on function public.unlink_accreditation_occurrence(uuid, uuid, uuid) from public, anon;
grant execute on function public.unlink_accreditation_occurrence(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.remove_registration_role(uuid, text, uuid)',
    'public.link_accreditation_occurrence(uuid, uuid, uuid)',
    'public.unlink_accreditation_occurrence(uuid, uuid, uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '%: anon must not be executable', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: lost a grant it needs', v_fn;
    end if;
  end loop;
  raise notice 'c5_warning_fixes self-check: grant assertions passed';
end $$;

-- Rollback: create or replace each of the four functions above restoring their
-- prior bodies from 20260815020000 / 20260815030000 / 20260820000000 /
-- 20260820010000 (drop the detail field, the no-op guards, and ON CONFLICT).
