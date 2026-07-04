-- CPD Sprint 1 / M6 — consent records, data subject requests, and the
-- pseudonymisation function with the privilege-escalation fix
-- (BASELINE-DELTAS §3.1): staff check INSIDE the function, audit write
-- in the same transaction, audit emitted LAST.

create table public.consent_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  consent_type text not null check (consent_type in
    ('terms_of_service','privacy_policy','ai_processing_notice','marketing')),
  version      text not null,
  granted_at   timestamptz not null default now(),
  withdrawn_at timestamptz,
  context      jsonb not null default '{}'::jsonb
);

create index consent_records_user_idx
  on public.consent_records (user_id, consent_type, granted_at desc);

alter table public.consent_records enable row level security;

create policy "consent_self_read" on public.consent_records
  for select to authenticated using (user_id = auth.uid());
create policy "consent_self_insert" on public.consent_records
  for insert to authenticated with check (user_id = auth.uid());
create policy "consent_self_withdraw" on public.consent_records
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "consent_staff_read" on public.consent_records
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

create table public.data_subject_requests (
  id                uuid primary key default gen_random_uuid(),
  subject_user_id   uuid not null references public.users(id) on delete cascade,
  request_type      text not null check (request_type in
    ('access','rectification','erasure','restriction','objection','portability')),
  status            text not null default 'pending' check (status in
    ('pending','in_progress','completed','rejected','escalated')),
  submitted_at      timestamptz not null default now(),
  due_at            timestamptz not null default (now() + interval '30 days'),
  resolved_at       timestamptz,
  resolver_staff_id uuid references public.staff(id),
  request_notes     text,
  resolution_notes  text
);

create index dsr_status_due_idx on public.data_subject_requests (status, due_at);
create index dsr_subject_idx    on public.data_subject_requests (subject_user_id);

alter table public.data_subject_requests enable row level security;

create policy "dsr_self_read" on public.data_subject_requests
  for select to authenticated using (subject_user_id = auth.uid());
create policy "dsr_self_create" on public.data_subject_requests
  for insert to authenticated with check (subject_user_id = auth.uid());
create policy "dsr_staff_all" on public.data_subject_requests
  for all to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff())
  with check (app_private.is_manager() or app_private.is_eventar_staff());

-- Pseudonymisation (erasure DSR fulfilment, DB side). The authorisation
-- check lives INSIDE the function: exposing it via PostgREST RPC with a
-- grant to authenticated is safe because non-staff callers get 42501.
-- Session revocation + auth.users email scrubbing happen in the app
-- layer via the Supabase admin API (Sprint 2 wires the full DSR flow).
create function public.pseudonymise_user(p_user_id uuid, p_reason text)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor_staff public.staff%rowtype;
  pseudonym   text;
begin
  select * into actor_staff
  from public.staff
  where email = app_private.auth_email()
    and role in ('manager','eventar_staff')
    and status = 'active'
  order by created_at limit 1;

  if actor_staff.id is null then
    raise exception 'pseudonymise_user: caller is not active staff'
      using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'pseudonymise_user: reason is required';
  end if;

  pseudonym := 'ERASED-' || encode(extensions.gen_random_bytes(6), 'hex');

  update public.users
     set full_name = pseudonym,
         pseudonymised_at = now(),
         deleted_at = now()
   where id = p_user_id
     and pseudonymised_at is null;

  if not found then
    raise exception
      'pseudonymise_user: user % not found or already pseudonymised',
      p_user_id;
  end if;

  -- LAST statement before return: audit write (same transaction).
  perform public.write_audit_event(
    'user_pseudonymised',
    auth.uid(),
    actor_staff.role,
    actor_staff.organisation_id,
    'user',
    p_user_id,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.pseudonymise_user(uuid, text)
  to authenticated, service_role;
