-- DB-03 (MVP plan, O6; Ivan's MVP scope): teammates can read the eligibility of an event they did not create, and
-- a soft-deleted event is private.
--
-- 1. event_registration_eligibility gated on events.created_by, so the check-in roster told every teammate who was
--    not the creator "CPD eligibility couldn't be checked just now" (the 2026-10-10 user lens). It is a READ of
--    the event's own roster, so the gate is now "active staff of the event's organisation" (the same role list
--    through resolve_actor, eventar_staff for any organisation). Eight other functions gate on created_by
--    (add/remove/link/unlink accreditation group, row and occurrence, set/remove registration role); they are
--    WRITES that touch accreditation and roster roles and stay creator-only by Ivan's ruling 2 (2026-10-23); the
--    matching UI tightening is NOT done here (pending Ivan's pick, UX-FU1 surface 5). Listed in
--    docs/plans/mvp/DB-03.md.
--
-- 2. softDeleteEvents only sets events.deleted_at and leaves status = 'published', and events_public_read_published
--    was `status = 'published'`, so a deleted event stayed readable by anyone with the anon key: its page, its
--    poster, its agenda. The rule goes into the one choke point, the policy: `status = 'published' and deleted_at
--    is null`. The public-read policies of agenda_blocks, event_occurrences and the accreditation tables select
--    from events AS THE CALLER, so they inherit it for anon (tested for agenda_blocks and event_occurrences; the
--    accreditation tables are read from their policy text). Organisation members keep seeing their own deleted
--    events through their own policies (undo, audit). The registrations INSERT policy, now unreachable over
--    PostgREST (SEC-01), also stops treating a deleted event as published, because for a staff member the events
--    subquery would still return it. Scope: reads through the anon key or a user JWT. Readers on the service-role
--    client (check-in pass page, survey) are untouched and listed in DB-03.md.
--
-- Operations: policy and function replacements, no table rewrite. `supabase db push` runs this file in one
-- transaction; the self-check raises, and the push rolls back, if either change did not land. Idempotent.
-- Rollback: restore events_public_read_published to `using (status = 'published')`, the registrations policy
-- without `and e.deleted_at is null`, and event_registration_eligibility from
-- 20260814030000_review_mode_eligibility_override.sql (the latest earlier definition; copy the single function,
-- do not re-run files).

CREATE OR REPLACE FUNCTION public.event_registration_eligibility(p_event_id uuid, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registration_id uuid, eligibility text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_event public.events%rowtype;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_registration_eligibility: event % not found', p_event_id
      using errcode = 'P0002';
  end if;
  -- DB-03: a READ of the event's own roster, so any active staff member of the event's ORGANISATION may call it,
  -- not only its creator (a teammate used to get "CPD eligibility couldn't be checked just now"). The writes that
  -- touch accreditation and roles stay creator-only (Ivan, 2026-10-23, ruling 2).
  if actor.role <> 'eventar_staff' and v_event.organisation_id is distinct from actor.organisation_id then
    raise exception 'event_registration_eligibility: event % is not in your organisation', p_event_id
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    case
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
$function$;

-- Same grants as before (CREATE OR REPLACE keeps them; restated so the file is self-contained).
revoke all on function public.event_registration_eligibility(uuid, uuid) from public, anon;
grant execute on function public.event_registration_eligibility(uuid, uuid) to authenticated, service_role;

-- 2. Soft-deleted events are not public.
alter policy "events_public_read_published" on public.events
  using (status = 'published' and deleted_at is null);

alter policy "registrations_anon_insert_when_event_published" on public.registrations
  with check (
    status = 'registered'
    and check_in_at is null
    and check_in_method is null
    and exists (
      select 1 from public.events e
       where e.id = registrations.event_id
         and e.status = 'published'
         and e.deleted_at is null
    )
  );

do $$
begin
  if pg_get_functiondef('public.event_registration_eligibility(uuid, uuid)'::regprocedure) like '%created_by%' then
    raise exception 'DB-03: event_registration_eligibility still gates on created_by';
  end if;
  if coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
       where polrelid = 'public.events'::regclass and polname = 'events_public_read_published'), '') not like '%deleted_at IS NULL%' then
    raise exception 'DB-03: events_public_read_published does not exclude soft-deleted events';
  end if;
  if coalesce((select pg_get_expr(polwithcheck, polrelid) from pg_policy
       where polrelid = 'public.registrations'::regclass and polname = 'registrations_anon_insert_when_event_published'), '') not like '%deleted_at IS NULL%' then
    raise exception 'DB-03: the registrations INSERT policy still treats a soft-deleted event as published';
  end if;
  if has_function_privilege('anon', 'public.event_registration_eligibility(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.event_registration_eligibility(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.event_registration_eligibility(uuid, uuid)', 'EXECUTE') then
    raise exception 'DB-03: event_registration_eligibility has the wrong EXECUTE grants';
  end if;
end $$;
