-- Practitioner Eventar record (2026-09-18 product decision) — /account/record
-- needs the caller to read their OWN registrations rows. No self-read policy
-- has ever existed on this table: only anon-insert-when-published,
-- org-member-select/update, and manager-select-all (see
-- 20260520010000_init_registrations.sql, 20260910000000_authority_sweep_org_scope.sql).
-- user_id is nullable (set only on claim / register-while-logged-in, per
-- 20260829090000) — an unclaimed registration naturally reads back zero
-- rows under this policy, the honest "not yet linked" state, not an error.

create policy "registrations_self_read" on public.registrations
  for select to authenticated
  using (user_id = auth.uid());
