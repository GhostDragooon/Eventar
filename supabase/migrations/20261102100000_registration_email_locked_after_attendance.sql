-- RV-FINAL F4 / M2 (Ivan's ruling 2026-11-02, "credit must not move silently"): the email of a registration that has
-- attended can no longer be changed through update_registration_contact.
--
-- claim_registrations_for_user() links unlinked registrations by lower(trim(email)), so an organiser who changed the
-- email of an attended, unlinked registration re-routed the posted credit to whoever owns the new address, and the audit
-- row only said {"fields":["email"]}. Two changes, both in the function body:
--   1. Refuse an email change once the person has checked in (registrations.status = 'attended' OR a
--      registration_checkins row exists): 22023, message and detail prefix 'email_locked_attended'. It is raised under the
--      row lock, before the UPDATE and before the audit write. A name-only change and an identical email stay as they were.
--   2. A successful email change adds email_before_sha256 and email_after_sha256 to the audit payload (hex sha256 of the
--      lower-cased, trimmed address, Postgres built-in sha256, no extension). The raw addresses never enter the append-only
--      audit chain.
-- Signature, SECURITY DEFINER, search_path, actor resolution, org check, row lock, 'linked_registration' rule,
-- unique-violation mapping, and audit-last are unchanged. CREATE OR REPLACE keeps the grants; they are restated and asserted.
-- Rollback: restore the single function public.update_registration_contact(uuid, text, text, uuid) from
-- 20261025100000_audited_roster_edit_and_registrations_update_closed.sql (the last file that defined it). No table touched.

create or replace function public.update_registration_contact(
  p_registration_id uuid,
  p_full_name       text,
  p_email           text,
  p_actor_override  uuid default null
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  actor     public.staff%rowtype;
  v_reg     public.registrations%rowtype;
  v_org     uuid;
  v_event   uuid;
  v_name    text := regexp_replace(coalesce(p_full_name, ''), '^\s+|\s+$', '', 'g');
  v_email   text := lower(regexp_replace(coalesce(p_email, ''), '^\s+|\s+$', '', 'g'));
  v_fields  text[] := '{}';
  v_payload jsonb;
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
  -- The claim links an unlinked registration by email, so after check-in the email decides who receives the credit.
  if 'email' = any(v_fields)
     and (v_reg.status = 'attended'
          or exists (select 1 from public.registration_checkins c where c.registration_id = p_registration_id)) then
    raise exception 'email_locked_attended: this person has already checked in, so their email cannot be changed'
      using errcode = '22023', detail = 'email_locked_attended';
  end if;

  begin
    update public.registrations set full_name = v_name, email = v_email where id = p_registration_id;
  exception when unique_violation then
    raise exception 'already_registered: another registration for this event already uses that email' using errcode = '23505';
  end;

  v_payload := jsonb_build_object('fields', to_jsonb(v_fields));
  if 'email' = any(v_fields) then
    v_payload := v_payload || jsonb_build_object(
      'email_before_sha256', encode(sha256(convert_to(lower(btrim(v_reg.email)), 'utf8')), 'hex'),
      'email_after_sha256',  encode(sha256(convert_to(v_email, 'utf8')), 'hex')
    );
  end if;

  -- Audit LAST: the chain trigger holds its advisory lock until commit.
  perform public.write_audit_event(
    'registration_contact_updated', auth.uid(), actor.role, v_org, 'registration', p_registration_id, v_payload
  );
  return v_event;
end;
$function$;

revoke all on function public.update_registration_contact(uuid, text, text, uuid) from public, anon;
grant execute on function public.update_registration_contact(uuid, text, text, uuid) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.update_registration_contact(uuid, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_registration_contact(uuid, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.update_registration_contact(uuid, text, text, uuid)', 'EXECUTE') then
    raise exception 'update_registration_contact has the wrong EXECUTE grants';
  end if;
  if (select prosrc from pg_proc where oid = 'public.update_registration_contact(uuid, text, text, uuid)'::regprocedure)
       not like '%email_locked_attended%' then
    raise exception 'registration email lock did not land';
  end if;
end $$;
