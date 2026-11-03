-- Dev-review m1: close the race behind the role lock added in 20261101100000.
--
-- That lock read registrations.status without a row lock. Check-in writes the registration_checkins row before the
-- status flips to 'attended', and award_attendance_credit reads the roles at check-in, so a role write landing between
-- the two read status 'registered', passed the guard, and changed roles after the credit had been decided.
--
-- Same fix update_registration_contact got in 20261102100000: read the registration row FOR NO KEY UPDATE (a
-- concurrent check-in's status update then waits for this transaction) and refuse when the status is 'attended' OR a
-- registration_checkins row exists. 22023 / details 'role_locked_attended' unchanged. Owner check, audit row (still the
-- last statement), SECURITY DEFINER, search_path and grants are as before; CREATE OR REPLACE keeps the grants.
-- Replay-safe: re-running replaces both functions with the same text. No table touched.
-- Rollback: re-create both functions from 20261101100000_registration_roles_locked_after_attendance.sql.

create or replace function public.set_registration_role(p_registration_id uuid, p_role_code text, p_actor_override uuid default null)
 returns registration_roles
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_status text;
  v_row   public.registration_roles;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select e.created_by, r.status into v_owner, v_status
    from public.registrations r join public.events e on e.id = r.event_id
   where r.id = p_registration_id
     for no key update of r;
  if not found then
    raise exception 'set_registration_role: registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'set_registration_role: not the owner of the event behind registration %', p_registration_id
      using errcode = '42501', detail = 'not_owner';
  end if;
  if v_status = 'attended'
     or exists (select 1 from public.registration_checkins c where c.registration_id = p_registration_id) then
    raise exception 'set_registration_role: registration % has attended, so its credit is already posted', p_registration_id
      using errcode = '22023', detail = 'role_locked_attended';
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
$function$;

create or replace function public.remove_registration_role(p_registration_id uuid, p_role_code text, p_actor_override uuid default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_status text;
  v_deleted boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select e.created_by, r.status into v_owner, v_status
    from public.registrations r join public.events e on e.id = r.event_id
   where r.id = p_registration_id
     for no key update of r;
  if not found then
    raise exception 'remove_registration_role: registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_owner is distinct from actor.id then
    raise exception 'remove_registration_role: not the owner of the event behind registration %', p_registration_id
      using errcode = '42501', detail = 'not_owner';
  end if;
  if v_status = 'attended'
     or exists (select 1 from public.registration_checkins c where c.registration_id = p_registration_id) then
    raise exception 'remove_registration_role: registration % has attended, so its credit is already posted', p_registration_id
      using errcode = '22023', detail = 'role_locked_attended';
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
$function$;

do $$
begin
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('set_registration_role', 'remove_registration_role')
         and prosecdef
         and prosrc like '%role_locked_attended%'
         and prosrc like '%for no key update of r%'
         and prosrc like '%registration_checkins%') <> 2 then
    raise exception 'registration role lock race fix did not land on both functions';
  end if;
end $$;
