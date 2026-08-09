-- Security review 2026-08-06 — HIGH: anonymous attendance forgery.
--
-- registrations_anon_insert_when_event_published only checked that the target
-- event is published. Its WITH CHECK did NOT constrain status/check_in_at/
-- check_in_method, so the anon role (the public NEXT_PUBLIC key) could
-- POST /rest/v1/registrations with status='attended', a back-dated check-in
-- and a self-chosen registration_code — forging an attendance record with no
-- check-in, no self-serve gate, no window, no audit event. Proven live during
-- the review: a status='attended' row inserted as `anon` landed intact.
--
-- On a CPD platform attendance is the basis for credit — scripts/cpd/
-- reconcile-event.ts re-awards a credit for EVERY status='attended' row — so a
-- forged attendance row becomes a forged, permanent, regulator-facing credit.
--
-- Fix: a public registration may only ever create a PRISTINE row. Attendance is
-- reachable exclusively through the self_check_in / mark_attended SECURITY
-- DEFINER functions, which enforce the window, self-serve, cancelled and
-- owner/audit invariants. This is the same class of fix as 20260725144446's
-- events column lock (an over-permissive authenticated write on the same
-- events/registrations surface), one table over.
--
-- Nothing legitimate loses access — verified before writing this: the only
-- writer of the initial row is registerForEvent (app/(public)/events/[id]/
-- actions.ts), which inserts exactly { event_id, email, full_name,
-- registration_code } via the service_role admin client, letting status default
-- to 'registered' and both check-in columns to NULL. service_role bypasses RLS,
-- so this policy never gates it; it only gates direct anon/authenticated POSTs.
-- Re-runnable.

drop policy if exists "registrations_anon_insert_when_event_published" on public.registrations;

create policy "registrations_anon_insert_when_event_published"
  on public.registrations
  for insert to anon, authenticated
  with check (
    -- attendance is minted only by the definer functions, never at insert
    status = 'registered'
    and check_in_at is null
    and check_in_method is null
    and exists (
      select 1 from public.events e
      where e.id = registrations.event_id and e.status = 'published'
    )
  );

-- Self-check (data-independent, CI-replay-safe): fail the migration if the new
-- policy is missing or its WITH CHECK no longer pins status. The behavioural
-- proof (anon forge → 42501, legit insert → ok) lives in
-- tests/rls/registrations_insert_forgery.rls.test.ts.
do $$
declare
  v_check text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v_check
  from pg_policy
  where polrelid = 'public.registrations'::regclass
    and polname = 'registrations_anon_insert_when_event_published';

  if v_check is null then
    raise exception 'registrations INSERT policy missing after migration';
  end if;
  if v_check !~ 'status' or v_check !~ 'check_in_at' then
    raise exception 'registrations INSERT policy did not pin status/check_in_at: %', v_check;
  end if;
end $$;
