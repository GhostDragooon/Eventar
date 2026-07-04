-- CPD Sprint 1 / M5 — tamper-evident audit chain.
-- Design: docs/architecture/BASELINE-DELTAS.md §3.2 (chain_seq under
-- advisory lock), §3.4 (honest tamper wording). TSA anchor deferred.
-- HARD RULE: any transaction calling write_audit_event() emits it as the
-- LAST statement before commit (the xact lock is held until commit).

create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  chain_seq       bigint generated always as identity unique,
  event_type      text not null check (length(trim(event_type)) > 0),
  actor_user_id   uuid,
  actor_role      text,
  organisation_id uuid,
  subject_type    text,
  subject_id      uuid,
  payload         jsonb not null default '{}'::jsonb,
  prev_hash       text not null,
  hash            text not null,
  created_at      timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_subject_idx on public.audit_events (subject_type, subject_id);
create index audit_events_org_idx     on public.audit_events (organisation_id, created_at desc);

-- Insert-only writer role. Granted to postgres so postgres may own the
-- SECURITY DEFINER writer function below.
create role audit_writer nologin;
grant audit_writer to postgres;
grant usage on schema public to audit_writer;
grant usage on schema app_private to audit_writer;
grant select, insert on public.audit_events to audit_writer;
grant usage, select on sequence public.audit_events_chain_seq_seq to audit_writer;

-- compute_audit_hash() is NOT security definer, so it runs as whatever
-- role performs the INSERT — which is audit_writer once write_audit_event
-- (below) becomes SECURITY DEFINER owned by audit_writer. It calls
-- extensions.digest(text, text); audit_writer needs both schema USAGE
-- and EXECUTE on that specific overload (pgcrypto also exposes
-- digest(bytea, text), which audit_writer does not need).
grant usage on schema extensions to audit_writer;
grant execute on function extensions.digest(text, text) to audit_writer;

-- Chain trigger. chain_seq MUST be drawn inside the advisory lock:
-- identity defaults evaluate at tuple formation (before BEFORE triggers),
-- so the pre-assigned value's order need not match lock-acquisition
-- order. Overwriting inside the lock guarantees
-- lock order == chain_seq order == chain order.
create function public.compute_audit_hash() returns trigger
  language plpgsql set search_path = public, pg_temp as
$$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  new.chain_seq := nextval('public.audit_events_chain_seq_seq');
  select hash into last_hash
    from public.audit_events order by chain_seq desc limit 1;
  new.prev_hash := coalesce(last_hash, 'GENESIS');
  new.hash := encode(extensions.digest(
      new.chain_seq::text
      || new.event_type
      || coalesce(new.actor_user_id::text, '')
      || coalesce(new.subject_id::text, '')
      || new.payload::text
      || new.prev_hash
      || new.created_at::text,
      'sha256'), 'hex');
  return new;
end;
$$;

create trigger audit_events_hash_trigger
  before insert on public.audit_events
  for each row execute function public.compute_audit_hash();

alter table public.audit_events enable row level security;

-- The trigger (running as audit_writer inside write_audit_event) must
-- read the previous row and insert the new one.
create policy "audit_events_writer_select" on public.audit_events
  for select to audit_writer using (true);
create policy "audit_events_writer_insert" on public.audit_events
  for insert to audit_writer with check (true);

create policy "audit_events_staff_read" on public.audit_events
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

-- No UPDATE/DELETE policy exists for any role, and privileges are revoked
-- below. Honest claim: APPLICATION roles cannot modify audit rows; the
-- table owner (postgres, i.e. dashboard SQL) can — owner-level tampering
-- is detectable via verify_audit_chain, externally provable once the TSA
-- anchor lands (Phase 2).
revoke update, delete on public.audit_events from public;
revoke update, delete on public.audit_events from anon;
revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.audit_events from service_role;
revoke insert on public.audit_events from anon;
revoke insert on public.audit_events from authenticated;
revoke insert on public.audit_events from service_role;

-- Single write path.
create function public.write_audit_event(
  p_event_type      text,
  p_actor_user_id   uuid default null,
  p_actor_role      text default null,
  p_organisation_id uuid default null,
  p_subject_type    text default null,
  p_subject_id      uuid default null,
  p_payload         jsonb default '{}'::jsonb
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  new_id uuid;
begin
  if p_event_type is null or trim(p_event_type) = '' then
    raise exception 'event_type is required';
  end if;
  insert into public.audit_events
    (event_type, actor_user_id, actor_role, organisation_id,
     subject_type, subject_id, payload)
  values
    (p_event_type, p_actor_user_id, p_actor_role, p_organisation_id,
     p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

-- ALTER FUNCTION ... OWNER TO requires the target role to hold CREATE on
-- the function's schema at the moment of transfer (distinct from needing
-- it afterward). Grant it just for the transfer, then revoke immediately
-- so audit_writer's standing privileges stay exactly SELECT+INSERT on
-- audit_events — no lasting CREATE on public.
grant create on schema public to audit_writer;
alter function public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  owner to audit_writer;
revoke create on schema public from audit_writer;
grant execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  to authenticated, service_role;

-- Chain verifier. Checks BOTH linkage (prev_hash matches predecessor's
-- hash) and content (stored hash matches recomputation).
create function public.verify_audit_chain()
returns table (
  chain_seq     bigint,
  event_id      uuid,
  link_valid    boolean,
  content_valid boolean
)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  prev text := 'GENESIS';
  r record;
begin
  for r in
    select * from public.audit_events a order by a.chain_seq
  loop
    chain_seq     := r.chain_seq;
    event_id      := r.id;
    link_valid    := (r.prev_hash = prev);
    content_valid := (r.hash = encode(extensions.digest(
        r.chain_seq::text || r.event_type
        || coalesce(r.actor_user_id::text, '')
        || coalesce(r.subject_id::text, '')
        || r.payload::text || r.prev_hash || r.created_at::text,
        'sha256'), 'hex'));
    prev := r.hash;
    return next;
  end loop;
end;
$$;

grant execute on function public.verify_audit_chain() to service_role;
