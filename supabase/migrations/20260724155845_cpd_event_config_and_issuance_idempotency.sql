-- CPD MVP Stage 1 — event CPD configuration + attendance-credit idempotency.
-- Architecture: docs/plans/2026-07-23-cpd-mvp-architecture.md · execution plan:
-- docs/plans/2026-07-23-cpd-issuance-execution-plan.md (rev.1).
--
-- Adds the two columns a config-free credit needs (B1 data: which body, how many
-- hours) and the DB-level idempotency guarantee for issuance (B3). Idempotent DDL
-- (`if not exists`) so a re-run after a partial `supabase db push` is safe.

alter table public.events
  add column if not exists accrediting_body_id uuid references public.accrediting_bodies(id),
  add column if not exists cpd_hours numeric check (cpd_hours is null or cpd_hours > 0);

-- Business rule: at most ONE attendance credit per practitioner per event.
-- Keyed on (user_id, event_id) — NOT registration_id — so a practitioner with
-- two registrations for one event still earns exactly one credit. Partial: only
-- attendance-type entries. Only guards resolved attendees; unresolved ones never
-- reach issuance (the helper skips them before any ledger write).
create unique index if not exists credit_ledger_attendance_uniq
  on public.credit_ledger (user_id, event_id)
  where entry_type = 'attendance';

do $$ begin
  if to_regclass('public.credit_ledger_attendance_uniq') is null then
    raise exception 'credit_ledger_attendance_uniq missing after apply';
  end if;
end $$;

-- Rollback:
--   drop index if exists public.credit_ledger_attendance_uniq;
--   alter table public.events drop column if exists cpd_hours, drop column if exists accrediting_body_id;
