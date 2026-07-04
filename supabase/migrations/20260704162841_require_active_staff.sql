-- CPD Sprint 2 / §1 R-D — one shared audited-mutation gate.
-- Returns the acting staff row (so audited definer functions get
-- actor.role / actor.organisation_id for free); raises 42501 otherwise.
-- Composed from app_private.auth_email(); mirrors pseudonymise_user's
-- in-function gate so the gate is defined exactly once.
create function app_private.require_active_staff(variadic p_roles text[])
returns public.staff
  language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  select * into actor
  from public.staff
  where email = app_private.auth_email()
    and status = 'active'
    and (p_roles is null or array_length(p_roles, 1) is null or role = any(p_roles))
  order by created_at
  limit 1;

  if actor.id is null then
    raise exception 'require_active_staff: caller is not active staff in %', p_roles
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

grant execute on function app_private.require_active_staff(text[])
  to authenticated, service_role;
