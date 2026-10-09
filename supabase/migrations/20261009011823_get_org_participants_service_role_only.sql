-- Cross-org read: get_org_participants (found 2026-10-01).
--
-- get_org_participants(p_org_id) (20260911010000) is SECURITY DEFINER, takes the
-- organisation id as a CALLER argument, and checks nothing about the caller — yet
-- it was granted EXECUTE to `authenticated`. Attendee sign-up is open, so any
-- throwaway account could POST /rest/v1/rpc/get_org_participants with any
-- organisation's id (readable from its public events) and receive that
-- organisation's registrants' emails and names, with attendance counts.
-- Reproduced locally before this fix: a plain attendee JWT got a second
-- organisation's registrant back. This is Supabase advisor lint 0029
-- (authenticated_security_definer_function_executable).
--
-- The only legitimate application caller, app/participants/actions.ts::getOrgParticipants,
-- uses the service_role admin client with the signed-in organiser's server-derived
-- organisation id (scripts/demo/seed-essential-demo.sql also calls it, via psql as
-- the owner, which this does not affect). Two halves, which guard different things:
--
--   1. Revoke EXECUTE from anon, authenticated and public. service_role keeps its
--      explicit grant, so the Participants page is unaffected. Public too: a
--      named-role revoke is a no-op if a bare PUBLIC grant still holds it (the
--      recurring Sprint 2 ACL lesson; same shape as 20260806000100).
--   2. SECURITY INVOKER. Nothing here needed to bypass RLS: service_role has
--      BYPASSRLS anyway. Platform default privileges re-grant EXECUTE to
--      anon/authenticated on any drop-and-recreate (the 2026-09-10 sweep did that
--      to publish_event), so if a later migration recreates this function and
--      forgets the revoke, an invoker function is bounded by the org-scoped RLS on
--      registrations/events instead of returning any organisation's registrants.
--
-- No table, policy or data is touched. Re-runnable.

revoke execute on function public.get_org_participants(uuid) from anon, authenticated, public;

alter function public.get_org_participants(uuid) security invoker;

do $$
begin
  if has_function_privilege('anon', 'public.get_org_participants(uuid)', 'EXECUTE') then
    raise exception 'get_org_participants still EXECUTE-able by anon';
  end if;
  if has_function_privilege('authenticated', 'public.get_org_participants(uuid)', 'EXECUTE') then
    raise exception 'get_org_participants still EXECUTE-able by authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.get_org_participants(uuid)', 'EXECUTE') then
    raise exception 'get_org_participants lost service_role EXECUTE — the Participants page would break';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_org_participants(uuid)'::regprocedure) then
    raise exception 'get_org_participants is still SECURITY DEFINER';
  end if;
end $$;
