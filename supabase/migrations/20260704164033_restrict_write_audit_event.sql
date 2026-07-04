-- CPD Sprint 2 / D1 — close the audit-authenticity gap (Sprint 1 carried-
-- forward #1). Direct PostgREST calls by authenticated users could forge a
-- correctly-chained row with false actor claims. Audited mutations reach
-- write_audit_event only via SECURITY DEFINER functions owned by postgres
-- (which inherits audit_writer's EXECUTE), so this revoke breaks only the
-- forgery path, not any legitimate caller.
revoke execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  from authenticated;
-- service_role retains EXECUTE (test harness + service-context paths).
