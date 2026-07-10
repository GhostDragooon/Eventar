-- Seed data for local development / fresh-project rebuilds.
-- Inserts the first platform operator who can log in.
--
-- For production / pre-seeded projects: skip this file (the live Seoul project
-- was pre-seeded directly, which is why this file never ran there — and why its
-- pre-pivot staleness went unnoticed until the first clean replay-from-zero on
-- 2026-07-10).
-- For a fresh project: replace MANAGER_EMAIL below with a real address before running.
--
-- Idempotent: re-running is safe (no-op if the (email, organisation_id) already
-- exists). Kept current with the post-Sprint-1 schema:
--   - conflict target is (email, organisation_id): Sprint 1's staff_org_scope
--     migration dropped the email-only unique (staff_email_key) for
--     staff_email_org_key on (email, organisation_id).
--   - role is 'eventar_staff': the platform-operator role in the post-Sprint-3a
--     5-role vocabulary ('manager' no longer passes staff_role_check).
--   - organisation_id defaults to the seeded default org.
insert into public.staff (email, role, full_name)
values ('MANAGER_EMAIL', 'eventar_staff', 'First Operator')
on conflict (email, organisation_id) do nothing;
