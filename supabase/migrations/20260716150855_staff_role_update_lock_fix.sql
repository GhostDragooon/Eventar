-- CPD Milestone A / Task 9 corrective — the column-level `revoke update (role)`
-- in 20260716150421 was a no-op: anon/authenticated/service_role hold
-- TABLE-level UPDATE (platform default arwdDxtm), and a column-level revoke
-- cannot narrow a table-level grant (the role keeps table-wide UPDATE covering
-- every column). Revoke the table-level UPDATE, then grant back column UPDATE on
-- every column EXCEPT role, so role changes are genuinely definer-only
-- (set_staff_role) while the other business columns stay directly updatable.
-- (id / created_at are intentionally left non-updatable — nothing edits them.)
revoke update on public.staff from anon, authenticated, service_role;
grant update (email, full_name, organisation_id, status) on public.staff
  to anon, authenticated, service_role;
