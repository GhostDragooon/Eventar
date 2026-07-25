-- Seed data for local development / fresh-project rebuilds.
-- Inserts the first platform operator who can log in.
--
-- ── LOCAL-ONLY grant restore (2026-07-15) ────────────────────────────────────
-- This file runs ONLY on `supabase db reset` (local); the live Seoul project is
-- migration-only and never executes it. Supabase CLI 2.109.1 applies migrations
-- as the `postgres` role, whose default privileges grant the API roles only
-- Dxtm (no SELECT/INSERT/UPDATE/DELETE) — unlike `supabase_admin`'s defaults
-- (full arwdDxtm) that the platform uses on live. Result: a fresh local reset
-- leaves every postgres-owned public table with NO DML grant for anon /
-- authenticated / service_role, so the app can't even read events and the demo
-- seed can't write staff. (Pre-2.109.1 CLI granted these, which is why the app
-- ran against local before.) Restore the standard grants here so local matches
-- live, then RE-ASSERT the Hard Rule 11 audited-table write revokes so this
-- blanket grant doesn't silently undo them. Keep this list in sync with the
-- migrations' table-level revokes (audit_events / credit_ledger /
-- practitioner_licences) — a new audited table must be added here too.
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Re-assert Hard Rule 11 (mirror the migrations exactly):
--   audit_events           — 20260704130400_init_audit_chain.sql
--   credit_ledger          — 20260709260000_credit_ledger_hardening.sql
--   practitioner_licences  — 20260709300000_practitioner_licences_append_only.sql
--                            + 20260709320000 re-grants service_role DELETE
revoke insert, update, delete on public.audit_events          from anon, authenticated, service_role;
revoke insert, update, delete on public.credit_ledger         from anon, authenticated, service_role;
revoke insert, update, delete on public.practitioner_licences from anon, authenticated, service_role;
grant  delete                  on public.practitioner_licences to service_role;
-- staff.role is definer-only (set_staff_role, migration 20260716150855). The
-- blanket grant above re-granted table-level UPDATE on staff, which would
-- re-expose the role column locally — re-assert the revoke + non-role column
-- grant so local matches live. anon is intentionally EXCLUDED from the grant-back
-- (20260723000000_staff_grant_narrow_anon, LOW-2): anon has no legitimate staff
-- write and staff RLS is SELECT-only, so re-granting it here would re-widen the
-- footgun that migration closes.
revoke update                                     on public.staff from anon, authenticated, service_role;
grant  update (email, full_name, organisation_id, status) on public.staff to authenticated, service_role;
-- events.accrediting_body_id / cpd_hours are the credit-minting columns
-- (migration 20260725144446, review finding HIGH-1): events_organizer_update_own
-- lets an organiser UPDATE their own event with no column restriction, so a
-- table-level UPDATE grant means they can bind the event to ANY accrediting body
-- and every registrant with a verified licence there earns a permanent credit
-- that body never authorised. The blanket grant above re-granted table UPDATE on
-- events, silently re-opening it — caught by a local `db reset` immediately after
-- the migration landed, which is exactly what this block exists to prevent.
-- anon is excluded from the grant-back: it has no UPDATE policy on events, so its
-- grant was always inert. service_role is deliberately NOT revoked (mirrors the
-- migration, which only revokes anon+authenticated): it is the trusted
-- server-side configuration path — seed-demo.ts sets accrediting_body_id/
-- cpd_hours through it, and the dashboard/edit admin actions use it too.
-- Revoking service_role here broke `seed-demo.ts` with a 42501 on first run.
revoke update on public.events from anon, authenticated;
grant  update (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, status, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at, organisation_id, published_at
) on public.events to authenticated;
-- ─────────────────────────────────────────────────────────────────────────────
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
