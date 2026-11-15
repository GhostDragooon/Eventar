-- Hard rule 8 (three-layer validation), layer 3, for agenda blocks: a block sits inside its event's window.
-- The form (AgendaSection) and both Server Actions (blockFitsEnvelope, inclusive bounds) check it; nothing in the
-- database did, so the RPCs and a service_role write could place a block outside its event (DB-lens finding m6,
-- backtest MINOR-1, deferred from the MVP walk).
--
-- Rule: block.start_time >= event.start_time and block.end_time <= event.end_time. Enforced by DEFERRED constraint
-- triggers, so one transaction can move the event window and its blocks together (update_event_with_blocks writes the
-- event first, then the blocks) and the check runs at commit against the final rows.
--   * agenda_blocks INSERT, and UPDATE when a time column really changes;
--   * events UPDATE when start_time or end_time really changes (a window that shrinks past a block is refused).
-- Existing rows are not rewritten and are not re-checked by an unrelated write: a legacy block already outside its
-- window (published events, which are frozen by the draft-only guard) only blocks a later move of that event's window
-- or of that block's own times. The count of such rows is reported below as a NOTICE.
--
-- SQLSTATE 23514 (check_violation). SECURITY DEFINER with a pinned search_path so the check sees every row of the
-- event whatever the caller's RLS visibility is.

create or replace function app_private.agenda_block_inside_event_window()
returns trigger
language plpgsql
-- VOLATILE on purpose: a STABLE function does not see the rows its own statement wrote, so under
-- `set constraints … immediate` the check ran at the end of the INSERT and passed a bad block.
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bad uuid;
begin
  if tg_table_name = 'agenda_blocks' then
    select b.id into v_bad
      from public.agenda_blocks b
      join public.events e on e.id = b.event_id
     where b.id = new.id and (b.start_time < e.start_time or b.end_time > e.end_time);
  else
    select b.id into v_bad
      from public.events e
      join public.agenda_blocks b on b.event_id = e.id
     where e.id = new.id and (b.start_time < e.start_time or b.end_time > e.end_time)
     limit 1;
  end if;
  if v_bad is not null then
    raise exception 'agenda_block_outside_event_window: block % runs outside its event''s start/end window', v_bad
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function app_private.agenda_block_inside_event_window() from public, anon, authenticated;

create constraint trigger agenda_blocks_inside_window_ins
  after insert on public.agenda_blocks
  deferrable initially deferred
  for each row execute function app_private.agenda_block_inside_event_window();

create constraint trigger agenda_blocks_inside_window_upd
  after update on public.agenda_blocks
  deferrable initially deferred
  for each row
  when (old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time)
  execute function app_private.agenda_block_inside_event_window();

create constraint trigger events_window_covers_blocks
  after update on public.events
  deferrable initially deferred
  for each row
  when (old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time)
  execute function app_private.agenda_block_inside_event_window();

do $$
declare
  n_bad integer;
  n_trg integer;
begin
  select count(*) into n_bad
    from public.agenda_blocks b join public.events e on e.id = b.event_id
   where b.start_time < e.start_time or b.end_time > e.end_time;
  raise notice 'agenda_block_inside_event_window: % existing block(s) already outside their event window (left as they are)', n_bad;

  select count(*) into n_trg
    from pg_trigger
   where tgname in ('agenda_blocks_inside_window_ins', 'agenda_blocks_inside_window_upd', 'events_window_covers_blocks')
     and tgdeferrable and tginitdeferred and not tgisinternal;
  if n_trg <> 3 then
    raise exception 'agenda window: expected 3 deferred constraint triggers, found %', n_trg;
  end if;
end $$;
