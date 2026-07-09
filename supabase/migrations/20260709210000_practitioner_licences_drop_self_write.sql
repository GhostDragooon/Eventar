-- CPD Sprint 3a / Task 5 follow-up — code-quality review found
-- practitioner_licences_self_write (for all, user_id = auth.uid()) lets
-- a practitioner directly set status/verified_at/lapsed_at/revoked_at/
-- superseded_by/cycle_start_override/cycle_config_override on their own
-- row via a plain client write, completely bypassing Task 6's
-- staff-verification functions (which are SECURITY DEFINER and bypass
-- RLS by design, so they'd only add a second safe path without closing
-- this existing unsafe one). Dropped in favour of Task 6's
-- declare_licence/set_primary_licence/verify_licence/lapse_licence/
-- revoke_licence/supersede_licence as the sole mutation paths — matches
-- this sprint's own precedent on accrediting_bodies/credit_ledger
-- (no direct self INSERT/UPDATE/DELETE policy, function-only writes).
-- practitioner_licences_self_read is untouched (SELECT-only, no
-- integrity risk).

drop policy "practitioner_licences_self_write" on public.practitioner_licences;
