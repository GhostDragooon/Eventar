-- CPD Milestone A / Task 10 — close the residual grant gaps get_advisors
-- flags (0028 anon_security_definer_function_executable). pseudonymise_user
-- carries a bare PUBLIC grant + explicit anon — revoke everything, then grant
-- back exactly the intended surface. self_check_in and require_active_staff
-- are already in their intended states (verified via proacl before writing
-- this migration); re-asserted here anyway so the migration is self-describing
-- and idempotent, not because they were found wrong.
--   - pseudonymise_user: authenticated only (self-actor DSR path; service_role
--     never calls it directly — Server Actions run as authenticated via RLS).
--   - self_check_in: anon + authenticated + service_role (deliberately
--     anon-open for public check-in; service_role is exercised directly by
--     tests/rls/self_check_in.rls.test.ts and the demo scripts).
--   - app_private.require_active_staff: no PostgREST grants at all — it is
--     an internal helper called only from inside other SECURITY DEFINER
--     functions (all postgres-owned, so they retain EXECUTE as owner).

revoke all on function public.pseudonymise_user(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.pseudonymise_user(uuid, text) to authenticated;

revoke all on function public.self_check_in(text, text) from public, anon, authenticated, service_role;
grant execute on function public.self_check_in(text, text) to anon, authenticated, service_role;

revoke all on function app_private.require_active_staff(text[]) from public, anon, authenticated, service_role;

-- Self-verifying: assert the exact has_*_privilege matrix and RAISE on drift,
-- so a future ALTER DEFAULT PRIVILEGES change or manual grant can't silently
-- widen these again without this migration replay failing loudly.
do $$
declare
  bad text[] := array[]::text[];
begin
  if has_function_privilege('anon', 'public.pseudonymise_user(uuid, text)', 'EXECUTE') then
    bad := bad || 'anon can execute pseudonymise_user';
  end if;
  if has_function_privilege('service_role', 'public.pseudonymise_user(uuid, text)', 'EXECUTE') then
    bad := bad || 'service_role can execute pseudonymise_user';
  end if;
  if not has_function_privilege('authenticated', 'public.pseudonymise_user(uuid, text)', 'EXECUTE') then
    bad := bad || 'authenticated CANNOT execute pseudonymise_user';
  end if;

  if not has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE') then
    bad := bad || 'anon CANNOT execute self_check_in';
  end if;
  if not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    bad := bad || 'service_role CANNOT execute self_check_in';
  end if;

  if has_function_privilege('anon', 'app_private.require_active_staff(text[])', 'EXECUTE') then
    bad := bad || 'anon can execute require_active_staff';
  end if;
  if has_function_privilege('authenticated', 'app_private.require_active_staff(text[])', 'EXECUTE') then
    bad := bad || 'authenticated can execute require_active_staff';
  end if;
  if has_function_privilege('service_role', 'app_private.require_active_staff(text[])', 'EXECUTE') then
    bad := bad || 'service_role can execute require_active_staff';
  end if;

  if array_length(bad, 1) > 0 then
    raise exception 'grant_hygiene_residual_public: ACL drift detected: %', array_to_string(bad, '; ');
  end if;
end $$;
