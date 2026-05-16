create table public.agenda_blocks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  start_time    timestamptz not null,
  end_time      timestamptz not null check (end_time > start_time),
  kind          text not null check (kind in (
                  'workshop','seminar','webinar','scientific_program',
                  'panel','roundtable','keynote','other',
                  'break','transition'
                )),
  title         text not null,
  host          text,
  topics        jsonb not null default '[]'::jsonb,
  notes         text,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agenda_blocks_event_time_idx on public.agenda_blocks(event_id, start_time);

create trigger agenda_blocks_touch_updated_at
  before update on public.agenda_blocks
  for each row execute function public.touch_updated_at();

alter table public.agenda_blocks enable row level security;

create policy "agenda_blocks_public_read_when_event_published" on public.agenda_blocks
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.status = 'published'
  ));

create policy "agenda_blocks_organizer_full" on public.agenda_blocks
  for all to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = current_staff_id()
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = agenda_blocks.event_id and e.created_by = current_staff_id()
  ));

create policy "agenda_blocks_manager_read_all" on public.agenda_blocks
  for select to authenticated
  using (is_manager());
