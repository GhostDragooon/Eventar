-- 2026-08-14 full-stack review, backtest phase. Found by actually clicking
-- "Publish event" under review mode: it 500s with "not found or not owned by
-- you" regardless of true ownership. Root cause, confirmed by direct RPC test
-- (curl with the service-role key, no session): `lib/supabase/server.ts`
-- routes `supabaseServer()` to the SERVICE-ROLE client under review mode
-- (deliberately — see its own comment, that's what makes staff pages readable
-- without a session). But `publish_event`/`mark_attended`/`set_event_cpd_config`
-- all resolve their acting staff member via `app_private.require_active_staff()`,
-- which reads the JWT's `email` claim — and a service-role call carries no such
-- claim, so it always raises 42501, independent of any real ownership fact.
--
-- Confirmed the full extent: exactly these three functions are affected (the
-- only require_active_staff()-callers reached via supabaseServer() from live
-- app code; record_session_revocation uses the admin client directly, already
-- fine). create_event_with_blocks already solved this exact problem in
-- 20260802182411 with a `case when auth.role() = 'service_role' then ... end`
-- branch — this migration applies the identical pattern to the three functions
-- that were missing it, via one shared helper instead of copying the branch
-- three times.
--
-- PRODUCTION IS UNAFFECTED: a real logged-in staff member always has a real
-- session with a real email claim, so require_active_staff() already resolves
-- correctly for them — this bug only manifests for a session-less service-role
-- caller, which in this codebase means review mode only (EVENTAR_REVIEW_MODE,
-- itself impossible to enable in a production build — see lib/reviewMode.ts).
--
-- Why an override parameter and not a session-emulation fix (minting a real
-- JWT for the review identity in lib/supabase/server.ts): that would touch the
-- trust model of every future SECURITY DEFINER function at once, is riskier to
-- get right blind, and touches an auth mechanism Ivan designed deliberately
-- (see reviewMode.ts's docstring) — flagged as the alternative, not built here.
--
-- Safety of the override itself: `auth.role() = 'service_role'` cannot be
-- forged by a real authenticated user — it comes from the JWT's own `role`
-- claim, verified by PostgREST against the signing secret before this function
-- ever runs. A real authenticated caller passing p_actor_override is a no-op:
-- the override branch is structurally unreachable unless the caller already
-- holds the service-role key, which the app already trusts completely as its
-- own backend credential. The override id is still validated against
-- staff.status/role exactly like the session path — it does not skip the
-- active-staff or role checks, only the JWT-email resolution step.

create or replace function app_private.resolve_actor(p_actor_override uuid, variadic p_roles text[])
returns public.staff
language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  if auth.role() = 'service_role' and p_actor_override is not null then
    select * into actor
      from public.staff
     where id = p_actor_override
       and status = 'active'
       and (p_roles is null or array_length(p_roles, 1) is null or role = any(p_roles));
    if actor.id is null then
      raise exception 'resolve_actor: override actor % is not active staff in %', p_actor_override, p_roles
        using errcode = '42501';
    end if;
    return actor;
  end if;
  return app_private.require_active_staff(variadic p_roles);
end;
$$;

grant execute on function app_private.resolve_actor(uuid, text[])
  to authenticated, service_role;
revoke execute on function app_private.resolve_actor(uuid, text[]) from public, anon;

-- ---------------------------------------------------------------------------
-- publish_event — body otherwise byte-identical to the live definition,
-- verified against pg_get_functiondef before editing.
-- ---------------------------------------------------------------------------
drop function public.publish_event(uuid);

create function public.publish_event(p_event_id uuid, p_actor_override uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id and created_by = actor.id
     and status is distinct from 'published'
   returning organisation_id into v_org;
  if not found then
    if exists (
      select 1 from public.events
       where id = p_event_id and created_by = actor.id and status = 'published'
    ) then
      return;
    end if;
    raise exception 'publish_event: event % not found or not owned by caller', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')
  );
end;
$$;

revoke execute on function public.publish_event(uuid, uuid) from public, anon;
grant execute on function public.publish_event(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mark_attended — byte-identical otherwise to the live definition.
-- ---------------------------------------------------------------------------
drop function public.mark_attended(text, text);

create function public.mark_attended(p_code text, p_method text, p_actor_override uuid default null)
returns table(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor    public.staff%rowtype;
  v_reg    public.registrations%rowtype;
  v_event  public.events%rowtype;
  v_win    timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl     jsonb;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if v_event.created_by <> actor.id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  if v_reg.status = 'attended' then
    result := 'already'; registration_id := v_reg.id; check_in_at := v_reg.check_in_at;
    return next; return;
  end if;

  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = p_method
   where id = v_reg.id and status = 'registered';
  if not found then
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end if;

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, actor.organisation_id,
    'registration', v_reg.id,
    jsonb_build_object('event_id', v_event.id, 'method', p_method, 'via', 'staff_scan')
  );

  result := 'ok';
  registration_id := v_reg.id;
  full_name := v_reg.full_name;
  event_id := v_event.id;
  event_title := v_event.title;
  check_in_at := now();
  return next;
end;
$$;

revoke execute on function public.mark_attended(text, text, uuid) from public, anon;
grant execute on function public.mark_attended(text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_event_cpd_config — byte-identical otherwise to the live definition.
-- ---------------------------------------------------------------------------
drop function public.set_event_cpd_config(uuid, uuid, numeric);

create function public.set_event_cpd_config(
  p_event_id uuid,
  p_body_id uuid,
  p_cpd_hours numeric,
  p_actor_override uuid default null
) returns public.events
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.staff%rowtype;
  v_row public.events;
  v_owner uuid;
  v_event_org uuid;
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

  update public.events
     set accrediting_body_id = p_body_id,
         cpd_hours           = p_cpd_hours
   where id = p_event_id
  returning * into v_row;

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
-- Self-verifying assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_staff_id uuid;
begin
  -- Grants intact on all three new signatures + the helper.
  if not has_function_privilege('authenticated','public.publish_event(uuid, uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.publish_event(uuid, uuid)','EXECUTE') then
    raise exception 'publish_event lost a grant it needs';
  end if;
  if has_function_privilege('anon','public.publish_event(uuid, uuid)','EXECUTE') then
    raise exception 'publish_event: anon should not be able to execute this';
  end if;
  if not has_function_privilege('authenticated','public.mark_attended(text, text, uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.mark_attended(text, text, uuid)','EXECUTE') then
    raise exception 'mark_attended lost a grant it needs';
  end if;
  if not has_function_privilege('authenticated','public.set_event_cpd_config(uuid, uuid, numeric, uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.set_event_cpd_config(uuid, uuid, numeric, uuid)','EXECUTE') then
    raise exception 'set_event_cpd_config lost a grant it needs';
  end if;

  select id into v_staff_id from public.staff where status = 'active' limit 1;
  if v_staff_id is null then
    raise notice 'resolve_actor self-check skipped: no active staff row on this database yet';
    return;
  end if;

  -- A session-less call with no override must still fail exactly like it
  -- always has — no regression. (The override branch itself additionally
  -- requires auth.role() = 'service_role', which a migration's own executing
  -- role never satisfies, so it cannot be meaningfully exercised from inside
  -- this DO block — verified instead by a live HTTP-level RPC call right
  -- after this migration applies, both a valid and a bogus override id.)
  begin
    perform app_private.resolve_actor(null, 'eventar_staff');
    raise exception 'resolve_actor: a session-less call with no override should have raised 42501';
  exception when sqlstate '42501' then
    null; -- expected
  end;
end $$;

-- Rollback:
--   drop function public.publish_event(uuid, uuid);
--   create function public.publish_event(p_event_id uuid) ... (restore 20260705050043's body)
--   drop function public.mark_attended(text, text, uuid);
--   create function public.mark_attended(p_code text, p_method text) ... (restore 20260804010000's body)
--   drop function public.set_event_cpd_config(uuid, uuid, numeric, uuid);
--   create function public.set_event_cpd_config(p_event_id uuid, p_body_id uuid, p_cpd_hours numeric) ... (restore 20260804040000's body)
--   drop function app_private.resolve_actor(uuid, text[]);
