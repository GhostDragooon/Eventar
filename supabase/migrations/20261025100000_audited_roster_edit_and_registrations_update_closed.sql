-- DB-05 (MVP plan, P6): an audited roster edit, and the registrations UPDATE bypass closed.
--
-- 1. (UPDATE and DELETE) `registrations_org_member_update` plus the default grants let any organisation member UPDATE every column of
--    every registration of their organisation straight through PostgREST: mark someone attended outside the check-in
--    window (DB-02), rewrite a name or email, change the registration code, with no audit row. Only user_id,
--    profile_snapshot and source were guarded (by a trigger). Nothing in the app updates registrations as a signed-in
--    user: check-in, claim and self check-in are definer functions, and server code runs as service_role. So the
--    grant and the policy go (service_role keeps UPDATE).
-- 2. The one legitimate edit, correcting a registrant's name or email on the roster, becomes
--    update_registration_contact: a definer function that resolves the actor (organiser admin, organiser member or
--    platform operator, in the registration's organisation), locks the row (FOR NO KEY UPDATE), refuses to change the email of a
--    registration linked to an account (`linked_registration`; the name may still be corrected), refuses an email
--    another registration of the event already uses (`already_registered`, 23505), does not touch the code, the
--    status or the check-in, and writes the audit row `registration_contact_updated` LAST with the names of the
--    fields it changed and nothing else (no PII in the audit chain).
--
-- Operations: one function, one REVOKE and one DROP POLICY; no table rewrite. Idempotent. supabase/seed.sql
-- re-asserts the revoke. `supabase db push` runs this in one transaction and the self-check raises, and rolls the
-- push back, if either half did not land.
-- Rollback: grant update, delete on public.registrations to authenticated, recreate registrations_org_member_update from
-- 20260910000000_authority_sweep_org_scope.sql, drop function public.update_registration_contact.

-- Returns the registration's event id, so the caller refreshes the right pages (and not an event id it was handed).
drop function if exists public.update_registration_contact(uuid, text, text, uuid);
create function public.update_registration_contact(
  p_registration_id uuid,
  p_full_name text,
  p_email text,
  p_actor_override uuid default null
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor    public.staff%rowtype;
  v_reg    public.registrations%rowtype;
  v_org    uuid;
  v_event  uuid;
  v_name   text := regexp_replace(coalesce(p_full_name, ''), '^\s+|\s+$', '', 'g');
  v_email  text := lower(regexp_replace(coalesce(p_email, ''), '^\s+|\s+$', '', 'g'));
  v_fields text[] := '{}';
begin
  actor := app_private.resolve_actor(p_actor_override, 'organiser_admin', 'organiser_member', 'eventar_staff');

  if char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_name: a name is 1 to 200 characters' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception 'invalid_email: that is not an email address' using errcode = '22023';
  end if;

  select e.organisation_id, e.id into v_org, v_event
    from public.registrations r
    join public.events e on e.id = r.event_id
   where r.id = p_registration_id and e.deleted_at is null;
  if v_org is null then
    raise exception 'update_registration_contact: registration % not found', p_registration_id using errcode = 'P0002';
  end if;
  if actor.role <> 'eventar_staff' and v_org is distinct from actor.organisation_id then
    raise exception 'update_registration_contact: registration % is not in your organisation', p_registration_id
      using errcode = '42501';
  end if;

  -- Read the row again under the lock: what is compared and linked-checked is what is written.
  select * into v_reg from public.registrations where id = p_registration_id for no key update;
  if not found then
    raise exception 'update_registration_contact: registration % not found', p_registration_id using errcode = 'P0002';
  end if;

  if v_name is distinct from v_reg.full_name then v_fields := array_append(v_fields, 'full_name'); end if;
  if v_email is distinct from lower(v_reg.email) then v_fields := array_append(v_fields, 'email'); end if;
  if cardinality(v_fields) = 0 then
    return v_event;
  end if;
  if 'email' = any(v_fields) and v_reg.user_id is not null then
    raise exception 'linked_registration: this registration belongs to an Eventar account, so its email cannot be changed here'
      using errcode = '22023';
  end if;

  begin
    update public.registrations set full_name = v_name, email = v_email where id = p_registration_id;
  exception when unique_violation then
    raise exception 'already_registered: another registration for this event already uses that email' using errcode = '23505';
  end;

  -- Audit LAST: the chain trigger holds its advisory lock until commit.
  perform public.write_audit_event(
    'registration_contact_updated', auth.uid(), actor.role, v_org, 'registration', p_registration_id,
    jsonb_build_object('fields', to_jsonb(v_fields))
  );
  return v_event;
end;
$function$;

revoke all on function public.update_registration_contact(uuid, text, text, uuid) from public, anon;
grant execute on function public.update_registration_contact(uuid, text, text, uuid) to authenticated, service_role;

-- The bypass: nothing signed in updates registrations directly any more.
-- DELETE too: no policy admits it today (a signed-in DELETE answers 200 with no rows), but a grant with no policy is one
-- policy away from letting an organisation member erase registrations, and nothing in the app deletes them as a user
-- (erasure and teardown run as service_role). Same rule as SEC-03 for events.
revoke update, delete on public.registrations from anon, authenticated;
drop policy if exists "registrations_org_member_update" on public.registrations;

do $$
begin
  if has_any_column_privilege('authenticated', 'public.registrations', 'UPDATE')
     or has_any_column_privilege('anon', 'public.registrations', 'UPDATE') then
    raise exception 'DB-05: an API role still holds UPDATE on public.registrations';
  end if;
  if has_table_privilege('authenticated', 'public.registrations', 'DELETE') or has_table_privilege('anon', 'public.registrations', 'DELETE') then
    raise exception 'DB-05: an API role still holds DELETE on public.registrations';
  end if;
  if not has_table_privilege('service_role', 'public.registrations', 'UPDATE')
     or not has_table_privilege('service_role', 'public.registrations', 'DELETE') then
    raise exception 'DB-05: service_role lost UPDATE or DELETE on public.registrations (cancel, claim, erasure and scripts need them)';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'registrations' and cmd in ('UPDATE', 'ALL')) then
    raise exception 'DB-05: a registrations UPDATE policy is still defined';
  end if;
  if has_function_privilege('anon', 'public.update_registration_contact(uuid, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_registration_contact(uuid, text, text, uuid)', 'EXECUTE') then
    raise exception 'DB-05: update_registration_contact has the wrong EXECUTE grants';
  end if;
end $$;
