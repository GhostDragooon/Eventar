-- Rename registrations.source label 'staff_walk_in' -> 'walk_in'
--
-- Ivan 2026-09-24: source should describe how the registration entered the
-- system from the ATTENDEE's side of the pathway, not who typed the keys.
-- Staff at the door creating a row for someone who showed up unregistered
-- is still, from the attendee's perspective, a walk-in. The 'staff_' prefix
-- mixed actor into the pathway label — naming debt introduced by the
-- 2026-08-29 A3 slice and now cleaned up. No exception value / door toggle
-- in this migration: "ordinary walk-in" vs "VIP / late / waived / staff-
-- entered exception" belongs in audit metadata (actor, timestamp, notes),
-- not in a second source enum value that forces a decision at the door.
--
-- Migration steps:
--   1. Backfill any existing rows with source = 'staff_walk_in' to 'walk_in'.
--      Expected count is small (or zero on Seoul): the walk-in Server Action
--      never wrote 'staff_walk_in' explicitly before this session's fix, so
--      pre-2026-09-24 rows all defaulted to 'self_registration'. Any rows
--      with 'staff_walk_in' would come from this session's own uncommitted
--      code exercising the writer locally.
--   2. Drop the old CHECK constraint that includes 'staff_walk_in'.
--   3. Add the new CHECK constraint with 'walk_in' in its place. Other three
--      values ('self_registration', 'invitation_import', 'system_migration')
--      unchanged.
--   4. Update the column comment to match.
--
-- Order matters: backfill BEFORE the constraint swap, or the update fails
-- against the current constraint after the drop-then-re-add if any 'walk_in'
-- rows already existed (they don't, but posture matters).

begin;

update public.registrations
   set source = 'walk_in'
 where source = 'staff_walk_in';

-- Introspect the actual constraint name — 20260829090000 uses `add column ...
-- check (...)` which lets Postgres autogenerate the name; on rare rebuilds
-- the name can drift. Look it up rather than assume.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.registrations'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%staff_walk_in%';

  if v_conname is not null then
    execute format('alter table public.registrations drop constraint %I', v_conname);
  end if;
end $$;

alter table public.registrations
  add constraint registrations_source_check
  check (source is null or source in (
    'self_registration',
    'walk_in',
    'invitation_import',
    'system_migration'
  ));

comment on column public.registrations.source is
  'Origin of the registration row, described from the attendee''s side of the pathway. walk_in for door path (whether typed by attendee at a self-serve terminal or by staff on their behalf); self_registration for the public form; invitation_import for bulk imports; system_migration for backfilled legacy rows. Actor stratification (who typed it) lives in audit metadata, not here.';

-- Self-check: assert the old value is gone from both data and constraint.
do $$
declare
  v_stale_rows int;
begin
  select count(*) into v_stale_rows
    from public.registrations
   where source = 'staff_walk_in';
  if v_stale_rows > 0 then
    raise exception 'source rename self-check: % rows still carry staff_walk_in', v_stale_rows;
  end if;
end $$;

commit;
