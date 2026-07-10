-- CPD Sprint 3a / Task 10 exit gate — get_advisors flagged 5 unindexed FKs
-- introduced by this sprint: credit_ledger.actor_id/event_id/
-- references_entry_id/user_id (the plan's literal SQL only indexed
-- licence_id/body_id/chain_seq) and practitioner_licences.superseded_by.
-- Cheap to close now, before either table has real rows or real query
-- patterns — matches this sprint's own established discipline (Task 3's
-- accrediting_bodies.short_name uniqueness, Task 4's
-- organisers.primary_body_id index).

create index credit_ledger_actor_idx on public.credit_ledger(actor_id);
create index credit_ledger_event_idx on public.credit_ledger(event_id);
create index credit_ledger_references_entry_idx on public.credit_ledger(references_entry_id);
create index credit_ledger_user_idx on public.credit_ledger(user_id);
create index practitioner_licences_superseded_by_idx on public.practitioner_licences(superseded_by);
