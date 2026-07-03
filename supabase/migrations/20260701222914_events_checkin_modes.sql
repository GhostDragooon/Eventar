-- Check-in flow toggle (Design Session Log §"Check-in flow — two paths").
-- Per-event setting: which check-in paths are enabled.
--   staff      — TC tablet (receptionist scans/types). Always the default path.
--   self_serve — attendee taps "Confirm I'm here" on their CI pass page.
-- Default staff-only so presence is verified by a human. The toggle is
-- structural (frozen at publish). When self_serve is false the CI page shows
-- the pass without a confirm button ("please see reception").

alter table public.events
  add column checkin_modes jsonb not null default '{"staff": true, "self_serve": false}'::jsonb;
