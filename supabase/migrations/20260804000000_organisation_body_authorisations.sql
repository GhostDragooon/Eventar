-- 2026-08-04 — DEFERRED item 56: the organiser↔body authorisation model.
--
-- THE HOLE. set_event_cpd_config() (20260802022345) gates on the CALLER (role,
-- ownership) and on the BODY (exists, active). Nothing gated whether the
-- caller's ORGANISATION may legitimately claim a relationship with that body,
-- so an organiser could bind their own event to any active accrediting body and
-- self-assert accreditation — minting permanent, regulator-facing credit that
-- body never authorised. Reproduced live before this migration, as a real
-- organiser_admin JWT against an unrelated body: the RPC returned no error and
-- events.accrediting_body_id was set.
--
-- Not a security regression — every other gate held, the columns stayed locked,
-- and only the audited definer could write them. A missing PRODUCT model. It is
-- the first question an accrediting body's security review asks, and it blocks
-- the first real accredited event.
--
-- THE MODEL, deliberately minimal. An explicit allow-list: which organisation
-- may claim which body, with a status. Rows are written service-role-side for
-- the pilot. The approval workflow a body drives itself (organiser submits →
-- reference number → body confirms/suspends) is Stage 10 — inventing it now
-- would be guessing at a registry relationship before the body conversation.
--
-- BLOCK FIT (admission checklist, docs/architecture/BLOCK-ARCHITECTURE.md):
--   1. Block: B2 Professional Registry — it IS a registry relationship.
--   2. Writes: service-role only, gate read from inside the audited definer.
--      Reads: RLS, org-scoped.
--   3. Dependency direction: B2 owns it; B1's set_event_cpd_config reads it.
--      No kernel edit, no sideways write.
--   4. Kill story: rows are additive and the gate is one `exists` — drop the
--      clause to disable. Nothing is orphaned; no ledger row references this.
--   5. Re-entry: the body-driven approval workflow, Stage 10.
--   6. Critical path: yes — blocks the first real accredited event.

create table public.organisation_body_authorisations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  body_id         uuid not null references public.accrediting_bodies(id) on delete cascade,
  -- 'suspended' is distinct from 'revoked' on purpose: a body pausing an
  -- organiser mid-cycle is a different fact from ending the relationship, and
  -- the Stage 10 workflow needs to tell them apart. Only 'active' authorises.
  status          text not null default 'active'
                    check (status in ('active', 'suspended', 'revoked')),
  -- The body's own reference for the relationship (accreditation provider
  -- number, MOU id). Free text: every body numbers these differently, and
  -- guessing a structure before the body conversation is how the wrong model
  -- gets locked in.
  body_reference  text,
  authorised_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (organisation_id, body_id)
);

comment on table public.organisation_body_authorisations is
  'B2 registry: which organisation may claim accreditation from which body. Read by set_event_cpd_config; written service-role-side until the Stage 10 approval workflow lands. DEFERRED item 56.';

create index organisation_body_authorisations_body_idx
  on public.organisation_body_authorisations (body_id);

alter table public.organisation_body_authorisations enable row level security;

-- Read is org-scoped so the organiser UI can show only the bodies it may
-- actually claim, rather than offering every active body and failing at save
-- (rule 12 — fail visibly, and preferably before the user commits).
-- Shape mirrors organisers_org_staff_read / accrediting_bodies_org_staff_read
-- verbatim (rule 11 — convention beats novelty). There is no
-- current_staff_org_id() helper in app_private; the established idiom is an
-- exists against staff keyed on app_private.auth_email().
create policy organisation_body_authorisations_org_staff_read
  on public.organisation_body_authorisations
  for select to authenticated
  using (exists (
    select 1 from public.staff s
     where s.organisation_id = organisation_body_authorisations.organisation_id
       and s.email = app_private.auth_email()
       and s.status = 'active'
  ));

-- Hard Rule 11. RLS alone is not sufficient: service_role has BYPASSRLS, and
-- authenticated must not write here at all — the whole point is that an
-- organiser cannot grant themselves the relationship. Table REVOKE first: a
-- column-level revoke is a silent no-op while a table grant stands, and
-- revoking a named role is a no-op while the default ACL still holds it.
revoke all on public.organisation_body_authorisations
  from public, anon, authenticated;
grant select on public.organisation_body_authorisations to authenticated;
-- service_role keeps full DML: it is the seeding path until Stage 10, and this
-- is a lifecycle table, not a permanent ledger — rows are legitimately
-- corrected, suspended and deleted.
grant select, insert, update, delete
  on public.organisation_body_authorisations to service_role;

-- ---------------------------------------------------------------------------
-- Backfill from reality, not from a blanket grant. Every (organisation, body)
-- pair an event ALREADY uses becomes an active authorisation, so no in-flight
-- accredited event becomes un-reconfigurable by a migration. Anything not
-- already in use must be authorised explicitly — which is the gate doing its
-- job from the first minute rather than being a no-op for the default org.
-- ---------------------------------------------------------------------------
insert into public.organisation_body_authorisations (organisation_id, body_id, body_reference)
select distinct e.organisation_id, e.accrediting_body_id, 'backfilled: in use at 20260804000000'
  from public.events e
 where e.accrediting_body_id is not null
   and e.organisation_id is not null
on conflict (organisation_id, body_id) do nothing;

-- ---------------------------------------------------------------------------
-- The gate. Body is otherwise unchanged from 20260802022345 — only the
-- organisation-authorisation check and the event's organisation_id lookup are
-- new.
-- ---------------------------------------------------------------------------
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
  v_event_org uuid;
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

  select created_by, organisation_id into v_owner, v_event_org
    from public.events where id = p_event_id for update;
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

  -- DEFERRED 56: the organisation must hold an active authorisation from the
  -- body. Checked against the EVENT's organisation, not the actor's — an
  -- eventar_staff member configuring a tenant's event still cannot claim a
  -- relationship that tenant does not have. Unlike the ownership check above,
  -- there is no platform-staff exception: this is the body's authority, not
  -- ours to override.
  --
  -- Only asserting a claim is gated. CLEARING (p_body_id null) stays open:
  -- withdrawing an accreditation claim is never an assertion of authority, and
  -- an organiser must be able to undo even after a body revokes them.
  if p_body_id is not null and not exists (
    select 1 from public.organisation_body_authorisations a
     where a.organisation_id = v_event_org
       and a.body_id = p_body_id
       and a.status = 'active'
  ) then
    raise exception 'set_event_cpd_config: this organisation is not authorised to claim accreditation from body %', p_body_id
      using errcode = '42501';
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

revoke all on function public.set_event_cpd_config(uuid, uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.set_event_cpd_config(uuid, uuid, numeric)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions (repo doctrine: prove grants live, never read them
-- from migration text).
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated','public.organisation_body_authorisations','INSERT')
     or has_table_privilege('authenticated','public.organisation_body_authorisations','UPDATE')
     or has_table_privilege('authenticated','public.organisation_body_authorisations','DELETE') then
    raise exception 'authenticated can write the authorisation allow-list';
  end if;
  if has_table_privilege('anon','public.organisation_body_authorisations','SELECT') then
    raise exception 'anon can read the authorisation allow-list';
  end if;
  if not has_table_privilege('authenticated','public.organisation_body_authorisations','SELECT') then
    raise exception 'authenticated lost its org-scoped read';
  end if;
  if not has_table_privilege('service_role','public.organisation_body_authorisations','INSERT') then
    raise exception 'service_role lost the seeding path';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='organisation_body_authorisations'
  ) then
    raise exception 'RLS enabled with no policies — authenticated read would be dead';
  end if;
end $$;

-- Rollback:
--   drop the `DEFERRED 56` block from set_event_cpd_config (re-apply
--     20260802022345's body), then
--   drop table public.organisation_body_authorisations;
