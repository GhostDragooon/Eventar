-- Phase 2: idempotency ledger for email sends.
-- Hard rule from CLAUDE.md: insert email_log row FIRST, send email SECOND.
-- Retry of a failed send can see a queued row and skip the duplicate.
--
-- For Phase 2 only the 'confirmation' purpose is used; 'reminder' lands in
-- Phase 9 (pg_cron), 'survey' in Phase 5. Listed here to avoid an enum
-- migration each phase.
create table public.email_log (
  id              uuid primary key default gen_random_uuid(),
  purpose         text not null check (purpose in ('confirmation','reminder','survey')),
  event_id        uuid references public.events(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  recipient_email text not null,
  status          text not null default 'queued'
                  check (status in ('queued','sent','failed')),
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);

-- Partial index on queued rows — pg_cron in Phase 9 will poll these.
create index email_log_queued_idx on public.email_log(status) where status = 'queued';

alter table public.email_log enable row level security;

-- No anon/authenticated policies. Service-role only (which bypasses RLS).
-- Server Actions that touch email_log use supabaseAdmin().
