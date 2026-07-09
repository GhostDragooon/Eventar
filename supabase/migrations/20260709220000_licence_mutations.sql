-- CPD Sprint 3a — licence mutations, audited-mutation shape (same as
-- pseudonymise_user): gate-check -> mutation -> audit-write-last inside
-- the EXISTING audit_events advisory lock (not credit_ledger's — these
-- are actions, not ledger entries).
--
-- practitioner_licences_self_write was dropped (20260709210000) after a
-- review found it let a practitioner forge their own status='verified'.
-- These six SECURITY DEFINER functions are now the ONLY mutation path
-- for this table; they bypass RLS by design (table owner), which is
-- fine because the real gate lives in each function body, not the grant.

create or replace function public.declare_licence(
  p_body_id uuid,
  p_licence_number text,
  p_licence_type text default null
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.practitioner_licences;
begin
  if auth.uid() is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type)
  values (auth.uid(), p_body_id, p_licence_number, p_licence_type)
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_declared',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('body_id', p_body_id, 'licence_id', v_row.id)
  );

  return v_row;
end;
$$;

revoke all on function public.declare_licence(uuid, text, text) from public, anon, authenticated;
grant execute on function public.declare_licence(uuid, text, text) to authenticated;

-- set_primary_licence: self-actor. Demote any existing primary, then
-- promote the target — two statements in one transaction so the partial
-- unique index (practitioner_licences_one_primary_idx) never sees two
-- true rows for the same user_id at once.
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

  update public.practitioner_licences
     set is_primary = false
   where user_id = auth.uid()
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

-- verify_licence: staff-actor (body_admin/eventar_staff), org-match gate —
-- same authorization shape as practitioner_licences_body_admin_read: staff
-- (of either allowed role) may only verify licences for bodies owned by
-- their own organisation. staff.organisation_id is NOT NULL (staff_org_scope
-- migration), so this is a plain equality check, no null special-casing.
create or replace function public.verify_licence(
  p_licence_id uuid
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff   public.staff%rowtype;
  v_body_org uuid;
  v_row     public.practitioner_licences;
begin
  v_staff := app_private.require_active_staff('body_admin', 'eventar_staff');

  select ab.organisation_id into v_body_org
  from public.practitioner_licences pl
  join public.accrediting_bodies ab on ab.id = pl.body_id
  where pl.id = p_licence_id;

  if v_body_org is null then
    raise exception 'verify_licence: licence % not found', p_licence_id using errcode = 'P0002';
  end if;

  if v_staff.organisation_id <> v_body_org then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.practitioner_licences
     set status = 'verified', verified_at = now()
   where id = p_licence_id
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_verified',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := v_staff.role,
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('licence_id', p_licence_id, 'body_id', v_row.body_id)
  );

  return v_row;
end;
$$;

revoke all on function public.verify_licence(uuid) from public, anon, authenticated;
grant execute on function public.verify_licence(uuid) to authenticated;

-- lapse_licence: staff-actor, same org-match gate as verify_licence.
create or replace function public.lapse_licence(
  p_licence_id uuid,
  p_reason text
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff    public.staff%rowtype;
  v_body_org uuid;
  v_row      public.practitioner_licences;
begin
  v_staff := app_private.require_active_staff('body_admin', 'eventar_staff');

  select ab.organisation_id into v_body_org
  from public.practitioner_licences pl
  join public.accrediting_bodies ab on ab.id = pl.body_id
  where pl.id = p_licence_id;

  if v_body_org is null then
    raise exception 'lapse_licence: licence % not found', p_licence_id using errcode = 'P0002';
  end if;

  if v_staff.organisation_id <> v_body_org then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.practitioner_licences
     set status = 'lapsed', lapsed_at = now()
   where id = p_licence_id
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_lapsed',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := v_staff.role,
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('licence_id', p_licence_id, 'body_id', v_row.body_id, 'reason', p_reason)
  );

  return v_row;
end;
$$;

revoke all on function public.lapse_licence(uuid, text) from public, anon, authenticated;
grant execute on function public.lapse_licence(uuid, text) to authenticated;

-- revoke_licence: staff-actor, same org-match gate. p_reason is required
-- (explicit in-body check, matching pseudonymise_user's own pattern) —
-- a null default would silently accept an unexplained revocation.
create or replace function public.revoke_licence(
  p_licence_id uuid,
  p_reason text
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff    public.staff%rowtype;
  v_body_org uuid;
  v_row      public.practitioner_licences;
begin
  v_staff := app_private.require_active_staff('body_admin', 'eventar_staff');

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'revoke_licence: reason is required';
  end if;

  select ab.organisation_id into v_body_org
  from public.practitioner_licences pl
  join public.accrediting_bodies ab on ab.id = pl.body_id
  where pl.id = p_licence_id;

  if v_body_org is null then
    raise exception 'revoke_licence: licence % not found', p_licence_id using errcode = 'P0002';
  end if;

  if v_staff.organisation_id <> v_body_org then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.practitioner_licences
     set status = 'revoked', revoked_at = now()
   where id = p_licence_id
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_revoked',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := v_staff.role,
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('licence_id', p_licence_id, 'body_id', v_row.body_id, 'reason', p_reason)
  );

  return v_row;
end;
$$;

revoke all on function public.revoke_licence(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_licence(uuid, text) to authenticated;

-- supersede_licence: self-actor. Inserts a NEW row inheriting user_id/
-- body_id/licence_type from the OLD row (a supersession replaces the
-- licence NUMBER at the same body for the same user — e.g. a renewal —
-- it is not a cross-body move), marks the OLD row superseded, and
-- returns the NEW row. Inline insert rather than calling declare_licence
-- internally (which has its own auth.uid() gate and would work, but adds
-- an unnecessary nested SECURITY DEFINER call for no benefit here).
create or replace function public.supersede_licence(
  p_old_licence_id uuid,
  p_new_licence_number text
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.practitioner_licences;
  v_new public.practitioner_licences;
begin
  select * into v_old from public.practitioner_licences where id = p_old_licence_id;
  if v_old.id is null or v_old.user_id <> auth.uid() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type)
  values (v_old.user_id, v_old.body_id, p_new_licence_number, v_old.licence_type)
  returning * into v_new;

  update public.practitioner_licences
     set status = 'superseded', superseded_by = v_new.id
   where id = p_old_licence_id;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_superseded',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_new.id,
    p_payload      := jsonb_build_object('old_licence_id', p_old_licence_id, 'new_licence_id', v_new.id)
  );

  return v_new;
end;
$$;

revoke all on function public.supersede_licence(uuid, text) from public, anon, authenticated;
grant execute on function public.supersede_licence(uuid, text) to authenticated;
