-- Task 10.8/10.9, sub-task C5 (backend half) — the multi-body organiser
-- write API. C3 (20260815020000) created event_accreditation_groups /
-- event_accreditations / event_accreditation_occurrences / registration_roles
-- as definer-only tables with NO writer except set_event_cpd_config's
-- single-body compatibility bridge. This migration adds the granular CRUD
-- functions an organiser needs to configure more than one group per event —
-- the piece C3's own header comment named as "not this task".
-- Design authority: docs/adr/0002-multi-body-accreditation.md.
--
-- Ownership/role gate matches set_event_cpd_config exactly for the four
-- config-shaping functions (organiser_admin owner, or eventar_staff any
-- event) — same trust boundary, since this is that function's direct
-- extension. registration_roles' two functions additionally allow
-- organiser_member, matching mark_attended's roster-operational precedent
-- (assigning who chaired/presented is a day-of roster action, not a
-- financial-config one).
--
-- Freeze is NOT duplicated here. C3's freeze_*_if_credited triggers already
-- fire BEFORE INSERT/UPDATE/DELETE on all three config tables and raise
-- 22023 the moment any credit_ledger row exists for the event — every
-- function below relies on that instead of re-checking, matching the layer
-- where the write actually happens. registration_roles carries no freeze
-- (correcting who did what doesn't retroactively change an already-posted
-- ledger snapshot, only future computation).
--
-- One check that is NOT free from the schema: nothing stops a caller linking
-- an occurrence from a DIFFERENT event to an accreditation row. link/unlink
-- validate occurrence.event_id = the accreditation's own event explicitly.

-- ---------------------------------------------------------------------------
-- event_accreditation_groups
-- ---------------------------------------------------------------------------
create function public.add_event_accreditation_group(
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
  returning * into v_row;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_group_added', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation_group', p_subject_id := v_row.id,
    p_payload := jsonb_build_object('event_id', p_event_id, 'body_id', p_body_id, 'award_scheme', p_award_scheme)
  );
  return v_row;
end;
$$;
revoke execute on function public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid) to authenticated, service_role;

create function public.remove_event_accreditation_group(
  p_group_id uuid,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_event uuid;
  v_body  uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select e.created_by, e.id, g.body_id into v_owner, v_event, v_body
    from public.event_accreditation_groups g join public.events e on e.id = g.event_id
   where g.id = p_group_id for update of e;
  if not found then
    raise exception 'remove_event_accreditation_group: group % not found', p_group_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'remove_event_accreditation_group: not the owner of event %', v_event
      using errcode = '42501', detail = 'not_owner';
  end if;

  delete from public.event_accreditation_groups where id = p_group_id;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_group_removed', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation_group', p_subject_id := p_group_id,
    p_payload := jsonb_build_object('event_id', v_event, 'body_id', v_body)
  );
end;
$$;
revoke execute on function public.remove_event_accreditation_group(uuid, uuid) from public, anon;
grant execute on function public.remove_event_accreditation_group(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- event_accreditations (schedule rows within a group)
-- ---------------------------------------------------------------------------
create function public.add_event_accreditation_row(
  p_group_id uuid,
  p_credit_value numeric,
  p_actor_override uuid default null
) returns public.event_accreditations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_row   public.event_accreditations;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select e.created_by into v_owner
    from public.event_accreditation_groups g join public.events e on e.id = g.event_id
   where g.id = p_group_id for update of e;
  if not found then
    raise exception 'add_event_accreditation_row: group % not found', p_group_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'add_event_accreditation_row: not the owner of the event behind group %', p_group_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  insert into public.event_accreditations (accreditation_group_id, credit_value)
  values (p_group_id, p_credit_value)
  returning * into v_row;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_row_added', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := v_row.id,
    p_payload := jsonb_build_object('accreditation_group_id', p_group_id, 'credit_value', p_credit_value)
  );
  return v_row;
end;
$$;
revoke execute on function public.add_event_accreditation_row(uuid, numeric, uuid) from public, anon;
grant execute on function public.add_event_accreditation_row(uuid, numeric, uuid) to authenticated, service_role;

create function public.remove_event_accreditation_row(
  p_accreditation_id uuid,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_group uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select e.created_by, g.id into v_owner, v_group
    from public.event_accreditations a
    join public.event_accreditation_groups g on g.id = a.accreditation_group_id
    join public.events e on e.id = g.event_id
   where a.id = p_accreditation_id for update of e;
  if not found then
    raise exception 'remove_event_accreditation_row: accreditation % not found', p_accreditation_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'remove_event_accreditation_row: not the owner of the event behind accreditation %', p_accreditation_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  delete from public.event_accreditations where id = p_accreditation_id;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_row_removed', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('accreditation_group_id', v_group)
  );
end;
$$;
revoke execute on function public.remove_event_accreditation_row(uuid, uuid) from public, anon;
grant execute on function public.remove_event_accreditation_row(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- event_accreditation_occurrences (links) — the only pair that also has to
-- validate cross-table consistency the schema itself doesn't enforce: an
-- occurrence FK alone doesn't guarantee it belongs to the SAME event as the
-- accreditation it's being linked to.
-- ---------------------------------------------------------------------------
create function public.link_accreditation_occurrence(
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
      p_occurrence_id, v_event, p_accreditation_id using errcode = '22023';
  end if;

  insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
  values (p_accreditation_id, p_occurrence_id);

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_occurrence_linked', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('occurrence_id', p_occurrence_id, 'event_id', v_event)
  );
end;
$$;
revoke execute on function public.link_accreditation_occurrence(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_accreditation_occurrence(uuid, uuid, uuid) to authenticated, service_role;

create function public.unlink_accreditation_occurrence(
  p_accreditation_id uuid,
  p_occurrence_id uuid,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_event uuid;
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
-- registration_roles — organiser_member included (roster-operational, not
-- financial-config; matches mark_attended's precedent). No freeze: correcting
-- who did what doesn't retroactively change an already-posted ledger row.
-- ---------------------------------------------------------------------------
create function public.set_registration_role(
  p_registration_id uuid,
  p_role_code text,
  p_actor_override uuid default null
) returns public.registration_roles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_row   public.registration_roles;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select e.created_by into v_owner
    from public.registrations r join public.events e on e.id = r.event_id
   where r.id = p_registration_id;
  if not found then
    raise exception 'set_registration_role: registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'set_registration_role: not the owner of the event behind registration %', p_registration_id
      using errcode = '42501', detail = 'not_owner';
  end if;

  insert into public.registration_roles (registration_id, role_code, assigned_by)
  values (p_registration_id, p_role_code, actor.id)
  on conflict (registration_id, role_code) do nothing
  returning * into v_row;

  if v_row.registration_id is null then
    select * into v_row from public.registration_roles
     where registration_id = p_registration_id and role_code = p_role_code;
  else
    perform public.write_audit_event(
      p_event_type := 'registration_role_set', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
      p_organisation_id := actor.organisation_id, p_subject_type := 'registration', p_subject_id := p_registration_id,
      p_payload := jsonb_build_object('role_code', p_role_code)
    );
  end if;
  return v_row;
end;
$$;
revoke execute on function public.set_registration_role(uuid, text, uuid) from public, anon;
grant execute on function public.set_registration_role(uuid, text, uuid) to authenticated, service_role;

create function public.remove_registration_role(
  p_registration_id uuid,
  p_role_code text,
  p_actor_override uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
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
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid)',
    'public.remove_event_accreditation_group(uuid, uuid)',
    'public.add_event_accreditation_row(uuid, numeric, uuid)',
    'public.remove_event_accreditation_row(uuid, uuid)',
    'public.link_accreditation_occurrence(uuid, uuid, uuid)',
    'public.unlink_accreditation_occurrence(uuid, uuid, uuid)',
    'public.set_registration_role(uuid, text, uuid)',
    'public.remove_registration_role(uuid, text, uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '%: anon must not be executable', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: lost a grant it needs', v_fn;
    end if;
  end loop;

  raise notice 'multi_body_accreditation_crud self-check: all grant assertions passed';
end $$;

-- Rollback:
--   drop function public.remove_registration_role(uuid, text, uuid);
--   drop function public.set_registration_role(uuid, text, uuid);
--   drop function public.unlink_accreditation_occurrence(uuid, uuid, uuid);
--   drop function public.link_accreditation_occurrence(uuid, uuid, uuid);
--   drop function public.remove_event_accreditation_row(uuid, uuid);
--   drop function public.add_event_accreditation_row(uuid, numeric, uuid);
--   drop function public.remove_event_accreditation_group(uuid, uuid);
--   drop function public.add_event_accreditation_group(uuid, uuid, text, text, text, uuid);
