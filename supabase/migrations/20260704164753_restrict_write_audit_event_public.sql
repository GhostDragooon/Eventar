-- CPD Sprint 2 / D1 follow-up — found live: CREATE FUNCTION's implicit
-- GRANT EXECUTE TO PUBLIC (set when write_audit_event was first created in
-- 20260704130400_init_audit_chain.sql, never revoked) meant the prior
-- migration's `revoke ... from authenticated` was a no-op in practice —
-- authenticated inherits PUBLIC's grant regardless of its own explicit
-- grant being revoked. This closes the actual forgery vector.
revoke execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  from public;
