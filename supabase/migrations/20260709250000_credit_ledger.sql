-- CPD Sprint 3a — credit_ledger. Append-only, own hash chain (Credit
-- Ledger §8.4, resolved: separate from audit_events to avoid doubling
-- advisory-lock contention under check-in bursts). text+CHECK per Rule 2.

create table public.credit_ledger (
  id                     uuid primary key default gen_random_uuid(),
  chain_seq              bigint generated always as identity,
  licence_id             uuid not null references public.practitioner_licences(id),
  user_id                uuid not null references public.users(id),
  event_id               uuid references public.events(id),
  body_id                uuid not null references public.accrediting_bodies(id),
  entry_type             text not null
                            check (entry_type in (
                              'credit_earned','credit_adjusted','credit_transferred',
                              'credit_expired','credit_revoked'
                            )),
  points                 numeric,
  hours                  numeric,
  category               text,
  effective_date         date not null,
  expires_at             date,
  references_entry_id    uuid references public.credit_ledger(id),
  transfer_reference_id  uuid,
  reason                 text,
  actor_id               uuid references public.users(id),
  attestation_status     text
                            check (attestation_status in ('organiser_attested','body_confirmed')),
  created_at             timestamptz not null default now(),
  prev_hash              bytea,
  hash                   bytea not null
);

create index credit_ledger_licence_idx on public.credit_ledger(licence_id);
create index credit_ledger_body_idx on public.credit_ledger(body_id);
create index credit_ledger_chain_seq_idx on public.credit_ledger(chain_seq);

alter table public.credit_ledger enable row level security;

-- No UPDATE/DELETE policy for any role — append-only, enforced by RLS
-- absence (not just convention), matching audit_events.
create policy "credit_ledger_self_read" on public.credit_ledger
  for select to authenticated
  using (user_id = auth.uid());

create policy "credit_ledger_body_admin_read" on public.credit_ledger
  for select to authenticated
  using (exists (
    select 1 from public.accrediting_bodies ab
    join public.staff s on s.organisation_id = ab.organisation_id
    where ab.id = credit_ledger.body_id
      and s.email = app_private.auth_email()
      and s.status = 'active'
      and s.role in ('body_admin','eventar_staff')
  ));
-- No INSERT policy for authenticated/anon: all writes go through the
-- SECURITY DEFINER function in Task 9, never direct table INSERT.

-- Hash-chain trigger — same shape as audit_events' Sprint-1 fix, own lock name.
-- chain_seq MUST be drawn inside the advisory lock: identity defaults evaluate
-- at tuple formation (before BEFORE triggers), so the pre-assigned value's
-- order need not match lock-acquisition order. Overwriting inside the lock
-- guarantees lock order == chain_seq order == chain order (mirrors
-- compute_audit_hash() — without it the lag()-based link check in
-- verify_ledger_chain() can break under concurrent inserts).
create function public.compute_credit_ledger_hash() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_prev_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtext('credit_ledger_chain'));

  new.chain_seq := nextval('public.credit_ledger_chain_seq_seq');

  select hash into v_prev_hash from public.credit_ledger
    order by chain_seq desc limit 1;

  new.prev_hash := coalesce(v_prev_hash, 'GENESIS'::bytea);
  new.hash := extensions.digest(
    new.id::text || new.entry_type || new.licence_id::text ||
    coalesce(new.points::text,'') || coalesce(new.hours::text,'') ||
    new.effective_date::text || new.prev_hash::text || new.created_at::text,
    'sha256'
  );
  return new;
end;
$$;

create trigger credit_ledger_chain_hash
  before insert on public.credit_ledger
  for each row execute function public.compute_credit_ledger_hash();

-- verify_ledger_chain() — mirrors verify_audit_chain()'s shape exactly.
create function public.verify_ledger_chain()
returns table(chain_seq bigint, link_valid boolean, content_valid boolean)
language sql security definer set search_path = public, extensions, pg_temp as $$
  with ordered as (
    select *, lag(hash) over (order by chain_seq) as expected_prev
    from public.credit_ledger
  )
  select
    ordered.chain_seq,
    (ordered.prev_hash = coalesce(ordered.expected_prev, 'GENESIS'::bytea)) as link_valid,
    (ordered.hash = extensions.digest(
      ordered.id::text || ordered.entry_type || ordered.licence_id::text ||
      coalesce(ordered.points::text,'') || coalesce(ordered.hours::text,'') ||
      ordered.effective_date::text || ordered.prev_hash::text || ordered.created_at::text,
      'sha256'
    )) as content_valid
  from ordered
  order by ordered.chain_seq;
$$;

-- Rule 6 grant hygiene: revoke everything (incl. the bare PUBLIC entry that
-- this project's schema-wide default ACL grants at CREATE time), grant back
-- only what's needed. compute_credit_ledger_hash is trigger-only (runs as its
-- owner via the trigger) — grant nothing back to app roles.
revoke all on function public.compute_credit_ledger_hash() from public, anon, authenticated;
revoke all on function public.verify_ledger_chain() from public, anon;
grant execute on function public.verify_ledger_chain() to authenticated; -- staff-facing verification, RLS still governs what rows they can see
