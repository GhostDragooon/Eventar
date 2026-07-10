-- CPD Sprint 3a / Task 10 exit gate — user-lens phase-completion review found
-- the append-only hardening (20260709300000) revoked DELETE from
-- service_role too, matching credit_ledger's posture. But
-- practitioner_licences isn't a permanent financial ledger the way
-- credit_ledger is (Ivan's explicit design intent there) — it has a real
-- status lifecycle, and unlike credit_ledger there is no ephemeral-branch
-- testing path available on this Supabase plan, so with DELETE revoked no
-- test suite (nor a future GDPR erasure cascade) could ever clean up a
-- fixture/real row again. Ivan's decision: re-grant DELETE to service_role.
-- INSERT/UPDATE stay revoked (that's the actual vulnerability this closed —
-- forging status via a direct write); a deleted row can't misrepresent
-- status the way a forged UPDATE could, it just destroys the record.

grant delete on public.practitioner_licences to service_role;
