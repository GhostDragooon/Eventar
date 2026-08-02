-- M2 unfreeze — make the CPD backend reachable from the organiser UI.
--
-- THE HOLE THIS CLOSES: nothing in app/ or components/ read or wrote
-- events.accrediting_body_id / events.cpd_hours. Eventar is a CPD platform in
-- which no organiser could make an event CPD-accredited through the product —
-- every credit ever issued came from a seed script. award_attendance_credit(),
-- the freeze trigger and the whole ledger were live but unreachable.
--
-- WHY A DEFINER FUNCTION AND NOT A COLUMN GRANT: the 2026-07-25 review
-- (HIGH-1b, migration 20260725144446) revoked UPDATE on exactly these two
-- columns from authenticated, because an organiser could PATCH their own event
-- to bind ANY accrediting body with any hours, and every registrant holding a
-- verified licence at that body then earned a permanent, regulator-facing
-- credit the body never authorised. Re-granting the columns would reopen that
-- verbatim. Instead this follows the block-architecture fitting rule for every
-- trusted-record mutation: an audited SECURITY DEFINER function, role-gated,
-- actor derived server-side, audit insert last.
--
-- NOTE for whoever reads 20260725144446 next: its comment asserts the organiser
-- edit path is "the update_event_with_blocks SECURITY DEFINER RPC (runs as the
-- owner)". That is wrong — both create_event_with_blocks and
-- update_event_with_blocks are SECURITY INVOKER (verified live on Seoul). Its
-- conclusion still holds, but for a different reason: the migration re-granted
-- column-level UPDATE on every OTHER column, so the invoker RPC keeps working.
-- Do not rely on that comment's DEFINER claim.
--
-- WHAT THIS DOES NOT DO: it does not establish that the accrediting body has
-- APPROVED the accreditation. An organiser still self-asserts body + hours;
-- this makes the action role-gated, bounded, audited and reversible-until-
-- credited instead of impossible. The real approval workflow (submission,
-- reference number, body confirmation) is B3 / Milestone C, gated on the body
-- review — see docs/plans/2026-08-01-m2-frontend-unfreeze.md.

create or replace function public.set_event_cpd_config(
  p_event_id  uuid,
  p_body_id   uuid,      -- null (with null hours) clears the accreditation
  p_cpd_hours numeric
) returns public.events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.staff%rowtype;
  v_row public.events;
  v_owner uuid;
begin
  -- Role gate. organiser_member is deliberately excluded: binding an event to
  -- an accrediting body is the act that mints regulator-facing credit.
  actor := app_private.require_active_staff('organiser_admin', 'eventar_staff');

  -- Both-or-neither. A body with no hours (or hours with no body) is a
  -- half-configured event that award_attendance_credit silently skips — the
  -- organiser would believe the event was accredited and no credit would post.
  if (p_body_id is null) <> (p_cpd_hours is null) then
    raise exception 'set_event_cpd_config: accrediting body and CPD hours must be set together, or both cleared'
      using errcode = '22023';
  end if;

  select created_by into v_owner from public.events where id = p_event_id for update;
  if not found then
    raise exception 'set_event_cpd_config: event % not found', p_event_id
      using errcode = 'P0002';
  end if;

  -- Owner-exclusive, mirroring events_organizer_update_own. A definer function
  -- bypasses RLS, so the ownership check MUST live in the body or any
  -- organiser_admin could accredit any tenant's event. eventar_staff (platform
  -- staff) is the deliberate exception, same precedent as mark_attended.
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'set_event_cpd_config: not the owner of event %', p_event_id
      using errcode = '42501';
  end if;

  -- The body must exist AND be active: binding to an onboarding or retired body
  -- would mint credits against a body that cannot honour them.
  if p_body_id is not null and not exists (
    select 1 from public.accrediting_bodies b where b.id = p_body_id and b.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: accrediting body % is not an active body', p_body_id
      using errcode = 'P0002';
  end if;

  -- events_cpd_hours_check (> 0 and <= 24) bounds the value at the DB layer;
  -- freeze_cpd_config_if_credited() raises 22023 if the ledger already
  -- references this event. Both are left to fire rather than duplicated here.
  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
  returning * into v_row;

  -- Audit LAST (hard rule: the chain trigger holds the advisory lock to commit).
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

-- Grant hygiene (Hard Rule 11 discipline): revoke the schema-wide default ACL
-- first — revoking a named role is a no-op while bare PUBLIC still holds it —
-- then grant EXECUTE only to the roles that actually call it.
revoke all on function public.set_event_cpd_config(uuid, uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.set_event_cpd_config(uuid, uuid, numeric)
  to authenticated, service_role;
