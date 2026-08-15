-- Task 10.2/10.9 — two function changes riding the same migration since
-- both exist to make "one primary per body" actually true end to end:
--
-- 1. declare_licence — DEFERRED.md item 30: the existing not-found check
--    (`exists(id = p_body_id)`) has no status='active' filter, so a caller
--    who obtains a real but non-active body id directly (bypassing the
--    public picker, which already filters to status='active') sails past
--    the guard and creates a real practitioner_licences row against a
--    non-active body. Fixed with a SECOND check (kept separate from the
--    existing not-found check, not merged into it) so the existing
--    "nonexistent id -> not found" error shape is preserved for a bogus
--    UUID — only a real-but-inactive id now hits the new "not active"
--    branch. Also adds p_track and p_cycle_started_on, both optional
--    (settable by a future UI; no UI ships in this task).
--
--    New 5-arg signature replaces the old 3-arg one — CREATE OR REPLACE
--    cannot widen a parameter list in place (different arg count = a
--    different pg_proc entry), so the stale 3-arg overload is dropped
--    explicitly. Leaving it around would mean two live declare_licence
--    functions, one of them still missing the active-body check.
--
-- 2. set_primary_licence — a real bug found while implementing this task,
--    not something the plan named: it demoted EVERY existing is_primary
--    row for the calling user, regardless of body
--    (`where user_id = auth.uid() and is_primary = true and id <> ...`).
--    That's the root of the exact defect this task exists to fix — even
--    after the index above stops allowing two primaries at the SAME body,
--    calling set_primary_licence for a licence at body B would silently
--    demote the caller's primary at body A, because the demotion UPDATE
--    was never scoped to body_id. Fixed by scoping the demotion to the
--    target licence's own body_id. supersede_licence needed no equivalent
--    fix — it already operates on a single (old) row's body_id only, so
--    its primary-carry-forward (20260709230000) was always body-scoped by
--    construction.

drop function if exists public.declare_licence(uuid, text, text);

create or replace function public.declare_licence(
  p_body_id uuid,
  p_licence_number text,
  p_licence_type text default null,
  p_track text default null,
  p_cycle_started_on date default null
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.practitioner_licences;
begin
  if auth.uid() is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if not exists (select 1 from public.accrediting_bodies where id = p_body_id) then
    raise exception 'declare_licence: accrediting body % not found', p_body_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.accrediting_bodies where id = p_body_id and status = 'active') then
    raise exception 'declare_licence: accrediting body % is not active', p_body_id using errcode = 'P0002';
  end if;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type, track, cycle_started_on)
  values (auth.uid(), p_body_id, p_licence_number, p_licence_type, p_track, p_cycle_started_on)
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_declared',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object(
                         'body_id', p_body_id,
                         'licence_id', v_row.id,
                         'track', p_track,
                         'cycle_started_on', p_cycle_started_on
                       )
  );

  return v_row;
end;
$$;

revoke all on function public.declare_licence(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.declare_licence(uuid, text, text, text, date) to authenticated;

create or replace function public.set_primary_licence(
  p_licence_id uuid
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing public.practitioner_licences;
  v_row      public.practitioner_licences;
begin
  select * into v_existing from public.practitioner_licences where id = p_licence_id;
  if v_existing.id is null or v_existing.user_id <> auth.uid() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- Scoped to the SAME body as the licence being promoted: one primary per
  -- body (index above), not one primary total. Demoting across bodies here
  -- was the actual bug — see the migration header.
  update public.practitioner_licences
     set is_primary = false
   where user_id = auth.uid()
     and body_id = v_existing.body_id
     and is_primary = true
     and id <> p_licence_id;

  update public.practitioner_licences
     set is_primary = true
   where id = p_licence_id
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_marked_primary',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('licence_id', p_licence_id)
  );

  return v_row;
end;
$$;

revoke all on function public.set_primary_licence(uuid) from public, anon, authenticated;
grant execute on function public.set_primary_licence(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'declare_licence'
      and pronargs = 3
  ) then
    raise exception 'stale 3-arg declare_licence overload still exists';
  end if;

  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'declare_licence'
      and pronargs = 5
  ) then
    raise exception 'expected 5-arg declare_licence not found';
  end if;
end $$;

-- Rollback:
--   (restore the 3-arg declare_licence and the user-wide set_primary_licence
--   from 20260726070748_declare_licence_clean_not_found.sql and
--   20260709220000_licence_mutations.sql respectively, then:)
--   drop function if exists public.declare_licence(uuid, text, text, text, date);
