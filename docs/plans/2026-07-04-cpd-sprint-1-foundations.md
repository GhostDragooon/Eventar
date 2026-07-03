# CPD Sprint 1 — Multi-tenancy + Identity + Audit-Chain Foundations

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task (or the controller uses `superpowers:subagent-driven-development` and dispatches one fresh subagent per task).

**Goal:** Land the CPD platform's database foundations — `organisations` multi-tenancy, `users` mirror of `auth.users`, org-scoped `staff`, consent + DSR tables, and the tamper-evident `audit_events` hash chain — with RLS and real-database tests, without breaking any of the 18 existing routes.

**Architecture:** Six forward-only Supabase migrations applied via CLI `db push` to the linked Seoul project, followed by an integration test suite (vitest, env-gated) that probes RLS as real authenticated users and exercises the audit chain concurrently. Existing app code is NOT modified — every existing table keeps its current policies; new columns arrive with defaults so current Server Actions keep working. Frontend is FROZEN: no file under `app/` or `components/` is touched.

**Tech stack:** Postgres 17 (Supabase), Supabase CLI 2.75.0 (already linked), `@supabase/supabase-js` (already a dependency), vitest 4.

---

## MANDATORY RULES FOR THE EXECUTOR — read before Task 0

1. **Migrations are applied ONLY via `supabase db push`.** NEVER use the Supabase MCP `apply_migration` tool — it stamps a server-side version number that diverges from the local filename and recreates the drift we just repaired (commit `8c8e7d9`). If `db push` fails, STOP, capture the full error, and report back. Do not work around it.
2. **Subagents do not commit.** The controller commits after reviewing each task, using the exact commit message given in the task.
3. **Do not touch** `app/**`, `components/**`, `emails/**`, `proxy.ts`, or any existing migration file. New files only, except `package.json` (one script added in Task 6).
4. **Node PATH:** the login shell defaults to node v14. EVERY `pnpm` command must be prefixed:
   `export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH`
5. **Where this plan disagrees with `docs/source-buildpack/*` or the Slice 0.3 DDL, this plan wins.** It already incorporates `docs/architecture/BASELINE-DELTAS.md` (chain_seq-under-lock, fixed `pseudonymise_user`, repo text+CHECK convention instead of enums, `eventar_staff` naming).
6. **The user's dev server runs on port 3000 — never start another one.**
7. All new SQL follows repo conventions: lowercase SQL, `gen_random_uuid()`, `text` + CHECK (not Postgres enums), `app_private.*` helper style, policy names `<table>_<actor>_<action>`.

**Pinned facts (verified against the live DB 2026-07-04 — do not re-derive):**

- Linked project: `muieupgkpbxpqsrjjwol` (Seoul). CLI 2.75.0 at `/opt/homebrew/bin/supabase`. `SUPABASE_DB_PASSWORD` is in `.env.local`.
- Live data: 1 staff row (`ahf.ivan@gmail.com`, role `manager`, id `18084e4e-87de-4f3e-bba2-9981d6fa0ad4`), 1 `auth.users` row (same email), 7 events, 63 registrations.
- pgcrypto is installed in the **`extensions`** schema → always call `extensions.digest(...)`, `extensions.gen_random_bytes(...)`.
- `public.touch_updated_at()` exists. Helpers live in `app_private`: `auth_email()`, `is_manager()`, `current_staff_id()` — all `security definer`, `search_path = public, pg_temp`.
- staff constraints are named exactly `staff_email_key` (unique) and `staff_role_check` (check).
- No triggers currently exist on `auth.users`.
- Latest migration version: `20260702112004`. New files use the `202607041300xx` series below — names are exact, do not renumber.
- 436-test vitest baseline is now 438 (login PKCE tests) — expect **438 passing** before this sprint's tests are added.

---

## Task 0: Preflight (read-only — no changes)

**Step 1:** Run:

```bash
cd /Users/ivan/Eventar && git status --short
```
Expected: empty output. If not empty, STOP and report.

**Step 2:** Run:

```bash
supabase migration list --linked -p "$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2-)" 2>&1 | tail -30
```
Expected: 26 rows where every row has BOTH a Local and a Remote timestamp (no one-sided rows), ending at `20260702112004`. If any row is one-sided, STOP and report (drift regressed).

**Step 3:** Run:

```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm exec vitest run 2>&1 | tail -4
```
Expected: `Test Files 55 passed`, `Tests 438 passed`. Record the numbers.

---

## Task 1: Migration — `organisations`

**Files:**
- Create: `supabase/migrations/20260704130000_init_organisations.sql`

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M1 — organisations: the tenancy root.
-- Deltas ref: docs/architecture/BASELINE-DELTAS.md §2 (Eventar naming),
-- repo convention: text + CHECK, not enums.

create table public.organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  status       text not null default 'active'
                 check (status in ('active','suspended','archived')),
  jurisdiction text not null default 'HK',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger organisations_touch_updated_at
  before update on public.organisations
  for each row execute function public.touch_updated_at();

create index organisations_status_idx on public.organisations (status);

alter table public.organisations enable row level security;

-- Helper: is the caller an active eventar_staff (internal operator)?
-- Mirrors app_private.is_manager(); status filter arrives in M3 but the
-- staff.status column does not exist yet, so this first version checks
-- role only. M3 recreates it with the status filter.
create function app_private.is_eventar_staff() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email() and role = 'eventar_staff'
   ) $$;

grant execute on function app_private.is_eventar_staff()
  to anon, authenticated, service_role;

-- Members of an organisation can read it; internal operators read all.
-- organisation_id lands on staff in M3; until then this policy resolves
-- via is_manager() (single-org world) and is tightened in M3.
create policy "organisations_staff_read" on public.organisations
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff()
         or app_private.current_staff_id() is not null);

-- No INSERT/UPDATE/DELETE policies: organisation management is a
-- service-role/internal-admin operation (service_role has BYPASSRLS).

-- Seed the default organisation that adopts all existing Eventar data.
insert into public.organisations (id, name, slug, status, jurisdiction)
values ('00000000-0000-0000-0000-000000000001',
        'Default Organisation', 'default', 'active', 'HK');
```

**Step 2: Dry-run.** Run:

```bash
cd /Users/ivan/Eventar && supabase db push --dry-run -p "$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2-)" 2>&1 | tail -5
```
Expected output contains exactly one pending migration: `20260704130000_init_organisations.sql`.

**Step 3: Push.** Same command without `--dry-run`. Expected: `Applying migration 20260704130000_init_organisations.sql...` then success (exit 0).

**Step 4: Assert via Supabase MCP `execute_sql`** (read-only check, allowed):

```sql
select (select count(*) from public.organisations) as orgs,
       (select slug from public.organisations
         where id='00000000-0000-0000-0000-000000000001') as default_slug;
```
Expected: `orgs = 1`, `default_slug = 'default'`.

**Step 5: Controller commits:**

```
feat(cpd-s1): organisations table — tenancy root + default org seed
```

---

## Task 2: Migration — `users` mirror of `auth.users`

**Files:**
- Create: `supabase/migrations/20260704130100_init_users_mirror.sql`

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M2 — public.users: application mirror of auth.users.
-- users.id ALWAYS equals auth.users.id. Attendees/speakers/staff humans
-- all live here. phone_encrypted deferred to Sprint 4 (KMS envelope).

create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  locale           text not null default 'en',
  timezone         text not null default 'Asia/Hong_Kong',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  pseudonymised_at timestamptz
);

create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

alter table public.users enable row level security;

create policy "users_self_read" on public.users
  for select to authenticated
  using (id = auth.uid());

create policy "users_self_update" on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_staff_read" on public.users
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

-- Mirror trigger: every new auth user gets a public.users row.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  insert into public.users (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill the existing auth user(s).
insert into public.users (id, full_name)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;
```

**Step 2: Dry-run** (same command as Task 1 Step 2). Expected pending: only `20260704130100_init_users_mirror.sql`.

**Step 3: Push.** Expected: success. *Contingency:* if it fails with `permission denied` / `must be owner of relation users` on the `create trigger ... on auth.users` statement, STOP and report — do not attempt a workaround (the standard Supabase pattern should succeed as `postgres`).

**Step 4: Assert via MCP `execute_sql`:**

```sql
select (select count(*) from public.users) as mirrored,
       (select count(*) from auth.users)  as auth_users;
```
Expected: `mirrored = auth_users` (currently both 1).

**Step 5: Controller commits:**

```
feat(cpd-s1): users mirror of auth.users — trigger + backfill + self RLS
```

---

## Task 3: Migration — org-scoped `staff` + hardened helpers

**Files:**
- Create: `supabase/migrations/20260704130200_staff_org_scope.sql`

**Design notes (locked — do not deviate):** role values `organizer`/`manager` are KEPT (frontend frozen; `lib/auth.ts` + Q19 depend on them). `eventar_staff` is ADDED as a third allowed value (internal operator, used by new RLS policies). The full role model (`organiser_admin`, `body_admin`, `auditor`, …) lands in the sprint that builds those surfaces. Helpers gain a `status = 'active'` filter — the existing row defaults to `active`, so behaviour is unchanged for Ivan.

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M3 — staff becomes organisation-scoped.
-- Q20 reversed decision 6.3 (single-org). Roles organizer/manager kept
-- (frontend frozen); eventar_staff added for internal-operator policies.

alter table public.staff
  add column organisation_id uuid not null
    default '00000000-0000-0000-0000-000000000001'
    references public.organisations(id),
  add column status text not null default 'active'
    check (status in ('invited','active','suspended','removed'));

-- email was globally unique; now unique per organisation.
-- Constraint names verified live: staff_email_key / staff_role_check.
alter table public.staff drop constraint staff_email_key;
alter table public.staff add constraint staff_email_org_key
  unique (email, organisation_id);

alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('organizer','manager','eventar_staff'));

create index staff_org_active_idx
  on public.staff (organisation_id, status) where status = 'active';

-- Harden helpers: removed/suspended staff must lose access immediately.
-- limit 1 + created_at ordering keeps current_staff_id deterministic if a
-- user later holds staff rows in multiple organisations; proper org
-- selection arrives with JWT org claims in Sprint 2.
create or replace function app_private.is_manager() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and role = 'manager' and status = 'active'
   ) $$;

create or replace function app_private.current_staff_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as
$$ select id from public.staff
   where email = app_private.auth_email() and status = 'active'
   order by created_at limit 1 $$;

create or replace function app_private.is_eventar_staff() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists(
     select 1 from public.staff
     where email = app_private.auth_email()
       and role = 'eventar_staff' and status = 'active'
   ) $$;

-- Tighten the organisations read policy now that staff carries the org id.
drop policy "organisations_staff_read" on public.organisations;
create policy "organisations_staff_read" on public.organisations
  for select to authenticated
  using (
    app_private.is_eventar_staff()
    or exists (
      select 1 from public.staff
      where staff.email = app_private.auth_email()
        and staff.organisation_id = organisations.id
        and staff.status = 'active'
    )
  );
```

**Step 2: Dry-run.** Expected pending: only `20260704130200_staff_org_scope.sql`.

**Step 3: Push.** Expected: success.

**Step 4: Assert via MCP `execute_sql`:**

```sql
select organisation_id, status, role from public.staff
where email = 'ahf.ivan@gmail.com';
```
Expected: `organisation_id = 00000000-0000-0000-0000-000000000001`, `status = active`, `role = manager`.

**Step 5: Regression gate** (helpers changed — existing RLS depends on them):

```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm exec vitest run 2>&1 | tail -3
```
Expected: 438 passed (unit tests don't hit the DB, but run anyway), AND via MCP `execute_sql`:

```sql
set role authenticated;
set request.jwt.claims = '{"email":"ahf.ivan@gmail.com"}';
select count(*) from public.events;
reset role;
```
Expected: `count = 7` (manager still reads all events — helper hardening did not lock Ivan out).

**Step 6: Controller commits:**

```
feat(cpd-s1): staff org-scoped — organisation_id, status lifecycle, eventar_staff role, hardened helpers
```

---

## Task 4: Migration — `events.organisation_id`

**Files:**
- Create: `supabase/migrations/20260704130300_events_org_scope.sql`

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M4 — events adopt the default organisation.
-- The column default stays until multi-org event creation ships
-- (Sprint 3+); existing Server Actions and RPCs keep working unchanged.
-- Org-scoped RLS predicates arrive with JWT org claims in Sprint 2;
-- today's owner/manager policies remain the enforcement.

alter table public.events
  add column organisation_id uuid not null
    default '00000000-0000-0000-0000-000000000001'
    references public.organisations(id);

create index events_organisation_idx on public.events (organisation_id);
```

**Step 2: Dry-run.** Expected pending: only `20260704130300_events_org_scope.sql`.

**Step 3: Push.** Expected: success.

**Step 4: Assert via MCP `execute_sql`:**

```sql
select count(*) filter (where organisation_id
         = '00000000-0000-0000-0000-000000000001') as adopted,
       count(*) as total
from public.events;
```
Expected: `adopted = total` (currently 7 = 7).

**Step 5: Controller commits:**

```
feat(cpd-s1): events.organisation_id — default-org adoption + index
```

---

## Task 5: Migration — `audit_events` hash chain

**Files:**
- Create: `supabase/migrations/20260704130400_init_audit_chain.sql`

**Design notes (locked):** `chain_seq` is drawn INSIDE the trigger under `pg_advisory_xact_lock` (identity default is a fallback the trigger always overwrites — BASELINE-DELTAS §3.2). pgcrypto is schema-qualified as `extensions.digest`. `audit_writer` gets explicit SELECT (the trigger reads the previous hash) and its own RLS policies — without the SELECT policy the trigger would silently read nothing and chain every row to GENESIS. RLS + revokes deny UPDATE/DELETE to every application role. `audit_anchors` (TSA) is deferred — do NOT create it.

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M5 — tamper-evident audit chain.
-- Design: docs/architecture/BASELINE-DELTAS.md §3.2 (chain_seq under
-- advisory lock), §3.4 (honest tamper wording). TSA anchor deferred.
-- HARD RULE: any transaction calling write_audit_event() emits it as the
-- LAST statement before commit (the xact lock is held until commit).

create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  chain_seq       bigint generated always as identity unique,
  event_type      text not null check (length(trim(event_type)) > 0),
  actor_user_id   uuid,
  actor_role      text,
  organisation_id uuid,
  subject_type    text,
  subject_id      uuid,
  payload         jsonb not null default '{}'::jsonb,
  prev_hash       text not null,
  hash            text not null,
  created_at      timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_subject_idx on public.audit_events (subject_type, subject_id);
create index audit_events_org_idx     on public.audit_events (organisation_id, created_at desc);

-- Insert-only writer role. Granted to postgres so postgres may own the
-- SECURITY DEFINER writer function below.
create role audit_writer nologin;
grant audit_writer to postgres;
grant usage on schema public to audit_writer;
grant usage on schema app_private to audit_writer;
grant select, insert on public.audit_events to audit_writer;
grant usage, select on sequence public.audit_events_chain_seq_seq to audit_writer;

-- Chain trigger. chain_seq MUST be drawn inside the advisory lock:
-- identity defaults evaluate at tuple formation (before BEFORE triggers),
-- so the pre-assigned value's order need not match lock-acquisition
-- order. Overwriting inside the lock guarantees
-- lock order == chain_seq order == chain order.
create function public.compute_audit_hash() returns trigger
  language plpgsql set search_path = public, pg_temp as
$$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  new.chain_seq := nextval('public.audit_events_chain_seq_seq');
  select hash into last_hash
    from public.audit_events order by chain_seq desc limit 1;
  new.prev_hash := coalesce(last_hash, 'GENESIS');
  new.hash := encode(extensions.digest(
      new.chain_seq::text
      || new.event_type
      || coalesce(new.actor_user_id::text, '')
      || coalesce(new.subject_id::text, '')
      || new.payload::text
      || new.prev_hash
      || new.created_at::text,
      'sha256'), 'hex');
  return new;
end;
$$;

create trigger audit_events_hash_trigger
  before insert on public.audit_events
  for each row execute function public.compute_audit_hash();

alter table public.audit_events enable row level security;

-- The trigger (running as audit_writer inside write_audit_event) must
-- read the previous row and insert the new one.
create policy "audit_events_writer_select" on public.audit_events
  for select to audit_writer using (true);
create policy "audit_events_writer_insert" on public.audit_events
  for insert to audit_writer with check (true);

create policy "audit_events_staff_read" on public.audit_events
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

-- No UPDATE/DELETE policy exists for any role, and privileges are revoked
-- below. Honest claim: APPLICATION roles cannot modify audit rows; the
-- table owner (postgres, i.e. dashboard SQL) can — owner-level tampering
-- is detectable via verify_audit_chain, externally provable once the TSA
-- anchor lands (Phase 2).
revoke update, delete on public.audit_events from public;
revoke update, delete on public.audit_events from anon;
revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.audit_events from service_role;
revoke insert on public.audit_events from anon;
revoke insert on public.audit_events from authenticated;
revoke insert on public.audit_events from service_role;

-- Single write path.
create function public.write_audit_event(
  p_event_type      text,
  p_actor_user_id   uuid default null,
  p_actor_role      text default null,
  p_organisation_id uuid default null,
  p_subject_type    text default null,
  p_subject_id      uuid default null,
  p_payload         jsonb default '{}'::jsonb
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  new_id uuid;
begin
  if p_event_type is null or trim(p_event_type) = '' then
    raise exception 'event_type is required';
  end if;
  insert into public.audit_events
    (event_type, actor_user_id, actor_role, organisation_id,
     subject_type, subject_id, payload)
  values
    (p_event_type, p_actor_user_id, p_actor_role, p_organisation_id,
     p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

alter function public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  owner to audit_writer;
grant execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  to authenticated, service_role;

-- Chain verifier. Checks BOTH linkage (prev_hash matches predecessor's
-- hash) and content (stored hash matches recomputation).
create function public.verify_audit_chain()
returns table (
  chain_seq     bigint,
  event_id      uuid,
  link_valid    boolean,
  content_valid boolean
)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  prev text := 'GENESIS';
  r record;
begin
  for r in
    select * from public.audit_events a order by a.chain_seq
  loop
    chain_seq     := r.chain_seq;
    event_id      := r.id;
    link_valid    := (r.prev_hash = prev);
    content_valid := (r.hash = encode(extensions.digest(
        r.chain_seq::text || r.event_type
        || coalesce(r.actor_user_id::text, '')
        || coalesce(r.subject_id::text, '')
        || r.payload::text || r.prev_hash || r.created_at::text,
        'sha256'), 'hex'));
    prev := r.hash;
    return next;
  end loop;
end;
$$;

grant execute on function public.verify_audit_chain() to service_role;
```

**Step 2: Dry-run.** Expected pending: only `20260704130400_init_audit_chain.sql`.

**Step 3: Push.** Expected: success.

**Step 4: Smoke the write path via MCP `execute_sql`:**

```sql
select public.write_audit_event('sprint1_smoke', null, null,
  '00000000-0000-0000-0000-000000000001', 'system', null,
  '{"note":"first chain row"}'::jsonb) as id_1;
select public.write_audit_event('sprint1_smoke') as id_2;
select chain_seq, event_type, prev_hash = 'GENESIS' as is_genesis
  from public.audit_events order by chain_seq;
select count(*) filter (where not link_valid or not content_valid) as invalid
  from public.verify_audit_chain();
```
Expected: two rows; row 1 `is_genesis = true`, row 2 `is_genesis = false`; `invalid = 0`.

**Step 5: Rollback-gap check via MCP `execute_sql`** (single call, one batch):

```sql
begin;
select public.write_audit_event('sprint1_rollback_probe');
rollback;
select public.write_audit_event('sprint1_after_rollback');
select count(*) filter (where not link_valid or not content_valid) as invalid,
       max(chain_seq) as max_seq, count(*) as rows
from public.verify_audit_chain();
```
Expected: `invalid = 0` and `max_seq > rows` is ALLOWED (rolled-back `nextval` burns a sequence value — a chain_seq gap with valid linkage is correct behaviour).

**Step 6: Tamper-denial check via MCP `execute_sql`:**

```sql
set role service_role;
update public.audit_events set payload = '{}'::jsonb where true;
reset role;
```
Expected: ERROR `permission denied for table audit_events`. (`reset role` may not execute after the error — that is fine.)

**Step 7: Controller commits:**

```
feat(cpd-s1): audit_events hash chain — chain_seq under advisory lock, insert-only audit_writer, verifier
```

---

## Task 6: Migration — consent + DSR + fixed `pseudonymise_user`

**Files:**
- Create: `supabase/migrations/20260704130500_init_consent_dsr.sql`

**Step 1: Write the migration file** (exact content):

```sql
-- CPD Sprint 1 / M6 — consent records, data subject requests, and the
-- pseudonymisation function with the privilege-escalation fix
-- (BASELINE-DELTAS §3.1): staff check INSIDE the function, audit write
-- in the same transaction, audit emitted LAST.

create table public.consent_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  consent_type text not null check (consent_type in
    ('terms_of_service','privacy_policy','ai_processing_notice','marketing')),
  version      text not null,
  granted_at   timestamptz not null default now(),
  withdrawn_at timestamptz,
  context      jsonb not null default '{}'::jsonb
);

create index consent_records_user_idx
  on public.consent_records (user_id, consent_type, granted_at desc);

alter table public.consent_records enable row level security;

create policy "consent_self_read" on public.consent_records
  for select to authenticated using (user_id = auth.uid());
create policy "consent_self_insert" on public.consent_records
  for insert to authenticated with check (user_id = auth.uid());
create policy "consent_self_withdraw" on public.consent_records
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "consent_staff_read" on public.consent_records
  for select to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff());

create table public.data_subject_requests (
  id                uuid primary key default gen_random_uuid(),
  subject_user_id   uuid not null references public.users(id) on delete cascade,
  request_type      text not null check (request_type in
    ('access','rectification','erasure','restriction','objection','portability')),
  status            text not null default 'pending' check (status in
    ('pending','in_progress','completed','rejected','escalated')),
  submitted_at      timestamptz not null default now(),
  due_at            timestamptz not null default (now() + interval '30 days'),
  resolved_at       timestamptz,
  resolver_staff_id uuid references public.staff(id),
  request_notes     text,
  resolution_notes  text
);

create index dsr_status_due_idx on public.data_subject_requests (status, due_at);
create index dsr_subject_idx    on public.data_subject_requests (subject_user_id);

alter table public.data_subject_requests enable row level security;

create policy "dsr_self_read" on public.data_subject_requests
  for select to authenticated using (subject_user_id = auth.uid());
create policy "dsr_self_create" on public.data_subject_requests
  for insert to authenticated with check (subject_user_id = auth.uid());
create policy "dsr_staff_all" on public.data_subject_requests
  for all to authenticated
  using (app_private.is_manager() or app_private.is_eventar_staff())
  with check (app_private.is_manager() or app_private.is_eventar_staff());

-- Pseudonymisation (erasure DSR fulfilment, DB side). The authorisation
-- check lives INSIDE the function: exposing it via PostgREST RPC with a
-- grant to authenticated is safe because non-staff callers get 42501.
-- Session revocation + auth.users email scrubbing happen in the app
-- layer via the Supabase admin API (Sprint 2 wires the full DSR flow).
create function public.pseudonymise_user(p_user_id uuid, p_reason text)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor_staff public.staff%rowtype;
  pseudonym   text;
begin
  select * into actor_staff
  from public.staff
  where email = app_private.auth_email()
    and role in ('manager','eventar_staff')
    and status = 'active'
  order by created_at limit 1;

  if actor_staff.id is null then
    raise exception 'pseudonymise_user: caller is not active staff'
      using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'pseudonymise_user: reason is required';
  end if;

  pseudonym := 'ERASED-' || encode(extensions.gen_random_bytes(6), 'hex');

  update public.users
     set full_name = pseudonym,
         pseudonymised_at = now(),
         deleted_at = now()
   where id = p_user_id
     and pseudonymised_at is null;

  if not found then
    raise exception
      'pseudonymise_user: user % not found or already pseudonymised',
      p_user_id;
  end if;

  -- LAST statement before return: audit write (same transaction).
  perform public.write_audit_event(
    'user_pseudonymised',
    auth.uid(),
    actor_staff.role,
    actor_staff.organisation_id,
    'user',
    p_user_id,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.pseudonymise_user(uuid, text)
  to authenticated, service_role;
```

**Step 2: Dry-run.** Expected pending: only `20260704130500_init_consent_dsr.sql`.

**Step 3: Push.** Expected: success.

**Step 4: Escalation-denial check via MCP `execute_sql`** (simulates a logged-in non-staff attendee hitting the RPC):

```sql
set role authenticated;
set request.jwt.claims = '{"email":"attacker@example.com","sub":"00000000-0000-0000-0000-0000000000aa"}';
select public.pseudonymise_user(
  (select id from public.users limit 1), 'malicious');
```
Expected: ERROR with SQLSTATE `42501` (`caller is not active staff`). This is the regression test for BASELINE-DELTAS defect §3.1.

**Step 5: Controller commits:**

```
feat(cpd-s1): consent + DSR tables; pseudonymise_user with in-function staff gate + audit write
```

---

## Task 7: Integration test harness (RLS + audit chain, real DB)

**Files:**
- Create: `tests/helpers/env.ts`
- Create: `tests/helpers/clients.ts`
- Create: `tests/rls/foundations.rls.test.ts`
- Create: `tests/audit/chain.test.ts`
- Modify: `package.json` (add one script; change nothing else)

These tests run against the LIVE linked dev project as real authenticated users. They are env-gated: plain `pnpm test` skips them (CI/unit stays fast and offline); `pnpm test:rls` runs them.

**Step 1: Create `tests/helpers/env.ts`** (exact content):

```ts
// Loads .env.local into process.env for integration tests (vitest does not
// load Next's env files). No new dependency: minimal parser, KEY=VALUE
// lines only, no quoting/expansion — matches how this repo's .env.local
// is written.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvLocal(): void {
  const path = resolve(__dirname, '../../.env.local');
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}
```

**Step 2: Create `tests/helpers/clients.ts`** (exact content):

```ts
// Test clients + fixture users for real-DB integration tests.
// Service-role client sets up fixtures (BYPASSRLS); per-user anon clients
// authenticate with password sign-in to probe RLS as real JWTs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './env';

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = {
  email: string;
  id: string;
  client: SupabaseClient;
};

const PASSWORD = 'rls-test-Password-1234!';

export async function createTestUser(localPart: string): Promise<TestUser> {
  const email = `${localPart}@rls-test.invalid`;
  // Idempotent: delete any leftover from a crashed previous run.
  const { data: existing } = await admin.auth.admin.listUsers();
  const leftover = existing?.users.find((u) => u.email === email);
  if (leftover) await admin.auth.admin.deleteUser(leftover.id);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);

  return { email, id: data.user.id, client };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  await user.client.auth.signOut();
  await admin.auth.admin.deleteUser(user.id); // cascades public.users
}
```

**Step 3: Create `tests/rls/foundations.rls.test.ts`** (exact content):

```ts
// Sprint 1 RLS probes against the live dev project, as real JWTs.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('foundations RLS', () => {
  let alice: TestUser;
  let bob: TestUser;
  let staffUser: TestUser; // granted eventar_staff via fixture row

  beforeAll(async () => {
    alice = await createTestUser('alice');
    bob = await createTestUser('bob');
    staffUser = await createTestUser('opstaff');
    const { error } = await admin.from('staff').insert({
      email: staffUser.email,
      role: 'eventar_staff',
      full_name: 'RLS Test Operator',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture: ${error.message}`);
  }, 60_000);

  afterAll(async () => {
    await admin.from('staff').delete().eq('email', staffUser.email);
    for (const u of [alice, bob, staffUser]) if (u) await deleteTestUser(u);
  }, 60_000);

  // ---- users mirror ----
  it('handle_new_user mirrored the test users into public.users', async () => {
    const { data } = await admin
      .from('users')
      .select('id')
      .in('id', [alice.id, bob.id]);
    expect(data).toHaveLength(2);
  });

  it('alice reads her own users row', async () => {
    const { data, error } = await alice.client
      .from('users')
      .select('id, full_name')
      .eq('id', alice.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(alice.id);
  });

  it('alice cannot read bob’s users row (filtered, not errored)', async () => {
    const { data, error } = await alice.client
      .from('users')
      .select('id')
      .eq('id', bob.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('alice updates her own full_name', async () => {
    const { data, error } = await alice.client
      .from('users')
      .update({ full_name: 'Alice Chan' })
      .eq('id', alice.id)
      .select('full_name')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.full_name).toBe('Alice Chan');
  });

  it('alice cannot update bob (RLS-silent-fail guard: zero rows)', async () => {
    const { data, error } = await alice.client
      .from('users')
      .update({ full_name: 'hacked' })
      .eq('id', bob.id)
      .select('id')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('eventar_staff reads all users', async () => {
    const { data, error } = await staffUser.client
      .from('users')
      .select('id')
      .in('id', [alice.id, bob.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  // ---- organisations ----
  it('non-staff alice sees no organisations', async () => {
    const { data } = await alice.client.from('organisations').select('id');
    expect(data).toHaveLength(0);
  });

  it('eventar_staff reads the default organisation', async () => {
    const { data } = await staffUser.client
      .from('organisations')
      .select('slug')
      .eq('id', DEFAULT_ORG)
      .maybeSingle();
    expect(data?.slug).toBe('default');
  });

  // ---- consent ----
  it('alice records and reads her own consent', async () => {
    const { error: insertError } = await alice.client
      .from('consent_records')
      .insert({
        user_id: alice.id,
        consent_type: 'terms_of_service',
        version: 'test-1.0',
      });
    expect(insertError).toBeNull();
    const { data } = await alice.client
      .from('consent_records')
      .select('version')
      .eq('user_id', alice.id);
    expect(data).toHaveLength(1);
  });

  it('alice cannot insert consent for bob (42501)', async () => {
    const { error } = await alice.client.from('consent_records').insert({
      user_id: bob.id,
      consent_type: 'marketing',
      version: 'test-1.0',
    });
    expect(error?.code).toBe('42501');
  });

  // ---- DSR ----
  it('bob files a DSR and reads it back; alice cannot see it', async () => {
    const { error: insertError } = await bob.client
      .from('data_subject_requests')
      .insert({ subject_user_id: bob.id, request_type: 'access' });
    expect(insertError).toBeNull();

    const { data: bobSees } = await bob.client
      .from('data_subject_requests')
      .select('id')
      .eq('subject_user_id', bob.id);
    expect(bobSees).toHaveLength(1);

    const { data: aliceSees } = await alice.client
      .from('data_subject_requests')
      .select('id')
      .eq('subject_user_id', bob.id);
    expect(aliceSees).toHaveLength(0);
  });

  // ---- audit_events ----
  it('non-staff alice sees no audit events', async () => {
    const { data } = await alice.client.from('audit_events').select('id');
    expect(data).toHaveLength(0);
  });

  it('alice cannot insert into audit_events directly (42501)', async () => {
    const { error } = await alice.client.from('audit_events').insert({
      event_type: 'forged',
      prev_hash: 'x',
      hash: 'x',
    });
    expect(error?.code).toBe('42501');
  });

  // ---- pseudonymise_user ----
  it('non-staff alice cannot pseudonymise bob (42501)', async () => {
    const { error } = await alice.client.rpc('pseudonymise_user', {
      p_user_id: bob.id,
      p_reason: 'malicious',
    });
    expect(error?.code).toBe('42501');
  });

  it('eventar_staff pseudonymises bob; audit row written in-transaction', async () => {
    const { error } = await staffUser.client.rpc('pseudonymise_user', {
      p_user_id: bob.id,
      p_reason: 'rls-test erasure',
    });
    expect(error).toBeNull();

    const { data: bobRow } = await admin
      .from('users')
      .select('full_name, pseudonymised_at')
      .eq('id', bob.id)
      .single();
    expect(bobRow?.full_name).toMatch(/^ERASED-[0-9a-f]{12}$/);
    expect(bobRow?.pseudonymised_at).not.toBeNull();

    const { data: auditRow } = await admin
      .from('audit_events')
      .select('event_type, subject_id, payload')
      .eq('event_type', 'user_pseudonymised')
      .eq('subject_id', bob.id)
      .maybeSingle();
    expect(auditRow).not.toBeNull();
    expect((auditRow?.payload as { reason?: string })?.reason).toBe(
      'rls-test erasure',
    );
  });
});
```

**Step 4: Create `tests/audit/chain.test.ts`** (exact content):

```ts
// Audit chain integrity under concurrency, against the live dev project.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { admin } from '../helpers/clients';

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

describe.skipIf(!process.env.RLS_TESTS)('audit chain', () => {
  it('sequential writes chain correctly', async () => {
    for (let i = 0; i < 5; i++) {
      const { error } = await admin.rpc('write_audit_event', {
        p_event_type: `chain_test_seq_${i}`,
      });
      expect(error).toBeNull();
    }
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => r.link_valid && r.content_valid)).toBe(true);
  }, 60_000);

  it('200 concurrent writes produce a linear, valid chain', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        admin.rpc('write_audit_event', {
          p_event_type: `chain_test_concurrent_${i}`,
        }),
      ),
    );
    expect(results.every((r) => r.error === null)).toBe(true);

    const { data } = await admin.rpc('verify_audit_chain');
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);

    // Linkage re-check straight off the table, ordered by chain_seq.
    const { data: raw } = await admin
      .from('audit_events')
      .select('chain_seq, prev_hash, hash')
      .order('chain_seq', { ascending: true });
    for (let i = 1; i < raw!.length; i++) {
      expect(raw![i].prev_hash).toBe(raw![i - 1].hash);
    }
  }, 120_000);
});
```

**Step 5: Add the script to `package.json`** — in `"scripts"`, after `"test:watch"`, add exactly:

```json
"test:rls": "RLS_TESTS=1 vitest run tests/rls tests/audit"
```

**Step 6: Verify the gate — plain unit run must skip these suites:**

```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm exec vitest run 2>&1 | tail -4
```
Expected: `Tests 438 passed | 17 skipped` (the 17 new tests report skipped).

**Step 7: Run the integration suite:**

```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm run test:rls 2>&1 | tail -6
```
Expected: `Test Files 2 passed`, `Tests 17 passed`. If any test fails, STOP — diagnose with `superpowers:systematic-debugging`; do NOT weaken an assertion to pass.

**Step 8: Controller commits:**

```
test(cpd-s1): real-DB RLS + audit-chain integration suite (env-gated, pnpm test:rls)
```

---

## Task 8: Full regression gates + backtest

**Step 1:** Run all four static gates:

```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run 2>&1 | tail -3 && pnpm exec next build 2>&1 | tail -4
```
Expected: tsc silent · eslint 0 errors (5 pre-existing warnings in `lib/devEmailStub*` are known) · 438 passed / 17 skipped · build succeeds with the same route table as before.

**Step 2: Existing-surface backtest** (the 18 routes must be unaffected). With the user's dev server on :3000:

```bash
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/ http://localhost:3000/events http://localhost:3000/login; echo
```
Expected: `200 200 200`. Then via MCP `execute_sql` (manager-context read, proving the hardened helpers still grant Ivan access):

```sql
set role authenticated;
set request.jwt.claims = '{"email":"ahf.ivan@gmail.com"}';
select (select count(*) from public.events) as events_visible,
       (select count(*) from public.registrations) as regs_visible;
reset role;
```
Expected: `events_visible = 7`, `regs_visible = 63` (or current live counts — must be nonzero and equal to the counts a service-role query returns).

**Step 3:** `supabase migration list` (command from Task 0 Step 2). Expected: 32 rows, all two-sided, ending `20260704130500`.

---

## Task 9: Docs close-out (controller)

1. Update `docs/plans/PROJECT_STATE.md`: ACTIVE PHASE → "CPD Sprint 1 shipped (code); Sprint 2 next (auth split + security shell)"; list the six migrations + test suite; note the audit-insert-last convention is now LIVE (any future Server Action writing audit events must emit last-before-commit).
2. Write `docs/plans/handoff_04072026.md` following the existing handoff format: what shipped, gate numbers, live-DB assertions run, open items.
3. Vault: update `20 — Roadmap/CPD Roadmap — Backend First.md` Sprint-1 status + `00 — Index.md` current-focus line.
4. Controller commits: `docs(cpd-s1): close-out — PROJECT_STATE, handoff, vault status`.

---

## Task 10: Phase-completion protocol (controller — MANDATORY before declaring done)

Per `~/.claude/CLAUDE.md`, dispatch in order:

1. **Dev-lens review agent** (fresh subagent, read-only): reads this plan + `git diff 65935c7..HEAD` + every new file in full; independently re-runs the four static gates + `pnpm run test:rls`; checks: RLS coverage on every new table, the advisory-lock trigger against BASELINE-DELTAS §3.2, no service-role client in any Server Action, repo CLAUDE.md rule compliance.
2. **User-lens review agent** (SEPARATE fresh subagent): cold-start journey — logs into :3000 as Ivan's flow would, walks dashboard/events/details, confirms nothing about the existing product changed or broke; reviews the 42501 error paths for information leakage (error messages must not reveal whether a target user exists).
3. **Backtest** is Tasks 5–8's live-DB assertions plus `pnpm run test:rls` — re-run `pnpm run test:rls` one final time after any fix from reviews.

Fix findings, re-run affected checks, THEN write the handoff (Task 9 order swaps if findings appear — handoff is always last).

---

## Task 11: Singapore project provisioning (CONTROLLER + IVAN — not a subagent task)

Blocked on: Tasks 1–10 complete (the chain is proven on Seoul first; the fresh project then starts with the full clean chain).

1. Via Supabase MCP: `get_cost` (project, org `jmxhxappsnqkqfoawoku`) → `confirm_cost` with Ivan seeing the price → `create_project` name `eventar-prod`, region `ap-southeast-1`. (Free-tier slot expected; if `get_cost` returns non-zero, surface to Ivan before confirming.)
2. `supabase link --project-ref <new-ref>` in a SEPARATE checkout or re-link temporarily; `supabase db push` the full 32-migration chain. **Contingency:** if a historical migration fails on fresh apply (candidate: `20260521010000` line 141 `revoke ... on public.rls_auto_enable()` — the function may not exist on a fresh project), wrap ONLY the failing statement in `do $$ begin <statement>; exception when undefined_function then null; end $$;`, commit as `fix(migrations): guard <name> for fresh-project apply` with a note that Seoul's applied history is unaffected, and re-push.
3. Re-link the repo to Seoul (`supabase link --project-ref muieupgkpbxpqsrjjwol`) — Seoul remains the dev target until Milestone M4.
4. Record the new project ref in `docs/plans/PROJECT_STATE.md` and the vault roadmap note. Do NOT put keys anywhere except `.env.*` files and the dashboard.
```
