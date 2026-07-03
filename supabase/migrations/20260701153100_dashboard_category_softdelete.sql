-- Wave 5 — Dashboard v14 + Events-list spec support.
--
-- events.category  — profession bucket for the Dashboard card tag + the public
--   Events-list category tabs (Design Session Log §"Events list" / §"DB v14").
--   Nullable: existing events carry no category until edited (no invented data).
--
-- events.deleted_at — soft-delete for the Dashboard's per-card Delete + the
--   recoverable "Deleted" filter bucket, distinct from the 'cancelled' status
--   (Design Session Log §"Bulk select"). NULL = live; non-null = in the bin.

alter table public.events
  add column category text
    check (category in ('life_sciences', 'engineering', 'finance', 'technology')),
  add column deleted_at timestamptz;

-- Dashboard lists exclude soft-deleted rows on the hot path; index the live set.
create index events_not_deleted_idx on public.events (start_time desc) where deleted_at is null;
