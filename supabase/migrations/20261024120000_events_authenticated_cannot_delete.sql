-- SEC-03 (found by the DB-04 backtest, 2026-10-24): `authenticated` could hard-DELETE a published event.
--
-- events_org_member_delete lets any organisation member DELETE their organisation's events and `authenticated`
-- held the table DELETE grant, so `DELETE /rest/v1/events?id=eq.<id>` removed a published event with no audit row,
-- and the foreign keys carried registrations, survey answers, agenda blocks, occurrences, accreditation groups,
-- speaker check-ins and email_log with it (credit_ledger and participation_evidence refuse, NO ACTION, so only an
-- event that never issued a credit could go). Nothing in the app hard-deletes an event as a signed-in user: a
-- delete is a soft delete (deleted_at) and runs as service_role. Same family as SEC-01/SEC-02: the audited-mutation
-- rule has to hold at the grant, not only in the app (Hard Rule 11). `service_role` keeps DELETE (test teardown,
-- erasure, cleanup); the policy stays as defence in depth and is inert without the grant.
--
-- Operations: one REVOKE, no table rewrite. Idempotent. supabase/seed.sql re-asserts it (the seed's blanket grant
-- gives DELETE back). Rollback: grant delete on public.events to authenticated.

revoke delete on public.events from anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.events', 'DELETE') or has_table_privilege('anon', 'public.events', 'DELETE') then
    raise exception 'SEC-03: an API role still holds DELETE on public.events';
  end if;
  if not has_table_privilege('service_role', 'public.events', 'DELETE') then
    raise exception 'SEC-03: service_role lost DELETE on public.events (cleanup and erasure need it)';
  end if;
end $$;
