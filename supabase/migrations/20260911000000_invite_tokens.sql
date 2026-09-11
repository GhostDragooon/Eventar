-- WP-T2: Invite-by-link
-- Token-based team invitations. Cleartext token shown once to the inviter;
-- only the SHA-256 hash is stored. Accept flow creates a staff row.

create table public.invite_tokens (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id),
  token_hash       text not null unique,
  role             text not null check (role in ('organiser_admin','organiser_member')),
  created_by       uuid not null references public.staff(id),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_by      uuid references public.staff(id),
  created_at       timestamptz not null default now()
);

alter table public.invite_tokens enable row level security;

-- Org staff can read their own org's tokens.
create policy "invite_tokens_org_read" on public.invite_tokens
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or organisation_id = app_private.current_staff_org_id()
  );

-- No direct writes — all mutations go through SECURITY DEFINER functions.
revoke insert, update, delete on public.invite_tokens from public, anon, authenticated;

-- =========================================================================
-- create_invite_token(role text)
-- =========================================================================
-- Returns the cleartext token (shown once). Stores the SHA-256 hash.
-- Rate limit: max 10 active unexpired tokens per org.
-- Only organiser_admin or eventar_staff can create.

create function public.create_invite_token(p_role text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor public.staff%rowtype;
  v_token text;
  v_hash text;
  v_active_count int;
begin
  select * into actor from public.staff
    where email = app_private.auth_email()
      and status = 'active'
      and role in ('organiser_admin', 'eventar_staff')
    order by created_at limit 1;

  if actor is null then
    raise exception 'create_invite_token: caller is not an admin'
      using errcode = '42501';
  end if;

  -- Rate limit: max 10 active (unexpired, unaccepted) tokens per org
  select count(*) into v_active_count
    from public.invite_tokens
   where organisation_id = actor.organisation_id
     and accepted_at is null
     and expires_at > now();

  if v_active_count >= 10 then
    raise exception 'create_invite_token: too many active invites (max 10)'
      using errcode = 'P0001';
  end if;

  -- Generate a URL-safe random token
  v_token := encode(extensions.gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.invite_tokens (organisation_id, token_hash, role, created_by, expires_at)
  values (actor.organisation_id, v_hash, p_role, actor.id, now() + interval '7 days');

  return v_token;
end;
$$;

revoke execute on function public.create_invite_token(text) from public, anon;
grant execute on function public.create_invite_token(text) to authenticated, service_role;

-- =========================================================================
-- accept_invite_token(token text)
-- =========================================================================
-- Hashes the cleartext token, looks up the invite, creates a staff row.
-- Returns the organisation name on success.

create function public.accept_invite_token(p_token text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_hash text;
  v_invite public.invite_tokens%rowtype;
  v_email text;
  v_user_id uuid;
  v_org_name text;
  v_existing_staff uuid;
  v_new_staff_id uuid;
begin
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_invite
    from public.invite_tokens
   where token_hash = v_hash
   for update;

  if v_invite is null then
    raise exception 'accept_invite_token: invalid or expired invite link'
      using errcode = '42501';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'accept_invite_token: this invite has already been used'
      using errcode = 'P0001';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'accept_invite_token: this invite has expired'
      using errcode = 'P0001';
  end if;

  -- The accepting user must be authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'accept_invite_token: you must be signed in to accept an invite'
      using errcode = '42501';
  end if;

  v_email := app_private.auth_email();
  if v_email = '' then
    raise exception 'accept_invite_token: could not determine your email'
      using errcode = 'P0001';
  end if;

  -- Check if already a member of this org
  select id into v_existing_staff
    from public.staff
   where email = v_email
     and organisation_id = v_invite.organisation_id
     and status = 'active';

  if v_existing_staff is not null then
    raise exception 'accept_invite_token: you are already a member of this organisation'
      using errcode = 'P0001';
  end if;

  -- Create staff row
  insert into public.staff (email, full_name, role, organisation_id, status)
  values (v_email, null, v_invite.role, v_invite.organisation_id, 'active')
  returning id into v_new_staff_id;

  -- Mark token as accepted
  update public.invite_tokens
     set accepted_at = now(), accepted_by = v_new_staff_id
   where id = v_invite.id;

  -- Get org name for the success message
  select name into v_org_name
    from public.organisations
   where id = v_invite.organisation_id;

  perform public.write_audit_event(
    'invite_accepted', v_user_id, v_invite.role, v_invite.organisation_id,
    'staff', v_new_staff_id,
    jsonb_build_object('invite_id', v_invite.id, 'invited_role', v_invite.role)
  );

  return v_org_name;
end;
$$;

revoke execute on function public.accept_invite_token(text) from public, anon;
grant execute on function public.accept_invite_token(text) to authenticated, service_role;

-- Self-check: verify table and functions exist
do $$
begin
  assert (select count(*) from information_schema.tables
          where table_schema = 'public' and table_name = 'invite_tokens') = 1,
    'invite_tokens table must exist';
  assert (select count(*) from pg_proc
          where proname = 'create_invite_token' and pronamespace = 'public'::regnamespace) = 1,
    'create_invite_token function must exist';
  assert (select count(*) from pg_proc
          where proname = 'accept_invite_token' and pronamespace = 'public'::regnamespace) = 1,
    'accept_invite_token function must exist';
end $$;
