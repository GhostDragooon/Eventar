-- Grant hygiene: stop relying on RLS alone for two service-role-only tables,
-- and close a trigger function's PostgREST-facing EXECUTE grants.
--
-- FOUND BY: full backend review 2026-08-03 (get_advisors + a live grant sweep).
--
-- 1. public.email_log and public.rate_limits both have RLS enabled with ZERO
--    policies, which denies anon/authenticated by default — verified live
--    (anon SELECT returns []). But both still carry a table-level SELECT grant
--    to anon/authenticated, so RLS is the ONLY thing standing between an
--    unauthenticated caller and email_log.recipient_email (PII, Hard Rule 10).
--    That inverts this repo's own Hard Rule 11 lesson ("RLS is not sufficient;
--    revoke at the grant level"), and it is a live footgun: the day anyone adds
--    a permissive policy to email_log for an unrelated reason, the anon grant
--    becomes readable PII. Both tables are written exclusively by the service
--    role, so no PostgREST role needs any privilege on them.
--
-- 2. public.handle_new_user() is a trigger function (returns trigger) that
--    carries EXECUTE for anon + authenticated. PostgREST refuses to invoke
--    trigger-returning functions, so this is not exploitable — but it is the
--    only definer function in the schema still holding default-ACL grants, and
--    leaving it inconsistent is how the anon/PUBLIC gap slipped through three
--    times in Sprint 2. Revoked for the same reason every sibling was.
--
-- Revoking from `public` first is mandatory, not belt-and-braces: revoking a
-- named role is a no-op while the bare PUBLIC grant or the schema's
-- ALTER DEFAULT PRIVILEGES still holds it (CLAUDE.md Hard Rule 11).

revoke all on table public.email_log from public, anon, authenticated;
revoke all on table public.rate_limits from public, anon, authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Self-verifying: fail the migration rather than silently leave a grant open.
do $$
begin
  if has_table_privilege('anon', 'public.email_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_log', 'SELECT')
     or has_table_privilege('anon', 'public.rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.rate_limits', 'SELECT') then
    raise exception 'grant hygiene failed: email_log/rate_limits still readable by a PostgREST role';
  end if;

  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') then
    raise exception 'grant hygiene failed: handle_new_user still executable by a PostgREST role';
  end if;

  -- The service role must KEEP its access — it is the only writer of both
  -- tables (email_log via runBulkSend, rate_limits via rate_limit_check).
  if not has_table_privilege('service_role', 'public.email_log', 'INSERT')
     or not has_table_privilege('service_role', 'public.rate_limits', 'INSERT') then
    raise exception 'over-revoked: service_role lost write access it needs';
  end if;
end $$;
