-- CRITICAL fix, found by dev-lens review of Task 10.8/10.9 C5 (verified live
-- by the reviewing agent, then reproduced and confirmed here before this
-- migration was written): set_event_cpd_config's compatibility bridge
-- (20260815020000) does an unconditional
--   delete from public.event_accreditation_groups where event_id = p_event_id
-- before re-inserting its own degenerate one-group shape. That premise held
-- when the only writer of these tables WAS this function. C5
-- (20260820000000) added a second writer — the wizard's granular CRUD
-- functions — and CpdAccreditationSection + MultiBodyAccreditationWizard are
-- rendered as sibling sections on the same page. Saving the legacy
-- single-body form after the wizard has built a real multi-body config
-- silently deletes every group the wizard built, with no warning in either
-- UI and no trace in the audit payload beyond the ordinary
-- 'event_cpd_config_set' entry (which does not mention what was destroyed).
-- Since credit posts eagerly at check-in from these rows, this silently
-- changes what an attendee is owed.
--
-- Fix, at the write layer per CLAUDE.md rule 14 / this repo's own six prior
-- instances of "a control one layer above where the write happens": refuse
-- the legacy sync when the existing groups are NOT exactly what the
-- compatibility bridge itself would have produced. The one legitimate
-- ongoing use of this form — changing WHICH single body an otherwise-plain
-- event is accredited by — must keep working, so the check does NOT compare
-- body_id (that is exactly the field this function is allowed to change).
-- It blocks on the three shapes only the wizard can produce: more than one
-- group, a non-null category_code, a non-proportional award_scheme, or more
-- than one schedule row under a group (the last closes the sibling bug
-- where a proportional group could otherwise silently accept >1 row).
create or replace function public.set_event_cpd_config(
  p_event_id uuid,
  p_body_id uuid,
  p_cpd_hours numeric,
  p_actor_override uuid default null::uuid
) returns events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor              public.staff%rowtype;
  v_row              public.events;
  v_owner            uuid;
  v_event_org        uuid;
  v_group_id         uuid;
  v_accreditation_id uuid;
  v_group_count      integer;
  v_bridge_shaped     boolean;
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

  if exists (select 1 from public.credit_ledger where event_id = p_event_id) then
    raise exception 'set_event_cpd_config: cannot change accreditation for event % — credit already issued', p_event_id
      using errcode = '22023';
  end if;

  -- Multi-body guard (this migration). Must run before the delete below.
  --
  -- CORRECTED TWICE during this same migration's own drafting, both caught
  -- live before it ever reached Seoul:
  --   (1) the first version blocked only when a group's accreditation-row
  --       count was > 1. A wizard group in ITS OWN Step 1 state — added,
  --       zero schedule rows yet — has row count 0, neither >1 nor the
  --       bridge's own always-exactly-1-row output, so it read as "safe"
  --       and this exact save silently deleted it.
  --   (2) the fix for (1) checked "does ANY group match the bridge's exact
  --       shape" via a bare EXISTS, which a real second wizard group could
  --       still slip past: with 2 groups present, if EITHER one happened to
  --       match the degenerate shape, the EXISTS was true and the guard
  --       passed the whole event, deleting the OTHER real group. Group
  --       COUNT must be checked explicitly, not inferred from EXISTS.
  --
  -- The correct predicate: safe only when EXACTLY ZERO groups exist, or
  -- EXACTLY ONE exists and that one is indistinguishable from what the
  -- bridge itself would produce — category null, proportional, exactly one
  -- accreditation row, linked to every one of the event's occurrences.
  select count(*) into v_group_count from public.event_accreditation_groups where event_id = p_event_id;

  v_bridge_shaped := v_group_count = 1 and exists (
    select 1 from public.event_accreditation_groups g
     where g.event_id = p_event_id
       and g.category_code is null
       and g.award_scheme = 'proportional'
       and (select count(*) from public.event_accreditations a where a.accreditation_group_id = g.id) = 1
       and (
         select count(*) from public.event_accreditation_occurrences eao
         join public.event_accreditations a on a.id = eao.accreditation_id
         where a.accreditation_group_id = g.id
       ) = (select count(*) from public.event_occurrences eo where eo.event_id = p_event_id)
  );

  if v_group_count > 0 and not v_bridge_shaped then
    raise exception 'set_event_cpd_config: event % carries a multi-body accreditation configuration built via the wizard — use that to change accreditation instead', p_event_id
      using errcode = '42501', detail = 'multi_body_configured';
  end if;

  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
   returning * into v_row;

  delete from public.event_accreditation_groups where event_id = p_event_id;

  if p_body_id is not null then
    insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
    values (p_event_id, p_body_id, null, null, 'proportional')
    returning id into v_group_id;

    insert into public.event_accreditations (accreditation_group_id, credit_value)
    values (v_group_id, p_cpd_hours)
    returning id into v_accreditation_id;

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
$$;

revoke execute on function public.set_event_cpd_config(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.set_event_cpd_config(uuid, uuid, numeric, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions — live round-trip proving the guard actually
-- blocks a real multi-body config and does not block a plain single-body
-- body change. resolve_actor's override branch requires
-- auth.role() = 'service_role', which a migration's own executing role
-- never carries by default (same limitation 20260814020000 documented) —
-- simulated here via the same GUC PostgREST sets from a real service-role
-- JWT, so this self-check can exercise the actual override path instead of
-- only being provable later from tests/rls/*.rls.test.ts.
-- ---------------------------------------------------------------------------
set request.jwt.claim.role = 'service_role';
do $$
declare
  v_staff_id   uuid;
  v_body1_id   uuid;
  v_body2_id   uuid;
  v_event_id   uuid;
  v_org        uuid := '00000000-0000-0000-0000-000000000001';
  v_group1_id  uuid;
  v_blocked    boolean := false;
begin
  if not has_function_privilege('authenticated', 'public.set_event_cpd_config(uuid, uuid, numeric, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.set_event_cpd_config(uuid, uuid, numeric, uuid)', 'EXECUTE') then
    raise exception 'set_event_cpd_config lost a grant it needs';
  end if;

  select id into v_staff_id from public.staff where status = 'active' and role in ('organiser_admin', 'eventar_staff') limit 1;
  if v_staff_id is null then
    raise notice 'multi-body guard self-check skipped: no active staff row on this database yet';
    return;
  end if;

  insert into public.accrediting_bodies (organisation_id, short_name, full_name, status, cycle_config, category_taxonomy)
  values (v_org, 'MIG-GUARD-1', 'Migration self-check body 1', 'active', '{}', '{}') returning id into v_body1_id;
  insert into public.accrediting_bodies (organisation_id, short_name, full_name, status, cycle_config, category_taxonomy)
  values (v_org, 'MIG-GUARD-2', 'Migration self-check body 2', 'active', '{}', '{}') returning id into v_body2_id;
  insert into public.organisation_body_authorisations (organisation_id, body_id, status) values (v_org, v_body1_id, 'active');
  insert into public.organisation_body_authorisations (organisation_id, body_id, status) values (v_org, v_body2_id, 'active');

  insert into public.events (
    title, start_time, end_time, timezone, created_by, organisation_id,
    venue_name, city, country, latitude, longitude, status
  ) values (
    'Migration self-check guard event — DELETE ME', now(), now() + interval '1 hour', 'Asia/Hong_Kong',
    v_staff_id, v_org, 'Test Venue', 'Hong Kong', 'HK', 22.3, 114.2, 'draft'
  ) returning id into v_event_id;

  -- 1. Plain single-body save must still work (the legitimate ongoing use).
  perform public.set_event_cpd_config(v_event_id, v_body1_id, 3, v_staff_id);
  if (select count(*) from public.event_accreditation_groups where event_id = v_event_id) <> 1 then
    raise exception 'guard self-check: plain single-body save did not produce exactly one group';
  end if;

  -- 2. Changing the body via the same form must still work (body_id is not part of the guard).
  perform public.set_event_cpd_config(v_event_id, v_body2_id, 4, v_staff_id);
  if not exists (select 1 from public.event_accreditation_groups where event_id = v_event_id and body_id = v_body2_id) then
    raise exception 'guard self-check: changing the single body via the legacy form was wrongly blocked';
  end if;

  -- 3. Build a real multi-body config via the wizard's own functions (a second group).
  perform public.add_event_accreditation_group(v_event_id, v_body1_id, null, 'hours', 'proportional', v_staff_id);

  -- 4. The legacy form must now refuse to touch this event at all.
  begin
    perform public.set_event_cpd_config(v_event_id, v_body2_id, 5, v_staff_id);
  exception when sqlstate '42501' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'guard self-check: legacy set_event_cpd_config did NOT block a real multi-body config — the bug this migration fixes is still open';
  end if;
  if (select count(*) from public.event_accreditation_groups where event_id = v_event_id) <> 2 then
    raise exception 'guard self-check: the multi-body groups were destroyed despite the block';
  end if;

  -- 5. THE REGRESSION THIS MIGRATION ITSELF SHIPPED AND FIXED, caught live
  -- via the browser before this migration was ever pushed: a single wizard
  -- group in its OWN Step 1 state (added, zero schedule rows, zero
  -- occurrence links yet — the organiser hasn't reached Step 2) must also
  -- block the legacy form. The first draft of this guard only checked
  -- "row count > 1", which a zero-row group trivially satisfies as "safe",
  -- and the legacy save silently deleted it.
  declare
    v_event2_id uuid;
    v_blocked2  boolean := false;
  begin
    insert into public.events (
      title, start_time, end_time, timezone, created_by, organisation_id,
      venue_name, city, country, latitude, longitude, status
    ) values (
      'Migration self-check zero-row-group event — DELETE ME', now(), now() + interval '1 hour', 'Asia/Hong_Kong',
      v_staff_id, v_org, 'Test Venue', 'Hong Kong', 'HK', 22.3, 114.2, 'draft'
    ) returning id into v_event2_id;

    perform public.add_event_accreditation_group(v_event2_id, v_body1_id, null, 'hours', 'proportional', v_staff_id);
    if (select count(*) from public.event_accreditations a join public.event_accreditation_groups g on g.id = a.accreditation_group_id where g.event_id = v_event2_id) <> 0 then
      raise exception 'guard self-check: test setup expected zero accreditation rows on the fresh wizard group';
    end if;

    begin
      perform public.set_event_cpd_config(v_event2_id, v_body2_id, 2, v_staff_id);
    exception when sqlstate '42501' then
      v_blocked2 := true;
    end;
    if not v_blocked2 then
      raise exception 'guard self-check: a zero-row wizard group did NOT block the legacy form — the exact regression this migration was corrected for is back';
    end if;

    delete from public.event_accreditation_groups where event_id = v_event2_id;
    delete from public.events where id = v_event2_id;
  end;

  delete from public.event_accreditation_groups where event_id = v_event_id;
  delete from public.events where id = v_event_id;
  delete from public.organisation_body_authorisations where body_id in (v_body1_id, v_body2_id);
  delete from public.accrediting_bodies where id in (v_body1_id, v_body2_id);

  raise notice 'set_event_cpd_config_multi_body_guard self-check: all assertions passed';
end $$;

-- Rollback: create or replace function public.set_event_cpd_config(...) restoring 20260815020000's body (drop the multi-body guard block).
