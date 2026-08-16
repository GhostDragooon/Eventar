-- Closes the one open policy question `confirm_credit_entry()`'s own
-- migration (20260815050000) left explicit and unresolved: "Any check for
-- whether the original row already has a credit_adjusted/credit_revoked
-- compensating entry against it... whether confirmation should be blocked
-- in that case is a real policy question, not decided here." Decisions Log
-- Q39 (2026-08-16) settled it: DO NOT block. Confirmation (body sign-off on
-- the original computation) and adjustment/revocation (a later correction)
-- are separate historical facts about the row, not mutually exclusive ones
-- — the ledger stays fully reconstructable either way, so blocking would
-- lose information rather than protect it. Instead: make the coexistence
-- visible to staff via a durable, queryable audit_events row, since nothing
-- else surfaces it (no UI/queue exists yet — see DEFERRED.md R5/M4).
--
-- EXPLICITLY OUT OF SCOPE (same boundary as 20260815050000 — do not read
-- this migration as building any of these):
--   * Any UI or reviewer queue that surfaces the flag. This makes the fact
--     queryable in audit_events, nothing more.
--   * Blocking confirmation in any circumstance. The insert always proceeds
--     exactly as it did before this migration.
--
-- Design authority: vault Decisions Log Q39 (2026-08-16), this function's
-- own prior out-of-scope note (20260815050000).

-- ---------------------------------------------------------------------------
-- Widen confirm_credit_entry(): after the credit_confirmed row is posted
-- (success or idempotent-return path, both unchanged), check whether any
-- credit_adjusted/credit_revoked row already references the same original.
-- If so, write an audit_events row flagging it — as the LAST statement
-- before return, per this repo's audit-insert-last hard rule (the chain
-- trigger holds pg_advisory_xact_lock until commit). No p_entry_id/
-- signature change, no grant change — CREATE OR REPLACE, same pattern
-- 20260815050000 itself used on the single-body predecessor.
create or replace function public.confirm_credit_entry(
  p_entry_id uuid,
  p_reason   text default null
) returns public.credit_ledger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff        public.staff%rowtype;
  v_original     public.credit_ledger%rowtype;
  v_body_org     uuid;
  v_row          public.credit_ledger;
  v_compensating public.credit_ledger%rowtype;
begin
  v_staff := app_private.require_active_staff('body_admin', 'eventar_staff');

  select * into v_original from public.credit_ledger where id = p_entry_id;
  if not found then
    raise exception 'confirm_credit_entry: entry % not found', p_entry_id using errcode = 'P0002';
  end if;

  select ab.organisation_id into v_body_org
  from public.accrediting_bodies ab where ab.id = v_original.body_id;

  if v_body_org is null then
    raise exception 'confirm_credit_entry: entry % not found', p_entry_id using errcode = 'P0002';
  end if;

  if v_staff.organisation_id <> v_body_org then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_original.entry_type <> 'credit_earned' then
    raise exception 'confirm_credit_entry: entry % is not a credit_earned row (entry_type=%)',
      p_entry_id, v_original.entry_type using errcode = 'P0002';
  end if;

  begin
    v_row := public.record_credit_entry(
      p_licence_id           := v_original.licence_id,
      p_user_id              := v_original.user_id,
      p_event_id             := v_original.event_id,
      p_body_id              := v_original.body_id,
      p_entry_type           := 'credit_confirmed',
      p_points               := v_original.points,
      p_hours                := v_original.hours,
      p_category             := v_original.category,
      p_effective_date       := v_original.effective_date,
      p_attestation_status   := 'body_confirmed',
      p_actor_id             := auth.uid(),
      p_references_entry_id  := v_original.id,
      p_reason               := p_reason
    );
  exception when unique_violation then
    select * into v_row from public.credit_ledger
      where references_entry_id = v_original.id and entry_type = 'credit_confirmed';
  end;

  -- New in this migration: flag, never block. Checked after the insert so
  -- it can never affect whether confirmation succeeds. Uses the ORIGINAL
  -- entry's id, not v_row's — a queue built later would query audit_events
  -- by original entry id to find "which confirmed rows also have a
  -- compensating entry," and references_entry_id is what every adjusted/
  -- revoked row points back to.
  select * into v_compensating from public.credit_ledger
    where references_entry_id = v_original.id
      and entry_type in ('credit_adjusted', 'credit_revoked')
    limit 1;

  if found then
    perform public.write_audit_event(
      p_event_type    := 'credit_confirmation_flagged',
      p_actor_user_id := auth.uid(),
      p_actor_role    := v_staff.role,
      p_organisation_id := v_body_org,
      p_subject_type  := 'credit_ledger',
      p_subject_id    := v_original.id,
      p_payload       := jsonb_build_object(
                            'original_entry_id',     v_original.id,
                            'confirmed_entry_id',     v_row.id,
                            'compensating_entry_id',  v_compensating.id,
                            'compensating_entry_type', v_compensating.entry_type
                          )
    );
  end if;

  return v_row;
end;
$$;

-- Grants unchanged — CREATE OR REPLACE on an existing SECURITY DEFINER
-- function keeps whatever grants 20260815050000 already set; no re-grant
-- needed, but re-asserted below by the self-check for paranoia, matching
-- 20260815050000's own style.

-- ---------------------------------------------------------------------------
-- Self-verifying checks — structural/metadata only, deliberately no live
-- insert. Same reasoning as 20260815050000 §4: credit_ledger is permanent
-- append-only with NO ACTION FKs, so a real insert here would leave an
-- undeletable row on every environment this migration is ever applied to,
-- including Seoul. The functional behaviour (flag written, confirmation
-- still succeeds) is covered by the gated test file (tests/cpd/
-- confirm_credit_entry.rls.test.ts), run manually, never against Seoul.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_type t on t.oid = p.prorettype
    where p.proname = 'confirm_credit_entry' and t.typname = 'credit_ledger'
  ) then
    raise exception 'confirm_credit_entry: missing, or does not return credit_ledger after widen';
  end if;

  if has_function_privilege('anon', 'public.confirm_credit_entry(uuid, text)', 'EXECUTE') then
    raise exception 'confirm_credit_entry: anon must NOT have EXECUTE after widen';
  end if;
  if not has_function_privilege('authenticated', 'public.confirm_credit_entry(uuid, text)', 'EXECUTE') then
    raise exception 'confirm_credit_entry: authenticated must have EXECUTE after widen';
  end if;

  -- write_audit_event is called into but untouched by this migration —
  -- confirm its signature hasn't drifted, same paranoid style as
  -- 20260815050000's own record_credit_entry check.
  if not exists (
    select 1 from pg_proc
    where proname = 'write_audit_event'
      and pg_get_function_arguments(oid) like 'p_event_type text, p_actor_user_id uuid DEFAULT%p_actor_role text DEFAULT%p_organisation_id uuid DEFAULT%p_subject_type text DEFAULT%p_subject_id uuid DEFAULT%p_payload jsonb DEFAULT%'
  ) then
    raise exception 'confirm_credit_entry: write_audit_event signature drifted from what this migration assumes';
  end if;
end $$;

-- Rollback (safe any time — this migration adds no schema, only widens a
-- function body; reverting means restoring 20260815050000's function body
-- verbatim, which is committed in this repo's git history at that file):
--   -- see supabase/migrations/20260815050000_credit_ledger_body_confirmation.sql
--   -- for the CREATE OR REPLACE FUNCTION body to restore.
