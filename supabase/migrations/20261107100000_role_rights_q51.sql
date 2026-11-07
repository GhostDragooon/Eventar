-- Q51 role rights (Ivan, 2026-11-06/07). K1 change, Decisions Log Q51.
--   organiser_admin: every event in its organisation. organiser_member: only events it created.
--   body_admin, auditor: read-only (no create, no edit). eventar_staff: every event.
-- How: one predicate, app_private.can_write_event(event, staff), and one guard trigger at the write on every
-- event-owned table. The trigger acts only for a staff JWT; service_role paths (public registration, self check-in,
-- cron, the admin-client bulk action) and non-staff sessions (practitioner claim) keep their own gates.
-- Functions whose own creator/org check contradicts the rule are rewritten with one counted text change each:
-- their owner lookup now yields the actor when can_write_event allows it, so the existing refusal branch decides.
-- bulk_update_event_status (service_role only) checks every selected event and refuses the batch whole.
-- Hero images: <eventId>/... writable when can_write_event; pending/<auth uid>/... writable only by that user.
--
-- Rollback: drop the trigger "event_writer_guard" on the 9 tables, drop functions app_private.enforce_event_writer,
-- app_private.event_of_row,
-- app_private.can_write_hero_object, app_private.can_write_event; restore these definitions from:
--   add_event_accreditation_group  20260821020000_accreditation_group_idempotent_add.sql
--   add_event_accreditation_row, remove_event_accreditation_group, remove_event_accreditation_row
--                                  20260820000000_multi_body_accreditation_crud.sql
--   link_accreditation_occurrence  20260820010000_link_accreditation_occurrence_cross_event_detail.sql
--   unlink_accreditation_occurrence 20260821010000_c5_warning_fixes.sql
--   remove_registration_role       20261101100000_registration_roles_locked_after_attendance.sql
--   set_registration_role          20261103100000_registration_roles_lock_checkin_race.sql
--   mark_attended                  20261023170000_check_in_only_inside_the_live_window.sql
--   bulk_update_event_status       20261104100000_bulk_event_status_role_gate.sql
-- and recreate the three event_hero_images_staff_* storage policies with "current_staff_id() is not null";
-- re-grant execute on public.create_event_with_blocks to anon only if that was intended (it was not).

create or replace function app_private.can_write_event(p_event_id uuid, p_actor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.staff s
      join public.events e on e.id = p_event_id
     where s.id = p_actor_id
       and s.status = 'active'
       and (s.role = 'eventar_staff'
            or (e.organisation_id = s.organisation_id
                and (s.role = 'organiser_admin'
                     or (s.role = 'organiser_member' and e.created_by = s.id)))));
$$;
revoke all on function app_private.can_write_event(uuid, uuid) from public, anon, authenticated;  -- definer callers only

-- The event a row of an event-owned table belongs to (null when its parent is already gone).
create or replace function app_private.event_of_row(p_table text, p_row jsonb)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare v_event uuid;
begin
  if p_table = 'events' then
    v_event := (p_row->>'id')::uuid;
  elsif p_table in ('agenda_blocks', 'speaker_checkins', 'registrations', 'event_accreditation_groups') then
    v_event := (p_row->>'event_id')::uuid;
  elsif p_table in ('registration_checkins', 'registration_roles') then
    select r.event_id into v_event from public.registrations r where r.id = (p_row->>'registration_id')::uuid;
  elsif p_table = 'event_accreditations' then
    select g.event_id into v_event from public.event_accreditation_groups g
     where g.id = (p_row->>'accreditation_group_id')::uuid;
  elsif p_table = 'event_accreditation_occurrences' then
    select g.event_id into v_event
      from public.event_accreditations a join public.event_accreditation_groups g on g.id = a.accreditation_group_id
     where a.id = (p_row->>'accreditation_id')::uuid;
  end if;
  return v_event;
end;
$$;
revoke all on function app_private.event_of_row(text, jsonb) from public, anon, authenticated;

create or replace function app_private.enforce_event_writer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid;
  v_role  text;
  v_row   jsonb;
  v_event uuid;
  v_keep  text[] := array['user_id', 'profile_snapshot', 'updated_at'];
begin
  if auth.role() = 'service_role' then return coalesce(new, old); end if;
  v_staff := app_private.current_staff_id();
  if v_staff is null then return coalesce(new, old); end if;   -- not staff: RLS and the table's own gates decide

  if tg_table_name = 'events' and tg_op = 'INSERT' then
    select s.role into v_role from public.staff s where s.id = v_staff;
    if v_role not in ('organiser_admin', 'organiser_member', 'eventar_staff') or new.created_by is distinct from v_staff then
      raise exception 'events: your role cannot create events, or created_by is not you'
        using errcode = '42501', detail = 'not_event_writer';
    end if;
    return new;
  end if;

  -- A staff account is also a practitioner account (one auth.users row). Its own claim of its own registration
  -- (claim_registrations_for_user: user_id null -> itself, profile_snapshot filled, nothing else) is not an
  -- organiser action, so the organiser rule does not apply to it.
  if tg_table_name = 'registrations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'user_id' is null and to_jsonb(new)->>'user_id' = auth.uid()::text
       and (to_jsonb(new) - v_keep) = (to_jsonb(old) - v_keep) then
      return new;
    end if;
  end if;

  -- An UPDATE is checked against the event it leaves AND the event it lands on (a row moved onto your own event
  -- from a colleague's must not pass), INSERT against NEW, DELETE against OLD.
  foreach v_row in array case tg_op when 'UPDATE' then array[to_jsonb(old), to_jsonb(new)]
                                    when 'INSERT' then array[to_jsonb(new)]
                                    else array[to_jsonb(old)] end loop
    v_event := app_private.event_of_row(tg_table_name, v_row);
    -- A cascade delete after the parent event (or link row) is gone: the parent's own guard already ran.
    if tg_op = 'DELETE' and (v_event is null or not exists (select 1 from public.events e where e.id = v_event)) then
      continue;
    end if;
    if not app_private.can_write_event(v_event, v_staff) then
      raise exception '%: you cannot change event %', tg_table_name, v_event
        using errcode = '42501', detail = 'not_event_writer';
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;
revoke all on function app_private.enforce_event_writer() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['events', 'agenda_blocks', 'speaker_checkins', 'registrations', 'event_accreditation_groups',
                           'registration_checkins', 'registration_roles', 'event_accreditations',
                           'event_accreditation_occurrences'] loop
    execute format('drop trigger if exists event_writer_guard on public.%I', t);
    execute format('create trigger event_writer_guard before insert or update or delete on public.%I '
                   'for each row execute function app_private.enforce_event_writer()', t);
  end loop;
end $$;

create or replace function app_private.can_write_hero_object(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  f       text[] := storage.foldername(p_name);
  v_staff uuid   := app_private.current_staff_id();
  v_role  text;
begin
  if v_staff is null then return false; end if;
  if f[1] = 'pending' then
    select s.role into v_role from public.staff s where s.id = v_staff;
    return f[2] = auth.uid()::text and v_role in ('organiser_admin', 'organiser_member', 'eventar_staff');
  end if;
  if f[1] is null or f[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return app_private.can_write_event(f[1]::uuid, v_staff);
end;
$$;
revoke all on function app_private.can_write_hero_object(text) from public, anon;
grant execute on function app_private.can_write_hero_object(text) to authenticated;

drop policy if exists event_hero_images_staff_insert on storage.objects;
drop policy if exists event_hero_images_staff_update on storage.objects;
drop policy if exists event_hero_images_staff_delete on storage.objects;
create policy event_hero_images_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-hero-images' and app_private.can_write_hero_object(name));
create policy event_hero_images_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'event-hero-images' and app_private.can_write_hero_object(name))
  with check (bucket_id = 'event-hero-images' and app_private.can_write_hero_object(name));
create policy event_hero_images_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-hero-images' and app_private.can_write_hero_object(name));

revoke execute on function public.create_event_with_blocks(jsonb, jsonb) from public, anon;
grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_event_accreditation_group(p_event_id uuid, p_body_id uuid, p_category_code text, p_unit text, p_award_scheme text, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS event_accreditation_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor       public.staff%rowtype;
  v_owner     uuid;
  v_event_org uuid;
  v_row       public.event_accreditation_groups;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(p_event_id, actor.id) then actor.id end, organisation_id into v_owner, v_event_org
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
  on conflict (event_id, body_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.event_accreditation_groups
     where event_id = p_event_id and body_id = p_body_id;
  else
    perform public.write_audit_event(
      p_event_type := 'event_accreditation_group_added', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
      p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation_group', p_subject_id := v_row.id,
      p_payload := jsonb_build_object('event_id', p_event_id, 'body_id', p_body_id, 'award_scheme', p_award_scheme)
    );
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_event_accreditation_row(p_group_id uuid, p_credit_value numeric, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS event_accreditations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_row   public.event_accreditations;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end into v_owner
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
$function$;

CREATE OR REPLACE FUNCTION public.link_accreditation_occurrence(p_accreditation_id uuid, p_occurrence_id uuid, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor          public.staff%rowtype;
  v_owner        uuid;
  v_event        uuid;
  v_occ_event    uuid;
  v_inserted     boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, e.id into v_owner, v_event
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
  values (p_accreditation_id, p_occurrence_id)
  on conflict (accreditation_id, occurrence_id) do nothing;
  get diagnostics v_inserted = row_count;
  if not v_inserted then
    return;
  end if;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_occurrence_linked', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('occurrence_id', p_occurrence_id, 'event_id', v_event)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_event_accreditation_group(p_group_id uuid, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_event uuid;
  v_body  uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, e.id, g.body_id into v_owner, v_event, v_body
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
$function$;

CREATE OR REPLACE FUNCTION public.remove_event_accreditation_row(p_accreditation_id uuid, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_group uuid;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, g.id into v_owner, v_group
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
$function$;

CREATE OR REPLACE FUNCTION public.remove_registration_role(p_registration_id uuid, p_role_code text, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_status text;
  v_deleted boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, r.status into v_owner, v_status
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

CREATE OR REPLACE FUNCTION public.set_registration_role(p_registration_id uuid, p_role_code text, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS registration_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor   public.staff%rowtype;
  v_owner uuid;
  v_status text;
  v_row   public.registration_roles;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, r.status into v_owner, v_status
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

CREATE OR REPLACE FUNCTION public.unlink_accreditation_occurrence(p_accreditation_id uuid, p_occurrence_id uuid, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor      public.staff%rowtype;
  v_owner    uuid;
  v_event    uuid;
  v_deleted  boolean;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'eventar_staff');

  select case when app_private.can_write_event(e.id, actor.id) then actor.id end, e.id into v_owner, v_event
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
  get diagnostics v_deleted = row_count;
  if not v_deleted then
    return;
  end if;

  perform public.write_audit_event(
    p_event_type := 'event_accreditation_occurrence_unlinked', p_actor_user_id := auth.uid(), p_actor_role := actor.role,
    p_organisation_id := actor.organisation_id, p_subject_type := 'event_accreditation', p_subject_id := p_accreditation_id,
    p_payload := jsonb_build_object('occurrence_id', p_occurrence_id, 'event_id', v_event)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_attended(p_code text, p_method text, p_actor_override uuid DEFAULT NULL::uuid)
 RETURNS TABLE(result text, registration_id uuid, full_name text, event_id uuid, event_title text, check_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor              public.staff%rowtype;
  v_reg              public.registrations%rowtype;
  v_event            public.events%rowtype;
  v_win              timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl               jsonb;
  v_occurrence_id    uuid;
  v_occurrence_count integer;
  v_capture_method   text;
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  if not app_private.can_write_event(v_event.id, actor.id) then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  -- Only 'cancelled' blocks unconditionally (20260815040000 fix).
  if v_reg.status = 'cancelled' then
    result := 'cancelled'; registration_id := v_reg.id; return next; return;
  end if;

  if v_event.deleted_at is not null or v_event.status is distinct from 'published' then
    result := 'unavailable'; registration_id := v_reg.id; return next; return;
  end if;

  -- Resolve the occurrence BEFORE any write (DB-02). No "any time" fallback: outside the window the answer is
  -- not_open_yet or closed and nothing is written (no check-in row, no evidence, no audit event, status untouched).
  --   * One occurrence (every event the product creates): the EVENT's own window decides, from
  --     CHECKIN_OPEN_MINUTES before events.start_time until events.end_time. events.start_time and end_time are what
  --     an organiser edits and nothing moves the occurrence row with them (its only trigger is AFTER INSERT), so
  --     the occurrence's own dates can be stale; the card text says the same ("the event's own window").
  --   * Several occurrences (SQL-only today): an occurrence is open from 60 minutes before its start until its end;
  --     where windows overlap the one that has already started wins, whatever the ordinals.
  select count(*) into v_occurrence_count
  from public.event_occurrences eo where eo.event_id = v_event.id;

  if v_occurrence_count = 0 then
    result := 'no_matching_occurrence'; registration_id := v_reg.id; return next; return;
  elsif v_occurrence_count = 1 then
    if now() < v_event.start_time - interval '60 minutes' then
      result := 'not_open_yet'; registration_id := v_reg.id; return next; return;
    elsif now() > v_event.end_time then
      result := 'closed'; registration_id := v_reg.id; return next; return;
    end if;
    select eo.id into v_occurrence_id
    from public.event_occurrences eo where eo.event_id = v_event.id;
  else
    select eo.id into v_occurrence_id
    from public.event_occurrences eo
    where eo.event_id = v_event.id
      and tstzrange(eo.starts_at - interval '60 minutes', eo.ends_at, '[)') @> now()
    order by (eo.starts_at <= now()) desc, eo.ordinal
    limit 1;

    if v_occurrence_id is null then
      -- Every occurrence has ended: closed. Otherwise the next one has not opened yet (before the first, or in a gap).
      if not exists (select 1 from public.event_occurrences eo where eo.event_id = v_event.id and eo.ends_at > now()) then
        result := 'closed'; registration_id := v_reg.id; return next; return;
      end if;
      result := 'not_open_yet'; registration_id := v_reg.id; return next; return;
    end if;
  end if;

  -- Idempotency via registration_checkins' unique(registration_id, occurrence_id).
  begin
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    values (v_reg.id, v_occurrence_id, now(), p_method);
  exception when unique_violation then
    select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
    result := 'already'; registration_id := v_reg.id; return next; return;
  end;

  -- First check-in transitions status; later occurrences are a no-op here.
  update public.registrations
     set status = 'attended'
   where id = v_reg.id and status = 'registered';

  -- Map p_method to evidence capture_method (from 20260912010000)
  v_capture_method := case p_method when 'qr' then 'qr_scan' when 'manual' then 'manual_entry' else 'manual_entry' end;

  -- Record participation evidence (best-effort — attendance is authoritative)
  begin
    perform public.record_participation_evidence(
      p_organisation_id      := v_event.organisation_id,
      p_event_id             := v_event.id,
      p_occurrence_id        := v_occurrence_id,
      p_registration_id      := v_reg.id,
      p_user_id              := v_reg.user_id,
      p_evidence_type        := 'check_in',
      p_capture_method       := v_capture_method,
      p_source               := 'staff_attestation',
      p_captured_at          := now(),
      p_attestation_strength := 'standard',
      p_actor_id             := auth.uid()
    );
  exception when others then
    raise warning 'participation_evidence write failed for registration % (SQLSTATE %): %', v_reg.id, sqlstate, sqlerrm;
  end;

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, v_event.organisation_id,
    'registration', v_reg.id,
    jsonb_build_object('event_id', v_event.id, 'method', p_method, 'via', 'staff_scan')
  );

  result := 'ok';
  registration_id := v_reg.id;
  full_name := v_reg.full_name;
  event_id := v_event.id;
  event_title := v_event.title;
  select r.check_in_at into check_in_at from public.registrations r where r.id = v_reg.id;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_update_event_status(p_event_ids uuid[], p_action text, p_actor_override uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor              public.staff%rowtype;
  v_event_type       text;
  v_ids              uuid[];
  v_prev_statuses    text[];
  v_prev_deleted_ats timestamptz[];
  v_org_ids          uuid[];
  i                  integer;
begin
  actor := app_private.resolve_actor(p_actor_override, variadic array['organiser_admin', 'organiser_member', 'eventar_staff']);

  if p_action = 'cancel' then
    v_event_type := 'event_cancelled';
  elsif p_action = 'soft_delete' then
    v_event_type := 'event_soft_deleted';
  elsif p_action = 'restore' then
    v_event_type := 'event_restored';
  else
    raise exception 'bulk_update_event_status: unknown action %', p_action using errcode = '22023';
  end if;

  -- Q51: a batch that holds any event this actor may not change is refused whole, before anything is written.
  if exists (select 1 from public.events e where e.id = any(p_event_ids) and not app_private.can_write_event(e.id, actor.id)) then
    raise exception 'bulk_update_event_status: you cannot change every selected event' using errcode = '42501', detail = 'not_event_writer';
  end if;

  with old as (
    select e.id, e.status as prev_status, e.deleted_at as prev_deleted_at, e.organisation_id
    from public.events e
    where e.id = any(p_event_ids)
      and (e.organisation_id = actor.organisation_id or actor.role = 'eventar_staff')
      and case
            when p_action = 'cancel' then e.status is distinct from 'cancelled'
            when p_action = 'soft_delete' then e.deleted_at is null
            when p_action = 'restore' then e.deleted_at is not null
          end
    for update
  ),
  upd as (
    update public.events e set
      status     = case when p_action = 'cancel' then 'cancelled' else e.status end,
      deleted_at = case when p_action = 'soft_delete' then now()
                        when p_action = 'restore' then null
                        else e.deleted_at end
    from old
    where e.id = old.id
    returning e.id
  )
  select array_agg(old.id), array_agg(old.prev_status), array_agg(old.prev_deleted_at), array_agg(old.organisation_id)
    into v_ids, v_prev_statuses, v_prev_deleted_ats, v_org_ids
  from old
  join upd on upd.id = old.id;

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    perform public.write_audit_event(
      v_event_type, p_actor_user_id, actor.role, v_org_ids[i], 'event', v_ids[i],
      jsonb_build_object('previous_status', v_prev_statuses[i], 'previous_deleted_at', v_prev_deleted_ats[i])
    );
    id := v_ids[i];
    return next;
  end loop;
end;
$function$;

do $$
declare n integer;
begin
  select count(*) into n from pg_trigger where tgname = 'event_writer_guard' and not tgisinternal;
  if n <> 9 then raise exception 'Q51 self-check: expected 9 event_writer_guard triggers, found %', n; end if;
  if has_function_privilege('anon', 'public.create_event_with_blocks(jsonb, jsonb)', 'EXECUTE') then
    raise exception 'Q51 self-check: anon still executes create_event_with_blocks';
  end if;
  if has_function_privilege('authenticated', 'app_private.enforce_event_writer()', 'EXECUTE') then
    raise exception 'Q51 self-check: authenticated executes enforce_event_writer';
  end if;
  if not has_function_privilege('authenticated', 'public.create_event_with_blocks(jsonb, jsonb)', 'EXECUTE') then
    raise exception 'Q51 self-check: authenticated lost create_event_with_blocks';
  end if;
  if not has_function_privilege('authenticated', 'public.publish_event(uuid, uuid)', 'EXECUTE') then
    raise exception 'Q51 self-check: publish_event lost its authenticated grant';
  end if;
end $$;
