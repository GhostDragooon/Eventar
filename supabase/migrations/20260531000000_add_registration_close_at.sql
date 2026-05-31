-- Phase 6.5 — registration_close_at
-- Optional per-event override that defines when registration closes,
-- gating the lifecycle Registering → Upcoming transition.
-- NULL means registration stays open until start_time (event goes Registering → Live directly).

alter table public.events
  add column registration_close_at timestamptz null;

-- Partial index — only events that actually set the column.
-- Used by the lifecycle derivation in /dashboard and /details queries.
create index events_registration_close_at_idx
  on public.events(registration_close_at)
  where registration_close_at is not null;

comment on column public.events.registration_close_at is
  'Optional: when registration closes. NULL = open until start_time. Used to compute Upcoming lifecycle state in UI.';
