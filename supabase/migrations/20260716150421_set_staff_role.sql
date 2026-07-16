-- CPD Milestone A / Task 9 — set_staff_role: audited, definer-only staff role
-- mutation. Direct role changes are locked out with a COLUMN-level revoke so
-- fixture/creation INSERTs (which set role at creation) keep working while only
-- this gated function may CHANGE a role. Gate: eventar_staff (platform staff;
-- org-admin delegation is a later decision). Audit event emitted LAST, per the
-- audit-insert-last hard rule (the chain trigger holds the advisory lock until
-- commit, same shape as publish_event).

create function public.set_staff_role(p_staff_id uuid, p_new_role text)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor      public.staff%rowtype;
  v_old_role text;
  v_org      uuid;
begin
  actor := app_private.require_active_staff('eventar_staff');

  -- Capture the pre-image BEFORE the update (RETURNING would give the new value).
  select role, organisation_id into v_old_role, v_org
    from public.staff where id = p_staff_id;
  if not found then
    raise exception 'set_staff_role: staff % not found', p_staff_id using errcode = 'P0002';
  end if;

  update public.staff set role = p_new_role where id = p_staff_id;

  perform public.write_audit_event(
    'staff_role_changed', auth.uid(), actor.role, v_org, 'staff', p_staff_id,
    jsonb_build_object(
      'staff_id', p_staff_id, 'old_role', v_old_role,
      'new_role', p_new_role, 'organisation_id', v_org
    )
  );
end;
$$;

-- Column-level revoke: role CHANGES become definer-only. INSERTs (role set at
-- creation) and updates to OTHER columns are unaffected. service_role included
-- because it holds BYPASSRLS — only a grant-level revoke stops it (Hard Rule 11).
revoke update (role) on public.staff from anon, authenticated, service_role;

-- Function grant hygiene: strip the implicit PUBLIC + default-ACL grants, then
-- grant exactly authenticated (server-side callers derive the actor from the
-- authenticated session, never from client input).
revoke execute on function public.set_staff_role(uuid, text) from public, anon;
grant execute on function public.set_staff_role(uuid, text) to authenticated;
