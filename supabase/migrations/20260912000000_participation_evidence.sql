-- ADR-0003 Weekend MVP — Step 1: participation_evidence table.
-- Durable attendance signal — the raw measurement that supports credit,
-- assessment, and export. Attendance-package only (no PII blob).
-- Own hash chain (K2 mechanics), append-only, SECURITY DEFINER writes.
-- Block: B1 (Events & Attendance).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.participation_evidence (
  id                    uuid primary key default gen_random_uuid(),
  chain_seq             bigint generated always as identity,
  organisation_id       uuid not null references public.organisations(id),
  event_id              uuid not null references public.events(id),
  occurrence_id         uuid references public.event_occurrences(id),
  registration_id       uuid references public.registrations(id),
  user_id               uuid references public.users(id),
  evidence_type         text not null
                          check (evidence_type in ('check_in','check_out','session_mark','correction')),
  capture_method        text not null
                          check (capture_method in ('qr_scan','staff_scan','self_serve','manual_entry','ble_proximity')),
  source                text not null
                          check (source in ('live_checkin','staff_attestation','device_attestation','administrative')),
  captured_at           timestamptz not null,
  attestation_strength  text not null
                          check (attestation_strength in ('strong','standard','weak')),
  actor_id              uuid references public.users(id),
  device_metadata       jsonb not null default '{}',
  source_nonce          text,
  previous_evidence_id  uuid references public.participation_evidence(id),
  local_unlock_metadata jsonb,
  prev_hash             bytea,
  hash                  bytea not null,
  created_at            timestamptz not null default now()
);

-- One original evidence per (registration, occurrence, type).
-- Corrections (previous_evidence_id IS NOT NULL) are not constrained.
create unique index participation_evidence_original_uniq
  on public.participation_evidence (registration_id, occurrence_id, evidence_type)
  where previous_evidence_id is null;

create index participation_evidence_event_idx on public.participation_evidence(event_id);
create index participation_evidence_registration_idx on public.participation_evidence(registration_id);
create index participation_evidence_user_idx on public.participation_evidence(user_id);
create index participation_evidence_chain_seq_idx on public.participation_evidence(chain_seq);
create index participation_evidence_nonce_idx on public.participation_evidence(source_nonce)
  where source_nonce is not null;

alter table public.participation_evidence enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — same shape as registration_checkins
-- ---------------------------------------------------------------------------
create policy "participation_evidence_organizer_select_own"
  on public.participation_evidence
  for select to authenticated
  using (exists (
    select 1
    from public.registrations r
    join public.events e on e.id = r.event_id
    where r.id = participation_evidence.registration_id
      and e.created_by = app_private.current_staff_id()
  ));

create policy "participation_evidence_manager_select_all"
  on public.participation_evidence
  for select to authenticated
  using (app_private.is_manager());

create policy "participation_evidence_self_read"
  on public.participation_evidence
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Hard Rule 11 — lifecycle, definer-only INSERT/UPDATE, service_role DELETE
-- retained for cleanup/erasure (same posture as practitioner_licences).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.participation_evidence
  from anon, authenticated, service_role;
grant  delete on public.participation_evidence to service_role;

-- ---------------------------------------------------------------------------
-- Hash-chain trigger — own advisory lock, same K2 mechanics as credit_ledger
-- ---------------------------------------------------------------------------
create function public.compute_evidence_hash() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_prev_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtext('participation_evidence_chain'));

  new.chain_seq := nextval('public.participation_evidence_chain_seq_seq');

  select hash into v_prev_hash from public.participation_evidence
    order by chain_seq desc limit 1;

  new.prev_hash := coalesce(v_prev_hash, 'GENESIS'::bytea);
  new.hash := extensions.digest(
    new.id::text || new.evidence_type || new.event_id::text ||
    coalesce(new.registration_id::text, '') ||
    coalesce(new.occurrence_id::text, '') ||
    new.capture_method || new.source ||
    new.captured_at::text || new.attestation_strength ||
    new.prev_hash::text || new.created_at::text,
    'sha256'
  );
  return new;
end;
$$;

create trigger participation_evidence_chain_hash
  before insert on public.participation_evidence
  for each row execute function public.compute_evidence_hash();

revoke all on function public.compute_evidence_hash() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_evidence_chain() — same shape as verify_ledger_chain()
-- ---------------------------------------------------------------------------
create function public.verify_evidence_chain()
returns table(chain_seq bigint, link_valid boolean, content_valid boolean)
language sql security definer set search_path = public, extensions, pg_temp as $$
  with ordered as (
    select *, lag(hash) over (order by pe.chain_seq) as expected_prev
    from public.participation_evidence pe
  )
  select
    ordered.chain_seq,
    (ordered.prev_hash = coalesce(ordered.expected_prev, 'GENESIS'::bytea)) as link_valid,
    (ordered.hash = extensions.digest(
      ordered.id::text || ordered.evidence_type || ordered.event_id::text ||
      coalesce(ordered.registration_id::text, '') ||
      coalesce(ordered.occurrence_id::text, '') ||
      ordered.capture_method || ordered.source ||
      ordered.captured_at::text || ordered.attestation_strength ||
      ordered.prev_hash::text || ordered.created_at::text,
      'sha256'
    )) as content_valid
  from ordered
  order by ordered.chain_seq;
$$;

revoke all on function public.verify_evidence_chain() from public, anon;
grant execute on function public.verify_evidence_chain() to authenticated;

-- ---------------------------------------------------------------------------
-- record_participation_evidence() — SECURITY DEFINER writer
-- Idempotent on source_nonce: if a row with the same nonce exists, returns
-- its id without error.
-- ---------------------------------------------------------------------------
create function public.record_participation_evidence(
  p_organisation_id       uuid,
  p_event_id              uuid,
  p_occurrence_id         uuid default null,
  p_registration_id       uuid default null,
  p_user_id               uuid default null,
  p_evidence_type         text default 'check_in',
  p_capture_method        text default 'manual_entry',
  p_source                text default 'staff_attestation',
  p_captured_at           timestamptz default now(),
  p_attestation_strength  text default 'standard',
  p_actor_id              uuid default null,
  p_device_metadata       jsonb default '{}',
  p_source_nonce          text default null,
  p_previous_evidence_id  uuid default null,
  p_local_unlock_metadata jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- Idempotent on source_nonce
  if p_source_nonce is not null then
    select id into v_existing_id
    from public.participation_evidence
    where source_nonce = p_source_nonce;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.participation_evidence (
    organisation_id, event_id, occurrence_id, registration_id, user_id,
    evidence_type, capture_method, source, captured_at, attestation_strength,
    actor_id, device_metadata, source_nonce, previous_evidence_id,
    local_unlock_metadata
  ) values (
    p_organisation_id, p_event_id, p_occurrence_id, p_registration_id, p_user_id,
    p_evidence_type, p_capture_method, p_source, p_captured_at, p_attestation_strength,
    p_actor_id, p_device_metadata, p_source_nonce, p_previous_evidence_id,
    p_local_unlock_metadata
  ) returning id into v_new_id;

  -- Audit insert last (Hard Rule: audit_events is the last write)
  perform public.write_audit_event(
    'evidence_recorded', p_actor_id, 'system',
    p_organisation_id, 'participation_evidence', v_new_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'evidence_type', p_evidence_type,
      'capture_method', p_capture_method,
      'source', p_source,
      'attestation_strength', p_attestation_strength
    )
  );

  return v_new_id;
end;
$$;

-- service_role only — no authenticated/anon caller
revoke all on function public.record_participation_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, text,
  uuid, jsonb, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_participation_evidence(
  uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, text,
  uuid, jsonb, text, uuid, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'participation_evidence'
  ) then
    raise exception 'participation_evidence table was not created';
  end if;

  -- Verify grant revokes (INSERT/UPDATE denied for all; DELETE retained for service_role)
  if has_table_privilege('authenticated', 'public.participation_evidence', 'INSERT') then
    raise exception 'authenticated can INSERT participation_evidence — grant revoke failed';
  end if;
  if has_table_privilege('service_role', 'public.participation_evidence', 'INSERT') then
    raise exception 'service_role can INSERT participation_evidence — grant revoke failed';
  end if;
  if not has_table_privilege('service_role', 'public.participation_evidence', 'DELETE') then
    raise exception 'service_role lost DELETE on participation_evidence — retained grant failed';
  end if;

  -- Verify function grants
  if has_function_privilege('anon', 'public.record_participation_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,jsonb,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'anon can EXECUTE record_participation_evidence';
  end if;
  if not has_function_privilege('service_role', 'public.record_participation_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,jsonb,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role lost EXECUTE on record_participation_evidence';
  end if;
end $$;
