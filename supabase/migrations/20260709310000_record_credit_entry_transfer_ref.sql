-- CPD Sprint 3a / Task 10 exit gate — dev-lens phase-completion review found
-- credit_ledger.entry_type accepts 'credit_transferred', and the table has
-- a transfer_reference_id column for exactly that entry type, but
-- record_credit_entry had no parameter for it — every row written through
-- this function left transfer_reference_id permanently NULL, including
-- future 'credit_transferred' entries whose whole point is to carry that
-- linkage. Inert today (no live caller yet, table confirmed empty), but
-- the ledger is append-only: once Sprint 3b wires a real caller, this gap
-- becomes permanent and unrecoverable for every row already written.
-- Cheapest possible moment to fix is right now, before any real row exists.
--
-- Postgres note: adding a parameter is NOT a true CREATE OR REPLACE (a
-- changed argument list is a distinct function identity) — the old 13-arg
-- overload must be dropped first, and the new 14-arg version needs its
-- own explicit grants (nothing carries over automatically the way it does
-- for a same-signature CREATE OR REPLACE).

drop function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text
);

create function public.record_credit_entry(
  p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid,
  p_entry_type text, p_points numeric, p_hours numeric, p_category text,
  p_effective_date date, p_attestation_status text, p_actor_id uuid default null,
  p_references_entry_id uuid default null, p_reason text default null,
  p_transfer_reference_id uuid default null
) returns public.credit_ledger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.credit_ledger;
begin
  insert into public.credit_ledger
    (licence_id, user_id, event_id, body_id, entry_type, points, hours, category,
     effective_date, attestation_status, actor_id, references_entry_id, reason,
     transfer_reference_id)
  values
    (p_licence_id, p_user_id, p_event_id, p_body_id, p_entry_type, p_points, p_hours,
     p_category, p_effective_date, p_attestation_status, p_actor_id,
     p_references_entry_id, p_reason, p_transfer_reference_id)
  returning * into v_row; -- ledger insert IS the last statement — own chain via
                          -- the credit_ledger_chain trigger; no separate audit write (Rule 7)
  return v_row;
end;
$$;

revoke all on function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text, uuid
) to service_role;
