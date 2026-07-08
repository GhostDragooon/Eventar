-- CPD Sprint 2 / D1 follow-up, part 2 -- the prior migration's
-- "revoke ... from anon, authenticated" on verify_audit_chain() was a
-- no-op: this function's actual ACL carries a bare PUBLIC entry
-- (=X/postgres), which anon/authenticated inherit regardless of any
-- revoke targeted at them by name -- the exact Task-3 D1 lesson,
-- recurring on a second function. Confirmed live via pg_proc.proacl
-- before this fix: {=X/postgres, postgres=X/postgres, service_role=X/postgres}.
revoke execute on function public.verify_audit_chain() from public;
