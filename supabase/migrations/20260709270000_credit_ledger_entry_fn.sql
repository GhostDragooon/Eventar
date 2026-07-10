-- CPD Sprint 3a / Task 9 — generic ledger-entry writer + dispute table.
-- service_role-only: no live caller exists yet (the event-transition wiring
-- that will call this is Sprint 3b, and runs server-side). It exists so the
-- ledger is written through a single controlled path and so integration tests
-- can exercise the chain.
--
-- SECURITY DEFINER is load-bearing here, not incidental: Task 8's C3 hardening
-- (20260709260000) REVOKED insert/update/delete on credit_ledger from anon,
-- authenticated AND service_role, so a plain service_role INSERT can no longer
-- write the ledger directly. A SECURITY DEFINER function runs as its OWNER
-- (postgres, the table owner), which retains full DML rights — so the insert
-- below succeeds via the definer, exactly as write_audit_event does after
-- audit_events' own revokes. If this insert ever fails with 42501, the fix is
-- the definer/owner setup, NOT re-granting INSERT to service_role (that would
-- undo Task 8 C3 and reopen the append-only bypass).
--
-- The BEFORE-INSERT trigger compute_credit_ledger_hash (Task 8) computes
-- hash/prev_hash/chain_seq under the credit_ledger_chain advisory lock; this
-- function does a plain insert and lets the trigger fire. Per Rule 7 the ledger
-- insert IS the last statement (its own chain via the trigger) — a credit entry
-- is not also duplicated into audit_events, so there is no write_audit_event
-- call here.

create or replace function public.record_credit_entry(
  p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid,
  p_entry_type text, p_points numeric, p_hours numeric, p_category text,
  p_effective_date date, p_attestation_status text, p_actor_id uuid default null,
  p_references_entry_id uuid default null, p_reason text default null
) returns public.credit_ledger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.credit_ledger;
begin
  insert into public.credit_ledger
    (licence_id, user_id, event_id, body_id, entry_type, points, hours, category,
     effective_date, attestation_status, actor_id, references_entry_id, reason)
  values
    (p_licence_id, p_user_id, p_event_id, p_body_id, p_entry_type, p_points, p_hours,
     p_category, p_effective_date, p_attestation_status, p_actor_id,
     p_references_entry_id, p_reason)
  returning * into v_row; -- ledger insert IS the last statement — own chain via
                          -- the credit_ledger_chain trigger; no separate audit write (Rule 7)
  return v_row;
end;
$$;

-- Rule 6 grant hygiene: revoke the schema-wide default ACL (public/anon/
-- authenticated) then grant EXECUTE to service_role ONLY. service_role is the
-- sole controlled caller (Sprint 3b's server-side event-transition wiring runs
-- as service_role); there is no authenticated/anon caller. Verify proacl shows
-- exactly service_role (+ owner postgres) and NO anon/authenticated/bare-PUBLIC.
revoke all on function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text
) to service_role;

-- credit_dispute — Credit Ledger §7, resolved, unaffected by the review gate
-- (Event Lifecycle §9.3 locked "credit and mark for adjustment" in Q25). A
-- practitioner-raised dispute over a specific ledger entry; resolution flows
-- through NEW ledger entries (resolution_reference), never a mutation of the
-- disputed row — the ledger stays append-only. text + CHECK, gen_random_uuid()
-- per Rule 2.
create table public.credit_dispute (
  id                   uuid primary key default gen_random_uuid(),
  ledger_entry_id      uuid not null references public.credit_ledger(id),
  raised_by            uuid not null references public.users(id),
  raised_at            timestamptz not null default now(),
  reason               text not null,
  status               text not null default 'open'
                          check (status in ('open','under_review','resolved_no_change',
                                             'resolved_corrected','resolved_revoked')),
  resolution_reference uuid references public.credit_ledger(id),
  resolved_by          uuid references public.users(id),
  resolved_at          timestamptz,
  resolution_note      text
);

-- Every FK indexed (post-review repo convention — organisers.primary_body_id
-- got a follow-up migration for exactly this miss; include all four here).
create index credit_dispute_ledger_entry_idx on public.credit_dispute(ledger_entry_id);
create index credit_dispute_raised_by_idx on public.credit_dispute(raised_by);
create index credit_dispute_resolution_reference_idx on public.credit_dispute(resolution_reference);
create index credit_dispute_resolved_by_idx on public.credit_dispute(resolved_by);

alter table public.credit_dispute enable row level security;

-- SELF pattern: a practitioner reads and raises disputes on their own behalf.
-- No status/resolution write policy for authenticated — dispute triage and
-- resolution are staff/service-role actions (Sprint 3b), not self-service, so
-- raised_by can only ever be the caller and no app role can move status.
create policy "credit_dispute_self_read" on public.credit_dispute
  for select to authenticated
  using (raised_by = auth.uid());

create policy "credit_dispute_self_raise" on public.credit_dispute
  for insert to authenticated
  with check (raised_by = auth.uid());
