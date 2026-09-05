-- events.category CHECK constraint — swap the pre-2026-09-05 cross-industry
-- taxonomy for the HK-medical one. The Zod enum, NewEventForm picker,
-- DashboardWorkstation labels and public /events finder tabs all moved to
-- `medicine_dentistry / allied_health / other` in commit 1017c78 (2026-09-05).
-- The CHECK constraint was the one site the sweep missed: an organiser
-- picking any of the new keys hit SQLSTATE 23514 on save, and every
-- seed-created demo event wrote an invalid taxonomy row. Caught 2026-09-06
-- by the smoothness-pass walk-through — Rule 14 investigate-before-escalate
-- confirmed the picker sends the new keys, Zod accepts them, DB refuses them.
--
-- Behaviour: any lingering old-key rows are set to NULL first (the old values
-- were meaningful under the cross-industry audience; under the HK-medical
-- audience they cannot be mapped honestly to a new key, so NULL is safer than
-- guessing). The new CHECK writes NULL-tolerance explicitly.
--
-- Non-destructive re-runnability: the update is idempotent (a second run
-- affects zero rows), and the drop+add is fully wrapped in a transaction, so
-- a failure here rolls back cleanly.

begin;

-- 1. Retire any old-taxonomy rows before the new CHECK refuses them.
update events
set category = null
where category in ('life_sciences', 'engineering', 'finance', 'technology');

-- 2. Swap the CHECK.
alter table events drop constraint if exists events_category_check;
alter table events add constraint events_category_check
  check (category is null or category in (
    'medicine_dentistry',
    'allied_health',
    'other'
  ));

commit;

-- Self-check: the constraint definition contains every new key and none of
-- the four retired ones. Metadata-only (no fixture inserts) so this test is
-- unaffected by FK requirements on events.created_by, fixture state, or any
-- other schema outside this migration's own scope.
do $selfcheck$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'events_category_check';

  if def is null then
    raise exception 'events_category_check missing after migration';
  end if;

  if def not like '%medicine_dentistry%'
     or def not like '%allied_health%'
     or def not like '%''other''%' then
    raise exception 'events_category_check missing a new-taxonomy key: %', def;
  end if;

  if def like '%life_sciences%'
     or def like '%engineering%'
     or def like '%finance%'
     or def like '%technology%' then
    raise exception 'events_category_check still admits a retired key: %', def;
  end if;
end;
$selfcheck$;
