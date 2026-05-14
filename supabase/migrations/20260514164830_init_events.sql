create table public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  topic         text,
  format        text,
  start_time    timestamptz not null,
  end_time      timestamptz not null check (end_time > start_time),
  timezone      text not null,
  location      text,
  speakers      jsonb not null default '[]'::jsonb,
  description   text,
  agenda        text,
  poster_path   text,
  max_attendees int check (max_attendees is null or max_attendees > 0),
  status        text not null default 'draft'
                check (status in ('draft','published','completed','cancelled')),
  created_by    uuid not null references public.staff(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_status_starttime_idx on public.events(status, start_time);

create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

-- Public: read published events only.
create policy "events_public_read_published" on public.events
  for select to anon, authenticated
  using (status = 'published');

-- Organizers: full CRUD on their own events.
create policy "events_organizer_select_own" on public.events
  for select to authenticated
  using (created_by = current_staff_id());
create policy "events_organizer_insert_own" on public.events
  for insert to authenticated
  with check (created_by = current_staff_id());
create policy "events_organizer_update_own" on public.events
  for update to authenticated
  using (created_by = current_staff_id())
  with check (created_by = current_staff_id());
create policy "events_organizer_delete_own" on public.events
  for delete to authenticated
  using (created_by = current_staff_id());

-- Managers: read all.
create policy "events_manager_read_all" on public.events
  for select to authenticated
  using (is_manager());
