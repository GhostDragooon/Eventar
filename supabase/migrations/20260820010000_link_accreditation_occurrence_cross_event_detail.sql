-- Same-day follow-up to 20260820000000. Found while writing the TS error
-- translator that consumes this function: link_accreditation_occurrence's
-- own cross-event 22023 and the pre-existing freeze trigger's 22023
-- (freeze_accreditation_occurrences_if_credited, 20260815020000) are
-- indistinguishable to a caller — same SQLSTATE, no detail on either. The
-- codebase's own convention for exactly this ("same SQLSTATE, different
-- remedy") is a `detail` field, already used to split 42501 into
-- not_owner/not_authorised_for_body (set_event_cpd_config). Applying the
-- same discipline here rather than pattern-matching the raise message in TS.
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

do $$
begin
  if has_function_privilege('anon', 'public.link_accreditation_occurrence(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'link_accreditation_occurrence: anon must not be executable';
  end if;
  if not has_function_privilege('authenticated', 'public.link_accreditation_occurrence(uuid, uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.link_accreditation_occurrence(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'link_accreditation_occurrence: lost a grant it needs';
  end if;
  raise notice 'link_accreditation_occurrence_cross_event_detail self-check: passed';
end $$;

-- Rollback: create or replace function public.link_accreditation_occurrence(...) restoring 20260820000000's body (drop the `detail` argument on the cross-event raise).
