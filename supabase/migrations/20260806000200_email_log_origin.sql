-- 2026-08-06 — record WHO asked for a send, so a human's rescue attempts cannot
-- exhaust the scheduler's automatic retry budget.
--
-- Found by the dev-lens review (I-3). `{ manual: true }` skips the budget READ
-- but not the WRITE: a manual send that fails still writes a `failed` row, and
-- the next scheduler tick counts it. So:
--
--   provider outage at T-45 → operator clicks "Send reminders now" three times
--   → every click fails for everyone → budget now exhausted for the WHOLE
--   roster → provider recovers at T-20 → the scheduler gives up on all of them
--   → every attendee arrives without a pass.
--
-- The operator's troubleshooting is what disables the automation. Worse, they
-- are never told: MAX_SEND_ATTEMPTS is counted server-side with no surface.
--
-- The fix has to be a column because nothing in the row distinguishes the two
-- callers. Nullable with a default so every existing row keeps its meaning
-- (they were all scheduler-or-manual sends under the old, undifferentiated
-- rule; 'scheduler' is the conservative reading — it keeps them countable,
-- so no recipient silently gains budget from this migration).
--
-- Deliberately NOT added to email_log_dedup_idx. The index must stay blind to
-- origin: a manual send and a scheduled send to the same recipient are the same
-- email, and letting them collide separately would reintroduce double-sends.

alter table public.email_log
  add column if not exists origin text not null default 'scheduler'
    check (origin in ('scheduler', 'manual'));

comment on column public.email_log.origin is
  'Who initiated this send. Only ''scheduler'' rows count toward MAX_SEND_ATTEMPTS — a human clicking the rescue button must never exhaust the automation''s budget. See lib/email/eventEmails.ts.';

-- Self-verifying assertions.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_log' and column_name = 'origin'
  ) then
    raise exception 'email_log.origin was not created';
  end if;

  -- The dedup index must NOT have gained origin: two sends of the same email to
  -- the same person are still one email, whoever asked for them.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'email_log_dedup_idx' and indexdef like '%origin%'
  ) then
    raise exception 'email_log_dedup_idx now keys on origin — a manual send could double-deliver';
  end if;

  -- The retryability arm from 20260805000000 must survive this migration.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'email_log_dedup_idx' and indexdef like '%status <> ''failed''%'
  ) then
    raise exception 'email_log_dedup_idx lost its failed-is-retryable arm';
  end if;
end $$;
