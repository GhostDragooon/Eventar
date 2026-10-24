# SEC-03 No API role hard-deletes an event
STATUS: DONE locally (found by the DB-04 backtest, confirmed by the DB-04 dev lens, reviewed through DB-04's round). Hosted push NOT done: see SEC-01.md "Hosted".
Changed: `supabase/migrations/20261024120000_events_authenticated_cannot_delete.sql` (new), `supabase/seed.sql` (re-asserts the revoke after the blanket grant), `scripts/ci/replay-and-verify.sh` (gate 5: neither `anon` nor `authenticated` holds DELETE on `events`), `tests/rls/audited_table_writes.rls.test.ts` (2 tests).

## The hole [X]
`events_org_member_delete` plus the table DELETE grant let an `organiser_member` run `DELETE /rest/v1/events?id=eq.<id>` on a published event of their organisation. The backtest did it on a fixture: HTTP 200, the row and its agenda gone, no audit row. The foreign keys cascade registrations, survey_responses, agenda_blocks, event_occurrences, event_accreditation_groups, speaker_checkins and email_log with it; only `credit_ledger` and `participation_evidence` (NO ACTION) stop it, so an event that never issued a credit can be erased with its attendance. I reproduced the grant and the cascade list; my own attempt on a real local event was refused by the credit_ledger FK, which is the exception, not the rule. Nothing in the app deletes an event as a signed-in user: a delete is a soft delete (`deleted_at`, `service_role`).

## The fix
`revoke delete on public.events from anon, authenticated`; `service_role` keeps DELETE (test teardown, erasure). The policy stays as defence in depth and is inert without the grant. The migration self-checks both directions. Same family as SEC-01/SEC-02 (the audited-mutation rule at the grant, Hard Rule 11).

## Evidence [X]
- Both tests fail before the migration ("authenticated holds DELETE on events"; a colleague's DELETE of a published event with a registration succeeds) and pass after (42501; the event and its registration survive).
- Mutant: `grant delete on public.events to authenticated` fails both tests; the migration re-applied restores `f|t` (authenticated false, service_role true).
- The real `supabase/seed.sql` run inside `begin; ... rollback;` leaves `has_table_privilege('authenticated','public.events','DELETE')` false.
- `pnpm test:rls`: 46 files, 473 passed with DB-04.

## Needs Ivan
None for the local database. Hosted: the revoke is one statement, but the hosted state of every migration since the last push is unknown (`supabase migration list --linked`), and the hosted push is still blocked by the sandbox rule listed in the handoff.

Executor: Claude Sonnet 5.5, Claude Code
Committed:
Suggested commit message: fix(security): no API role can hard-delete an event
