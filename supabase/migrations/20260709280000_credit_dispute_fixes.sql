-- CPD Sprint 3a / Task 9 follow-up — code-quality review found two gaps in
-- credit_dispute, both inherited verbatim from the plan's own literal SQL
-- (not implementer-introduced), both free to fix now (0 rows, nothing
-- references the table yet) and expensive later once real disputes exist.
--
-- 1. credit_dispute_self_raise's WITH CHECK verified only raised_by =
--    auth.uid(), not that the caller actually owns the disputed ledger
--    entry — any authenticated practitioner who obtained another
--    practitioner's ledger_entry_id (a UUID, not blindly guessable, but
--    still) could raise a dispute against it. Added an ownership check.
-- 2. Every other entity table in this schema is plural
--    (accrediting_bodies, organisers, practitioner_licences,
--    consent_records, ...); credit_dispute is a row-per-dispute table and
--    should read credit_disputes (credit_ledger is a deliberate mass-noun
--    singular, like staff — not the same case). Renamed while it's free.

alter table public.credit_dispute rename to credit_disputes;

alter index public.credit_dispute_ledger_entry_idx rename to credit_disputes_ledger_entry_idx;
alter index public.credit_dispute_raised_by_idx rename to credit_disputes_raised_by_idx;
alter index public.credit_dispute_resolution_reference_idx rename to credit_disputes_resolution_reference_idx;
alter index public.credit_dispute_resolved_by_idx rename to credit_disputes_resolved_by_idx;

drop policy "credit_dispute_self_read" on public.credit_disputes;
drop policy "credit_dispute_self_raise" on public.credit_disputes;

create policy "credit_disputes_self_read" on public.credit_disputes
  for select to authenticated
  using (raised_by = auth.uid());

create policy "credit_disputes_self_raise" on public.credit_disputes
  for insert to authenticated
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.credit_ledger cl
      where cl.id = ledger_entry_id and cl.user_id = auth.uid()
    )
  );
