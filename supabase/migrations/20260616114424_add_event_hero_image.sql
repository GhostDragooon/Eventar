-- BACKFILLED 2026-07-04 from remote supabase_migrations.schema_migrations
-- (applied to remote 2026-06-16 via MCP during the redesign phase without a
-- local file — drift repair, content verbatim from the stored statements).

-- Wave 3: hero image upload.
-- Column carries the public URL to the uploaded image in the
-- event-hero-images bucket. Nullable — fallback is the palette color
-- rendered by the public event page when null.
alter table public.events
  add column hero_image_url text;

-- Storage bucket — public read, image MIME whitelist, 5MB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-hero-images',
  'event-hero-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS for the bucket: any authenticated staff (per app_private.current_staff_id)
-- can upload, update, or delete in the bucket. Public read inherited from the
-- bucket's public=true flag. Application code controls the path layout
-- ({event_id}/...) so cross-event tampering still requires the attacker to be
-- staff AND know a target's event UUID.
drop policy if exists "event_hero_images_staff_insert" on storage.objects;
create policy "event_hero_images_staff_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-hero-images'
    and app_private.current_staff_id() is not null
  );

drop policy if exists "event_hero_images_staff_update" on storage.objects;
create policy "event_hero_images_staff_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-hero-images'
    and app_private.current_staff_id() is not null
  );

drop policy if exists "event_hero_images_staff_delete" on storage.objects;
create policy "event_hero_images_staff_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-hero-images'
    and app_private.current_staff_id() is not null
  );

-- Update the event RPCs to include hero_image_url. Same nullif pattern
-- the other nullable text columns use.
create or replace function public.create_event_with_blocks(
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_event_id uuid;
  block jsonb;
begin
  insert into public.events (
    title, topic, description, max_attendees, status,
    start_time, end_time, timezone,
    venue_name, venue_address, city, region, country, latitude, longitude,
    hosted_by, organized_by,
    hero_image_url,
    created_by
  ) values (
    event_input->>'title',
    event_input->>'topic',
    event_input->>'description',
    nullif(event_input->>'max_attendees','')::int,
    coalesce(event_input->>'status','draft'),
    (event_input->>'start_time')::timestamptz,
    (event_input->>'end_time')::timestamptz,
    event_input->>'timezone',
    event_input->>'venue_name',
    event_input->>'venue_address',
    event_input->>'city',
    event_input->>'region',
    event_input->>'country',
    (event_input->>'latitude')::double precision,
    (event_input->>'longitude')::double precision,
    coalesce(event_input->'hosted_by',    '[]'::jsonb),
    coalesce(event_input->'organized_by', '[]'::jsonb),
    nullif(event_input->>'hero_image_url',''),
    app_private.current_staff_id()
  )
  returning id into new_event_id;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
    insert into public.agenda_blocks (
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      new_event_id,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      block->>'host',
      coalesce(block->'topics', '[]'::jsonb),
      block->>'notes',
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return new_event_id;
end;
$$;

grant execute on function public.create_event_with_blocks(jsonb, jsonb) to authenticated;

create or replace function public.update_event_with_blocks(
  event_id_input uuid,
  event_input jsonb,
  blocks_input jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  block jsonb;
begin
  select created_by into owner_id
  from public.events
  where id = event_id_input;

  if owner_id is null then
    raise exception 'event % not found or not visible', event_id_input;
  end if;
  if owner_id is distinct from app_private.current_staff_id() then
    raise exception 'not the owner of event %', event_id_input;
  end if;

  update public.events set
    title          = event_input->>'title',
    topic          = nullif(event_input->>'topic',''),
    description    = nullif(event_input->>'description',''),
    max_attendees  = nullif(event_input->>'max_attendees','')::int,
    status         = coalesce(event_input->>'status', status),
    start_time     = (event_input->>'start_time')::timestamptz,
    end_time       = (event_input->>'end_time')::timestamptz,
    timezone       = event_input->>'timezone',
    venue_name     = event_input->>'venue_name',
    venue_address  = nullif(event_input->>'venue_address',''),
    city           = event_input->>'city',
    region         = nullif(event_input->>'region',''),
    country        = event_input->>'country',
    latitude       = (event_input->>'latitude')::double precision,
    longitude      = (event_input->>'longitude')::double precision,
    hosted_by      = coalesce(event_input->'hosted_by',    '[]'::jsonb),
    organized_by   = coalesce(event_input->'organized_by', '[]'::jsonb),
    hero_image_url = nullif(event_input->>'hero_image_url','')
  where id = event_id_input;

  if blocks_input is null or jsonb_typeof(blocks_input) <> 'array' then
    raise exception 'blocks_input must be a jsonb array';
  end if;

  delete from public.agenda_blocks where event_id = event_id_input;

  for block in select * from jsonb_array_elements(blocks_input)
  loop
    insert into public.agenda_blocks (
      event_id, start_time, end_time, kind, title, host, topics, notes, display_order
    ) values (
      event_id_input,
      (block->>'start_time')::timestamptz,
      (block->>'end_time')::timestamptz,
      block->>'kind',
      block->>'title',
      nullif(block->>'host',''),
      coalesce(block->'topics', '[]'::jsonb),
      nullif(block->>'notes',''),
      coalesce((block->>'display_order')::int, 0)
    );
  end loop;

  return event_id_input;
end;
$$;

grant execute on function public.update_event_with_blocks(uuid, jsonb, jsonb) to authenticated;
