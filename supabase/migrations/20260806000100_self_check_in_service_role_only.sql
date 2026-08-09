-- Security review 2026-08-06 — MEDIUM: self_check_in rate-limit bypass.
--
-- self_check_in(p_code, p_ip) is SECURITY DEFINER and carried an EXECUTE grant
-- to anon + authenticated, exposing it at /rest/v1/rpc/self_check_in as a
-- parallel door to the Server Action. Its sole brute-force guard rate-limits on
-- 'selfCheckInGuess:' || p_ip — and p_ip is a CALLER argument. Proven live: 12
-- invalid-code guesses each with a rotated p_ip were never rate-limited, while
-- 12 with a fixed p_ip tripped the cap at #11. The IP cannot be re-derived
-- inside Postgres (the pooler hides the real client address), which is exactly
-- why it is a parameter — and exactly why anon must not reach it directly.
--
-- The only legitimate caller, app/(public)/checkin/confirm/actions.ts::
-- selfCheckIn, uses the service_role admin client and derives the IP
-- server-side via getClientIp(). service_role keeps EXECUTE, so the app path is
-- unaffected. This is the same remedy Sprint 1 prescribed for write_audit_event
-- (restrict the grant off anon/authenticated once the server wrapper is the
-- sole real caller). Re-runnable.
--
-- Belt: revoke from public too — a named-role revoke is a no-op if a bare
-- PUBLIC grant still holds it (the recurring Sprint 2 ACL lesson).

revoke execute on function public.self_check_in(text, text) from anon, authenticated, public;

do $$
begin
  if has_function_privilege('anon', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in still EXECUTE-able by anon';
  end if;
  if has_function_privilege('authenticated', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in still EXECUTE-able by authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.self_check_in(text, text)', 'EXECUTE') then
    raise exception 'self_check_in lost service_role EXECUTE — the app path would break';
  end if;
end $$;
