-- 2026-08-05 — Stage 8 pre-flight: make a FAILED send retryable.
--
-- Found auditing the scheduler before deploy. email_log_dedup_idx carried no
-- status predicate, so ANY existing row — queued, sent, or failed — made the
-- next insert collide with 23505. runBulkSend reacts to 23505 by skipping.
--
-- The consequence: a single transient Resend error (429, 5xx, network blip)
-- permanently lost that recipient's email. Nothing retried it, ever. There is
-- no sweeper — email_log_queued_idx was created in 20260520010100 for a
-- "Phase 9 pg_cron will poll these" job that was never built; the scheduler
-- that eventually shipped (/api/cron/dispatch) selects by time window instead
-- and never reads that index.
--
-- Worse than losing it: runBulkSend counts the collision as `skipped`, whose
-- own comment reads "already handled for this (event, registration, purpose)".
-- So the dispatcher reported permanent mail loss as a successful no-op —
-- rule 12 inverted. For a reminder, the lost mail IS the QR pass, so the
-- attendee cannot check in at the door, so no attendance is recorded, so no
-- CPD credit is ever minted. The whole loop hangs off this one index.
--
-- THE FIX IS DELIBERATELY NARROW (Ivan's call, 2026-08-05): exclude only
-- `failed`. `sent` stays terminal, which is what keeps retryability from
-- becoming a duplicate-send channel — a delivered email is never re-sent,
-- because a 'sent' row means the provider acknowledged it.
--
-- `queued` ALSO STAYS TERMINAL, unchanged. That is not an oversight; it is the
-- decision recorded in tests/cron/dispatch_idempotency.rls.test.ts §"THE
-- `queued` ARM". A queued row is genuinely ambiguous — the process may have
-- died before sending, or sent and then failed to update the status — so
-- retrying it risks a duplicate to a regulated professional.
--
-- CORRECTION (2026-08-05, dev-lens review). An earlier draft of this header
-- claimed `failed` carries no such ambiguity because runBulkSend writes it
-- only after an explicit provider error. THAT WAS FALSE, and the decision to
-- ship this migration was taken on it. lib/resend.ts catches network and
-- connection errors and returns them in the SAME `{ error }` shape as a 4xx,
-- so a message Resend ACCEPTED whose response was lost in transit is recorded
-- 'failed' — and would be re-sent by the next tick.
--
-- The gap is closed at the provider, not here: runBulkSend now passes
-- `idempotencyKey = <event>:<purpose>:<registration>` (Resend's
-- `Idempotency-Key` header), the same triple this index keys on. A retry after
-- a lost response therefore reaches Resend as the same operation and is
-- delivered once. Retryability and no-duplicates now BOTH hold, rather than
-- the second being assumed.
--
-- Retried attempts append rather than overwrite: the failed row stays on the
-- ledger as evidence (rule 12) and the new attempt sits beside it, so the
-- attempt history stays readable.
--
-- Strictly more permissive than the index it replaces, so no existing row can
-- violate it and the recreate cannot fail on live data.

drop index if exists public.email_log_dedup_idx;

create unique index email_log_dedup_idx
  on public.email_log (event_id, registration_id, purpose)
  where registration_id is not null and status <> 'failed';

-- Self-verifying assertions.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'email_log_dedup_idx'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'email_log_dedup_idx is missing or is no longer UNIQUE — the dispatcher has no idempotency guarantee at all';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'email_log_dedup_idx'
      and indexdef like '%status <> ''failed''%'
  ) then
    raise exception 'email_log_dedup_idx does not exclude failed rows — a transient send error is still permanent mail loss';
  end if;

  -- Confirmation rows (Email #1) are inserted with registration_id NULL and
  -- only acquire one via a later UPDATE. Losing this scope would make them
  -- collide with each other.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'email_log_dedup_idx'
      and indexdef like '%registration_id IS NOT NULL%'
  ) then
    raise exception 'email_log_dedup_idx lost its registration_id scope — confirmation rows will now collide';
  end if;
end $$;
