-- CPD Milestone A hardening — narrow the staff column-UPDATE grant off `anon`.
-- Security review (Milestone A phase-completion protocol, LOW-2 / dev M3):
-- 20260716150855_staff_role_update_lock_fix restored column UPDATE on the
-- non-role columns to anon/authenticated/service_role as a mechanical mirror of
-- the platform default minus `role`. `anon` (unauthenticated public) has no
-- legitimate staff-write use — `staff` carries only a SELECT RLS policy
-- (staff_self_read), so anon writes are already default-denied — but the grant
-- is a latent footgun the instant any permissive UPDATE policy touches anon,
-- and `organisation_id` is in the set (a tenant re-homing vector). Drop anon;
-- authenticated + service_role keep it (the real write paths: service_role via
-- the admin client, authenticated as defense-in-depth behind RLS). `role` stays
-- definer-only for all three (set_staff_role), unchanged here.
revoke update (email, full_name, organisation_id, status) on public.staff from anon;

-- Self-verifying: anon must hold NO column UPDATE on staff; authenticated +
-- service_role must retain it; role must be directly updatable by no one.
-- RAISE on drift so a future ALTER DEFAULT PRIVILEGES change or manual grant
-- can't silently re-widen without this migration's replay failing loudly.
do $$
declare
  bad text[] := array[]::text[];
begin
  if has_column_privilege('anon', 'public.staff', 'full_name', 'UPDATE') then
    bad := bad || 'anon can update staff.full_name';
  end if;
  if has_column_privilege('anon', 'public.staff', 'organisation_id', 'UPDATE') then
    bad := bad || 'anon can update staff.organisation_id';
  end if;
  if not has_column_privilege('authenticated', 'public.staff', 'full_name', 'UPDATE') then
    bad := bad || 'authenticated CANNOT update staff.full_name';
  end if;
  if not has_column_privilege('service_role', 'public.staff', 'full_name', 'UPDATE') then
    bad := bad || 'service_role CANNOT update staff.full_name';
  end if;
  if has_column_privilege('anon', 'public.staff', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.staff', 'role', 'UPDATE')
     or has_column_privilege('service_role', 'public.staff', 'role', 'UPDATE') then
    bad := bad || 'staff.role is directly updatable (must be definer-only)';
  end if;
  if array_length(bad, 1) > 0 then
    raise exception 'staff_grant_narrow_anon: ACL drift detected: %', array_to_string(bad, '; ');
  end if;
end $$;
