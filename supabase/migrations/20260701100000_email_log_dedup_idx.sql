-- Email #2 (reminder) + #3 (survey invite) idempotency.
--
-- The send actions (sendReminderForEvent / sendSurveyInviteForEvent in
-- app/events/[id]/details/emailActions.ts) and the future pg_cron callers
-- insert an email_log row BEFORE sending (CLAUDE.md hard rule 2). This partial
-- unique index turns a re-run — a double-clicked staff button, a concurrent
-- worker, or a cron tick that catches the same event twice — into a 23505 that
-- the action skips, so no attendee is ever double-mailed. See the vault note
-- "10 — Architecture/Cron + Email.md" §"Idempotency pattern".
--
-- Scoped to registration_id IS NOT NULL: confirmation rows (Email #1) are
-- inserted with registration_id NULL and only get a registration_id via a
-- later UPDATE. There is exactly one confirmation per registration
-- (registrations is unique per (event_id, email)), and failed-registration
-- confirmation rows keep registration_id NULL — so no confirmation row can
-- collide on this index.

create unique index email_log_dedup_idx
  on public.email_log (event_id, registration_id, purpose)
  where registration_id is not null;
