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
-- Four events columns are definer-only for the app roles:
--   · accrediting_body_id / cpd_hours — the credit-minting columns (migration
--     20260725144446, review finding HIGH-1). events_organizer_update_own lets
--     an organiser write their own event with no column restriction, so a table
--     grant means they can bind the event to ANY accrediting body and every
--     registrant with a verified licence there earns a permanent credit that
--     body never authorised. Written only by set_event_cpd_config().
--   · status / published_at — the publish fact (migration 20260802182411).
--     Written only by publish_event(), so every publish lands in the audit
--     chain; create_event_with_blocks routes a create-time publish through it.
-- INSERT is locked as well as UPDATE: the 2026-07-25 migration closed UPDATE
-- only, leaving the same hole reachable by POSTing a brand-new row.
-- The blanket grant above re-granted table INSERT+UPDATE on events, silently
-- re-opening both — caught by a local `db reset` immediately after the 07-25
-- migration landed, which is exactly what this block exists to prevent.
-- anon is excluded from the grant-back: it has no write policy on events, so
-- its grant was always inert. service_role is deliberately NOT revoked (mirrors
-- the migrations, which only revoke anon+authenticated): it is the trusted
-- server-side path — seed-demo.ts sets accrediting_body_id/cpd_hours through it,
-- the dashboard's bulk cancel sets status through it, and the edit admin actions
-- use it too. Revoking service_role here broke `seed-demo.ts` with a 42501 on
-- first run.
--   · organisation_id — the tenancy root (migration 20260804030000). It was
--     writable by authenticated while events_organizer_update_own constrains
--     only created_by, so an organiser could PATCH their own event into the
--     default organisation — which holds every body authorisation — and then
--     self-accredit, walking straight around the DEFERRED-56 gate. Nothing in
--     app/, lib/ or scripts/ ever writes it; the set_event_organisation
--     BEFORE INSERT trigger is its only writer.
revoke insert, update on public.events from anon, authenticated;
grant  insert (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at
) on public.events to authenticated;
grant  update (
  id, title, topic, start_time, end_time, timezone, description, poster_path,
  max_attendees, created_by, created_at, updated_at, venue_name,
  venue_address, city, region, country, latitude, longitude,
  registration_close_at, hosted_by, organized_by, hero_image_url, category,
  deleted_at, checkin_modes, registration_open_at
) on public.events to authenticated;
-- organisation_body_authorisations (migration 20260804000000) — the registry
-- allow-list deciding which organisation may claim which accrediting body.
-- Writable ONLY service-role-side until the Stage 10 approval workflow; if the
-- blanket grant above stands, an organiser can authorise their own organisation
-- and the DEFERRED-56 gate becomes decorative. Read stays org-scoped via RLS.
revoke insert, update, delete on public.organisation_body_authorisations
  from anon, authenticated;
revoke select on public.organisation_body_authorisations from anon;
--
-- Re-assert the email_log / rate_limits lock (migration 20260803090000, found by
-- the 2026-08-03 backend review). Both tables are written only by the service
-- role and have RLS enabled with ZERO policies, so RLS alone already denies the
-- API roles — but email_log holds recipient_email (PII, Hard Rule 10), and the
-- blanket grant above hands anon/authenticated a table-level SELECT, leaving RLS
-- as the single control. Same failure shape as the events block above: without
-- this, every `db reset` — and therefore CI replay-from-zero and the future
-- Singapore provisioning — would produce a database with the PII grant re-opened.
revoke all on table public.email_log from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;
--
-- event_occurrences / registration_checkins (migration 20260815000000,
-- Task 10.8/10.9 sub-task C1) — definer-only: C2 hasn't built the check-in
-- writer RPCs yet, so no app role (including service_role — BYPASSRLS means
-- RLS gives it no protection) gets a direct write grant. Unlike
-- practitioner_licences, no role retains a DELETE here.
revoke insert, update, delete on public.event_occurrences      from anon, authenticated, service_role;
revoke insert, update, delete on public.registration_checkins  from anon, authenticated, service_role;
--
-- event_accreditation_groups / event_accreditations /
-- event_accreditation_occurrences / registration_roles (migration
-- 20260815020000, Task 10.8/10.9 sub-task C3) — same posture as the
-- event_occurrences block above: definer-only (the compatibility bridge
-- inside set_event_cpd_config is the sole writer today), no role — including
-- service_role — gets a direct write grant, no role retains a DELETE.
revoke insert, update, delete on public.event_accreditation_groups      from anon, authenticated, service_role;
revoke insert, update, delete on public.event_accreditations            from anon, authenticated, service_role;
revoke insert, update, delete on public.event_accreditation_occurrences from anon, authenticated, service_role;
revoke insert, update, delete on public.registration_roles              from anon, authenticated, service_role;
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
