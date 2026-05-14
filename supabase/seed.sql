-- Seed data for local development / fresh-project rebuilds.
-- Inserts the first manager who can magic-link login.
--
-- For production / pre-seeded projects: skip this file.
-- For a fresh project: replace MANAGER_EMAIL below with a real address before running.
--
-- Idempotent: re-running is safe (no-op if the email already exists).
insert into public.staff (email, role, full_name)
values ('MANAGER_EMAIL', 'manager', 'First Manager')
on conflict (email) do nothing;
