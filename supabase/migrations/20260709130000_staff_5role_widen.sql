-- CPD Sprint 3a Task 2 — widen staff_role_check from the live 3-value
-- vocabulary ('organizer', 'manager', 'eventar_staff' — only 'organizer'/
-- 'manager' ever actually used) to the full 5-value organiser/accrediting-
-- body role model. This REPLACES the vocabulary; 'organizer' and 'manager'
-- are not members of the new CHECK. Closes docs/DEFERRED.md items 15/16.
--
-- Live-data remap (explicit user decision, not mechanical): the sole live
-- staff row (ahf.ivan@gmail.com, role='manager') becomes 'eventar_staff',
-- not 'organiser_admin' — chosen because several of this sprint's later
-- tasks (practitioner_licences body-admin read policy, licence mutation
-- functions' verify_licence gate, credit_ledger body-admin read policy)
-- gate on role in ('body_admin','eventar_staff'), and this is Ivan's own
-- platform-operator account, which should be able to exercise those paths.
--
-- Remap must run BEFORE the constraint swap or the ADD CONSTRAINT fails
-- against the still-'manager' row.

update public.staff set role = 'eventar_staff' where role = 'manager';

alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('organiser_admin','organiser_member','body_admin','auditor','eventar_staff'));
