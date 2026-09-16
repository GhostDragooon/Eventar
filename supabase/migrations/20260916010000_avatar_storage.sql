-- WP-A — avatar_url column + storage bucket.
-- Plan Phase 2: shipped ahead of the guided-flow build so the optional
-- photo step has somewhere to write to. Photo stays optional/skippable at
-- creation (write-up §3.2) — this migration only opens the door.

alter table public.users
  add column if not exists avatar_url text;

comment on column public.users.avatar_url is
  'Public URL into the avatars storage bucket. Optional, skippable at account creation (write-up §3.2/§9).';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Authenticated users may write only under their own uid-prefixed path;
-- anyone may read (bucket is public — avatars are display images, not PII
-- in the Hard-Rule-10 sense of the word, same posture as any public avatar).
create policy "avatars_self_write"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_self_update"
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_self_delete"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_public_read"
  on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'avatars') then
    raise exception 'avatar_storage self-check: avatars bucket missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'avatar_url'
  ) then
    raise exception 'avatar_storage self-check: users.avatar_url missing';
  end if;
end $$;
