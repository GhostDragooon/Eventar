-- CPD Sprint 2 / D1 follow-up (found at the Task 14 exit gate, dev-lens
-- review) — the two prior D1 migrations this sprint (restrict_write_audit_event,
-- restrict_write_audit_event_public) closed `authenticated` and bare PUBLIC's
-- implicit grant on write_audit_event, but never checked `anon`. write_audit_event
-- has NO in-function actor validation (it blindly inserts whatever
-- p_actor_user_id/p_actor_role/p_subject_type/p_subject_id/p_payload it's
-- given), so an open anon grant meant ANY unauthenticated caller with the
-- public anon key (embedded in every client bundle, not a secret) could
-- forge an arbitrary, correctly-chained audit_events row with false actor
-- claims -- the exact forgery vector D1 exists to close, still open via
-- the one role D1's own negative test never exercised.
--
-- Confirmed live before this migration: has_function_privilege('anon', ...)
-- = true. Root cause: this project's schema-wide default ACL (see Task 3's
-- own discovery) grants anon/authenticated/service_role EXECUTE on every
-- new public-schema function at CREATE time; the original Sprint-1
-- migration (20260704130400_init_audit_chain.sql) never revoked it.
revoke execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  from anon;

-- Same root cause, same migration, lower severity: verify_audit_chain()
-- (Sprint 1) is read-only (returns chain_seq/link_valid/content_valid only,
-- no event payloads) but was also left reachable by anon AND authenticated
-- with no legitimate caller needing it outside service_role (only the
-- service-role test/ops client calls it anywhere in this codebase).
-- Restricting to service_role-only, matching this sprint's
-- record_session_revocation precedent for a function with no in-function
-- caller check.
revoke execute on function public.verify_audit_chain() from anon, authenticated;
