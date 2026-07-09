# CPD Sprint 3a — Credit Ledger Core + Identity/Tenancy DDL (ungated half)

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task (or the controller uses `superpowers:subagent-driven-development` and dispatches one fresh subagent per task).

**Goal:** Land the parts of Sprint 3 that the external-voice review (one accrediting body, one organiser, one practitioner — still not scheduled as of 2026-07-09) **cannot** change: the identity/tenancy DDL (`accrediting_bodies`, `organisers`, `practitioner_licences`), the 5-role staff enum widen, per-body seed data for the citation-grounded bodies, and the `credit_ledger` core schema + its own hash chain. Explicitly **not** in this plan (deferred to Sprint 3b, gated on the review): `organiser_users`, `body_reviewer_permissions`, wiring credit issuance to the event `published→credited` transition, body-specific PDF export format, cross-body recognition automation.

**Why this split, not the whole of Sprint 3:** per Decisions Log Q24/Q25 and `docs/DEFERRED.md` item 24 ("External review... gates Sprint 3 credit-ledger implementation"). The review can materially change the *body-reviewer workflow* and the *`accredited` transition semantics* — it cannot change whether the ledger is append-only, whether it keys on `licence_id`, or the shape of `accrediting_bodies`/`practitioner_licences` (Q23-locked, and independently confirmed by six primary-source regulator citations in Q24). Building the foundation now and gating only the review-sensitive surface is the documented escalation clause working as designed ("3 external reviews complete, **or Sprint 3 blocker escalation**" — Out of Scope.md), not a bypass of it.

**Architecture:** Eight forward-only Supabase migrations applied via CLI `db push` to the linked Seoul project (see Rule 1 below — this reverts to Sprint 1's original guidance after Sprint 2 deviated from it), each followed by RLS/integration tests (vitest, env-gated, real DB). No file under `app/`, `components/`, or `emails/` is touched — frontend stays frozen. `credit_ledger` gets its **own** hash chain and advisory lock, separate from `audit_events` (Credit Ledger §8.4, resolved before this session).

**Tech stack:** Postgres 17 (Supabase), Supabase CLI (linked), `@supabase/supabase-js`, vitest 4.

---

## MANDATORY RULES FOR THE EXECUTOR — read before Task 0

1. **Migrations are applied ONLY via `supabase db push`, never the Supabase MCP `apply_migration` tool.** This reverts to Sprint 1's original rule. Sprint 1 forbade `apply_migration` explicitly ("it stamps a server-side version number that diverges from the local filename"); Sprint 2 used it anyway and hit exactly that problem ten times, working around it with post-hoc renaming every single call. Avoid the whole class of bug this time — `db push` uses the local filename as the version, no drift possible. If `db push` fails, STOP, capture the full error, report back. Do not work around it with MCP.
2. **Convention fork, resolved — flagging so it's visible, not silent.** Data Model.md's Q23-locked DDL (drafted before this repo's own conventions were applied to it) uses native Postgres `enum` types and `uuid_generate_v4()`. This plan instead uses **`text` + `CHECK`** (matching Sprint 1 Rule 7 and the actual shipped `staff.role`/`organisations.status` columns) and **`gen_random_uuid()`** (matching the actual shipped `organisations.id`), for every new column/table below. Functionally identical; chosen for consistency with what's already live. If this is wrong, it's a cheap follow-up migration, not a rewrite — flag it and Task 1 onward can be adjusted.
3. **Subagents do not commit.** Controller commits after reviewing each task, using the exact commit message given.
4. **Do not touch** `app/**`, `components/**`, `emails/**`, `proxy.ts`, or any existing migration file. New files only.
5. **Node PATH:** shell defaults to node v14. Every `pnpm` command prefixed: `export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH`.
6. **Grant hygiene — the recurring bug class from Sprint 2, do not repeat it.** This project has a schema-wide `ALTER DEFAULT PRIVILEGES` granting `anon`/`authenticated`/`service_role` EXECUTE on every new function at `CREATE` time, plus functions can carry a bare implicit `PUBLIC` grant. Revoking a named role is a no-op if `PUBLIC` or the default ACL still holds it. **For every new `SECURITY DEFINER` function in this plan:** after creating it, query `select proacl from pg_proc where proname = '<fn>'` directly — do not rely on `has_function_privilege` checked only against the roles you expect to matter. Explicitly `revoke all on function <fn> from public, anon, authenticated` first, then grant back only the specific role(s) that should call it.
7. **Two separate hash chains, do not conflate them.** `audit_events` (existing, Sprint 1) records *who did what* — staff/user actions, gated by `pg_advisory_xact_lock(hashtext('audit_events_chain'))`. `credit_ledger` (this plan, Task 8) records *what credits exist* — its own append-only financial-grade record, gated by a **separate** `pg_advisory_xact_lock(hashtext('credit_ledger_chain'))` (Credit Ledger §8.4: separate chain to avoid doubling contention under check-in bursts). Licence mutations (Task 6) write to `audit_events` (they're staff/practitioner *actions*). Credit entries (Task 9) write to `credit_ledger` only — a ledger entry is not also duplicated into `audit_events`.
8. **Audit/ledger insert is the last statement before commit**, in every mutating function in this plan — same convention as `pseudonymise_user`.
9. **Scope boundary, repeated so it isn't missed mid-execution:** `organiser_users` and `body_reviewer_permissions` are **not** part of this plan. If a task seems to need them, stop and re-check against Sprint 3b's scope rather than building ahead of the gate.
10. **The user's dev server runs on port 3000 — never start another one.**
11. All new SQL follows repo conventions: lowercase SQL, `text` + CHECK, `app_private.*` helper style, policy names `<table>_<actor>_<action>`.

**Pinned facts — re-verify in Task 0, do not assume stale:**

- Sprint 1 shipped ending at migration `20260704130500`. Sprint 2 added 10 more via MCP `apply_migration` with filenames reconciled after the fact — **this plan does not have Sprint 2's exact final timestamp**, so Task 0 Step 2 re-derives it live rather than assuming a number.
- Sprint 2 shipped at vitest 461 passed | 59 skipped, `pnpm test:rls` 59/59, 19 routes, migration list 43/43 two-sided (per `PROJECT_STATE.md`, 2026-07-08). Re-verify these are still true in Task 0 before adding anything.
- `staff.role` is `text` with constraint `staff_role_check` (Sprint 1 pinned fact) — currently 2 values (`manager`/`eventar_staff` era naming per Sprint 2 Task 1a). Task 2 below widens the CHECK, not a type.
- `pgcrypto` in `extensions` schema; `gen_random_uuid()` resolves without schema-qualifying (Sprint 1 precedent, Task 1 of that plan).

---

## Task 0: Preflight (read-only — no changes)

**Step 1:**
```bash
cd /Users/ivan/Eventar && git status --short
```
Expected: empty (or only this plan file, untracked). If unexpected changes exist, STOP and report.

**Step 2 — re-derive the actual migration tip (do not assume Sprint 1's numbers, Sprint 2 changed them):**
```bash
supabase migration list --linked -p "$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2-)" 2>&1 | tail -15
```
Expected: every row two-sided (Local + Remote both present), 43 rows total per the last handoff. Record the actual final timestamp — this plan's Task 1 filename must sort after it.

**Step 3:**
```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH && pnpm exec vitest run 2>&1 | tail -4
```
Expected: `461 passed | 59 skipped`. Record the numbers as this plan's baseline.

**Step 4 — confirm current `staff.role` values in use (Task 2 widens this CHECK, must not break existing rows):**
```sql
select distinct role from public.staff;
```
Expected: existing roles only (no surprises). Record them.

---

## Task 1: Migration — `users` additions (`preferred_name`, `display_language`)

**Files:** Create `supabase/migrations/<tip+1>_users_practitioner_fields.sql` (use the real timestamp from Task 0 Step 2, sorting after it).

```sql
-- CPD Sprint 3a — practitioner-facing identity fields, merged into users
-- per Decisions Log Q23 item 6 (no practitioners table; per-table notes in
-- Data Model.md). text + CHECK per Rule 2 above, not the drafted enum.

alter table public.users
  add column preferred_name   text,
  add column display_language text not null default 'en'
    check (display_language in ('en','zh-Hant','zh-Hans'));
```

**Assert (Supabase MCP `execute_sql`, read-only):**
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='users'
  and column_name in ('preferred_name','display_language');
```
Expected: two rows, `display_language` default `'en'::text`.

**Commit:** `feat(cpd-s3a): users.preferred_name + display_language (Q23 item 6)`

---

## Task 2: Migration — 5-role staff enum widen + TS type

**Files:**
- Create `supabase/migrations/<tip+2>_staff_5role_widen.sql`
- Edit: wherever `Staff.role` is typed in TS (per `docs/DEFERRED.md` item 15/16: `StaffShell.tsx`/`SettingsClient.tsx`'s own local prop types — **read those two files first**, this is the one place this plan touches a TS type, not `app/**` logic)

```sql
-- CPD Sprint 3a — widen staff_role_check from 2 to 5 values.
-- Existing rows unaffected (additive CHECK widen, not a rewrite).
-- Bundled with the TS union widen per docs/DEFERRED.md items 15/16
-- (same commit touches StaffShell.tsx/SettingsClient.tsx anyway).

alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('organiser_admin','organiser_member','body_admin','auditor','eventar_staff'));
```

**Before writing this migration:** confirm Task 0 Step 4's existing role values map onto the new 5. If any existing row's role isn't in the new list, the `ALTER TABLE` fails loudly (correct — do not silently coerce; stop and report which rows don't map).

**TS side:** widen the `Staff.role` union type to the same 5 values at its single source of truth; fix the 9 call sites Sprint 2 found this breaks (`StaffShell.tsx`/`SettingsClient.tsx` local prop types). Run `tsc --noEmit` and confirm 0 errors before proceeding.

**Commit:** `feat(cpd-s3a): 5-role staff enum widen + TS type (closes DEFERRED items 15,16)`

---

## Task 3: Migration — `accrediting_bodies`

**Files:** Create `supabase/migrations/<tip+3>_accrediting_bodies.sql`

```sql
-- CPD Sprint 3a — accrediting_bodies. Q23 item 5 (organisations is the
-- tenancy base; this is a downstream table). text+CHECK per Rule 2,
-- gen_random_uuid() per Rule 2 — both deviate from Data Model.md's drafted
-- enum/uuid_generate_v4(), see Rule 2 for why.

create table public.accrediting_bodies (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id),
  short_name        text not null,
  full_name         text not null,
  parent_body_id    uuid references public.accrediting_bodies(id),
  jurisdiction      text not null default 'HK',
  cycle_config      jsonb not null,
  category_taxonomy jsonb not null,
  retention_years   integer not null default 6,
  status            text not null default 'onboarding'
                       check (status in ('active','onboarding','deferred')),
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index accrediting_bodies_org_idx on public.accrediting_bodies(organisation_id);
create index accrediting_bodies_parent_idx on public.accrediting_bodies(parent_body_id);

alter table public.accrediting_bodies enable row level security;

-- ORG pattern (Auth Flow#JWT claims and RLS reliance): staff of the owning org.
create policy "accrediting_bodies_org_staff_read" on public.accrediting_bodies
  for select to authenticated
  using (exists (
    select 1 from public.staff
    where staff.organisation_id = accrediting_bodies.organisation_id
      and staff.email = app_private.auth_email()
      and staff.status = 'active'
  ));

-- Public read on active bodies (name/status only surfaced at the app layer)
-- for the practitioner-facing "declare your licence" picker.
create policy "accrediting_bodies_public_read_active" on public.accrediting_bodies
  for select to anon, authenticated
  using (status = 'active');

-- No INSERT/UPDATE/DELETE policy: body management is service-role/internal-admin
-- only at launch (service_role bypasses RLS). Revisit if organiser-side
-- self-service body management ever ships.
```

**Assert:**
```sql
select count(*) from public.accrediting_bodies; -- expect 0 (seeding is Task 7)
select relrowsecurity from pg_class where relname = 'accrediting_bodies'; -- expect true
```

**RLS test file:** `tests/rls/accrediting_bodies.rls.test.ts` — Gherkin-style per Data Model.md's own convention (owner-org staff read: pass; wrong-org staff read: denied; anon read of `status='active'` row: pass; anon read of `status='onboarding'` row: denied; direct INSERT as `authenticated`: denied, `42501`).

**Commit:** `feat(cpd-s3a): accrediting_bodies table + RLS`

---

## Task 4: Migration — `organisers`

**Files:** Create `supabase/migrations/<tip+4>_organisers.sql`

```sql
-- CPD Sprint 3a — organisers. Q23 item 5: downstream of organisations,
-- sibling to accrediting_bodies (an entity can hold rows in both, e.g.
-- HKICPA accredits AND runs its own events).

create table public.organisers (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id),
  legal_name          text not null,
  display_name        text not null,
  organisation_type   text not null
                         check (organisation_type in (
                           'training_provider','professional_body','academic_institution',
                           'conference_producer','law_firm','accounting_firm',
                           'corporate_lnd','medical_society','other'
                         )),
  primary_body_id     uuid references public.accrediting_bodies(id),
  status              text not null default 'pending_verification'
                         check (status in ('active','suspended','pending_verification')),
  registration_number text,
  contact_email       text not null,
  billing_address     jsonb,
  created_at          timestamptz not null default now()
);

create index organisers_org_idx on public.organisers(organisation_id);
alter table public.organisers enable row level security;

-- ORG pattern, same shape as accrediting_bodies' staff-read policy.
create policy "organisers_org_staff_read" on public.organisers
  for select to authenticated
  using (exists (
    select 1 from public.staff
    where staff.organisation_id = organisers.organisation_id
      and staff.email = app_private.auth_email()
      and staff.status = 'active'
  ));

-- No public read: organiser records are not practitioner-facing the way
-- accrediting_bodies is (no "pick your organiser" flow exists).
```

**Assert:** same shape as Task 3 (row count 0, RLS enabled).

**RLS test file:** `tests/rls/organisers.rls.test.ts` — owner-org staff read: pass; wrong-org: denied; anon: denied entirely (no public policy exists).

**Commit:** `feat(cpd-s3a): organisers table + RLS`

---

## Task 5: Migration — `practitioner_licences`

**Files:** Create `supabase/migrations/<tip+5>_practitioner_licences.sql`

```sql
-- CPD Sprint 3a — practitioner_licences. Q23 item 6: keyed on users.id
-- directly (no practitioners table). Ledger keys on licence_id, not
-- user_id (Credit Ledger §1 design principle) — different bodies have
-- different cycles/units/floors, and a licence can lapse at one body
-- without affecting another.

create table public.practitioner_licences (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id),
  body_id               uuid not null references public.accrediting_bodies(id),
  licence_number        text not null,
  licence_type          text,
  is_primary            boolean not null default false,
  status                text not null default 'declared'
                           check (status in ('declared','verified','lapsed','revoked','superseded')),
  declared_at           timestamptz not null default now(),
  verified_at           timestamptz,
  lapsed_at             timestamptz,
  revoked_at            timestamptz,
  superseded_by         uuid references public.practitioner_licences(id),
  cycle_start_override  date,
  cycle_config_override jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, body_id, licence_number)
);

create trigger practitioner_licences_touch_updated_at
  before update on public.practitioner_licences
  for each row execute function public.touch_updated_at();

-- At most one is_primary = true per user_id.
create unique index practitioner_licences_one_primary_idx
  on public.practitioner_licences(user_id) where is_primary;

create index practitioner_licences_user_idx on public.practitioner_licences(user_id);
create index practitioner_licences_body_idx on public.practitioner_licences(body_id);

alter table public.practitioner_licences enable row level security;

-- No organisation_id (cross-tenant, mirrors users). SELF + ORG(body_admin) per
-- Data Model.md's own note on this table.
create policy "practitioner_licences_self_read" on public.practitioner_licences
  for select to authenticated
  using (user_id = auth.uid());

create policy "practitioner_licences_self_write" on public.practitioner_licences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Body-admin staff (of the owning organisation for that body) read for verification.
create policy "practitioner_licences_body_admin_read" on public.practitioner_licences
  for select to authenticated
  using (exists (
    select 1 from public.accrediting_bodies ab
    join public.staff s on s.organisation_id = ab.organisation_id
    where ab.id = practitioner_licences.body_id
      and s.email = app_private.auth_email()
      and s.status = 'active'
      and s.role in ('body_admin','eventar_staff')
  ));
```

**Assert:** row count 0; `select indexdef from pg_indexes where indexname = 'practitioner_licences_one_primary_idx';` confirms the partial unique index exists.

**RLS test file:** `tests/rls/practitioner_licences.rls.test.ts` — self CRUD own licence: pass; read another user's licence: denied; body_admin of the owning body's org reads: pass; body_admin of a *different* org: denied; two `is_primary=true` rows for the same user: constraint violation (`23505`).

**Commit:** `feat(cpd-s3a): practitioner_licences table + RLS`

---

## Task 6: Licence mutation functions (audited-mutation template)

**Files:** Create `supabase/migrations/<tip+6>_licence_mutations.sql`

This also closes `docs/DEFERRED.md` item 21 ("Audited-function template / codegen") for this one family of six near-identical functions — write the first (`declare_licence`) in full, then the remaining five follow the identical shape with different gate/columns. Per Rule 7: these write to `audit_events` (they're actions on records, not the ledger itself).

> **Signature verified live, not assumed.** `write_audit_event`'s actual signature (queried directly against the Seoul project rather than inferred from BASELINE-DELTAS.md's partial references) is: `p_event_type text, p_actor_user_id uuid default null, p_actor_role text default null, p_organisation_id uuid default null, p_subject_type text default null, p_subject_id uuid default null, p_payload jsonb default '{}'`. Named-parameter calls (as below) are safe against omitted optional params, but **`p_subject_type` must be populated** — every real event in the live table has one (`'consent'`, `'event'`, `'registration'`, `'user'`, etc., always singular snake_case); leaving it null would have been silently accepted, not caught by any test. Use `'practitioner_licence'` for all six functions below. `p_organisation_id` is left null throughout — `practitioner_licences` is deliberately cross-tenant (mirrors `users`, no direct `organisation_id`), so there's no single natural org to attach.

```sql
-- CPD Sprint 3a — licence mutations, audited-mutation shape (same as
-- pseudonymise_user): gate-check -> mutation -> audit-write-last inside
-- the EXISTING audit_events advisory lock (not credit_ledger's — these
-- are actions, not ledger entries; see Rule 7).

create or replace function public.declare_licence(
  p_body_id uuid,
  p_licence_number text,
  p_licence_type text default null
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.practitioner_licences;
begin
  -- Gate: self-service, caller must be an authenticated user (no staff gate —
  -- this mirrors grant_consent's self-actor shape, not transition_dsr's staff shape).
  if auth.uid() is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type)
  values (auth.uid(), p_body_id, p_licence_number, p_licence_type)
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_declared',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('body_id', p_body_id, 'licence_id', v_row.id)
  );

  return v_row;
end;
$$;

revoke all on function public.declare_licence(uuid, text, text) from public, anon;
grant execute on function public.declare_licence(uuid, text, text) to authenticated;
-- Verify per Rule 6: select proacl from pg_proc where proname = 'declare_licence';
-- confirm anon/PUBLIC are NOT present, authenticated IS.

-- set_primary_licence(p_licence_id uuid) — self-actor, same shape as above.
-- Gate: auth.uid() = the licence's own user_id (raise 42501 otherwise).
-- Mutation: unset any other is_primary for this user, set this one true
-- (two statements inside the same function transaction — the partial
-- unique index still holds since both updates commit atomically).
-- Audit event: 'licence_marked_primary'.

-- verify_licence(p_licence_id uuid) — STAFF-actor shape (like transition_dsr).
-- Gate: `v_staff := app_private.require_active_staff('body_admin','eventar_staff');`
-- (verified live: returns the calling `staff` row, VARIADIC p_roles text[] —
-- capture it, don't re-query staff separately) then check v_staff.organisation_id
-- matches the licence's body's organisation_id (same join as
-- practitioner_licences_body_admin_read policy above; raise 42501 on mismatch).
-- Mutation: status='verified', verified_at=now().
-- Audit event: 'licence_verified'.

-- lapse_licence(p_licence_id uuid, p_reason text) — staff-actor shape.
-- Mutation: status='lapsed', lapsed_at=now(). Audit event: 'licence_lapsed'.

-- revoke_licence(p_licence_id uuid, p_reason text) — staff-actor shape,
-- p_reason required (not null check in the function body, raise on null).
-- Mutation: status='revoked', revoked_at=now(). Audit event: 'licence_revoked'.

-- supersede_licence(p_old_licence_id uuid, p_new_licence_number uuid) — self-actor.
-- Mutation: creates a NEW practitioner_licences row (declare_licence's insert,
-- inlined or called internally), sets old row's status='superseded' and
-- superseded_by = new row's id. Audit event: 'licence_superseded' with both IDs
-- in payload. Ledger entries stay keyed on the OLD licence_id (Data Model.md's
-- own note: "ledger entries stay keyed on the old licence_id for historical
-- integrity") — this function does not touch credit_ledger at all.
```

**Do not leave the five stubbed functions as comments** — the executor writes each in full, following `declare_licence`'s exact shape (gate → mutation → advisory-lock → `write_audit_event` → return), before Task 6 is considered done. The comments above specify the gate/mutation/audit-event-name for each; that's the spec, not a shortcut.

**Grant-hygiene check (Rule 6), for all six functions:**
```sql
select proname, proacl from pg_proc
where proname in ('declare_licence','set_primary_licence','verify_licence',
                   'lapse_licence','revoke_licence','supersede_licence');
```
Confirm each shows exactly the intended roles — no bare `PUBLIC`, no unintended `anon`.

**Test file:** `tests/audit/licence_mutations.test.ts` — one test per function: happy path + audit event recorded correctly + wrong-actor denial (`42501`) for the staff-gated ones + self-vs-other denial for the self-gated ones.

**Commit:** `feat(cpd-s3a): licence mutation functions (declare/set_primary/verify/lapse/revoke/supersede)`

---

## Task 7: Per-body seed data

**Files:** Create `supabase/migrations/<tip+7>_seed_accrediting_bodies.sql`

Seed only what's citation-grounded (Decisions Log Q24) or explicitly flagged where it isn't. **Do not fabricate VSB's category taxonomy or Law Society's cycle/category** — those weren't verified this session (Credit Ledger §8.5, Data Model.md's per-body table). Default org `00000000-0000-0000-0000-000000000001` per Sprint 1's seed.

```sql
-- CPD Sprint 3a — seed accrediting_bodies with grounded per-body data.
-- Citations: Credit Ledger §8.5 / Data Model "Per-body cycle configs..." /
-- Decisions Log Q24. status='active' only for first-targeted bodies per
-- Data Model.md's launch-bodies note; HKAM colleges (incl. HKCR) stay
-- 'deferred' — HKAM partnership is Year 2+ (Out of Scope.md), not Sprint 3a.

insert into public.accrediting_bodies
  (organisation_id, short_name, full_name, jurisdiction, cycle_config, category_taxonomy, retention_years, status)
values
  ('00000000-0000-0000-0000-000000000001', 'IA', 'Insurance Authority', 'HK',
   '{"cycle_length_years":1,"cycle_start_month":8,"cycle_start_day":1,"annual_floor":15,"core_floor_hours":3,"units":"hours","cycle_start_source":"fixed","report_by_month":9,"report_by_day":30}',
   '{"types":["Type 1","Type 2","Type 3","Type 4","Type 5","Type 6","Type 7","Type 8"],"source":"GL24 Annex 1 — 8 Types of Qualified CPD Activities"}',
   3, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'HKICPA', 'Hong Kong Institute of Certified Public Accountants', 'HK',
   '{"cycle_length_years":3,"cycle_choice":"rolling","annual_floor":20,"verifiable_floor_hours":60,"period_floor_hours":120,"units":"hours"}',
   '{"note":"not itemised this pass — Statement 1.500 covers cycle/hours/retention only, no category breakdown fetched"}',
   5, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'MPFA', 'Mandatory Provident Fund Schemes Authority', 'HK',
   '{"cycle_length_years":1,"cycle_start_month":1,"cycle_start_day":1,"annual_floor":15,"core_floor_hours":4,"cycle_choice":null,"pro_rata_first_cycle":true,"carry_forward_allowed":false,"units":"hours","cycle_start_source":"fixed"}',
   '{"core":["regulatory compliance","MPF system","ethics"],"non_core":["basic accounting theories","communication skills","computer knowledge","economic/financial analysis","ESG","financial planning","financial products","fintech","insurance","investment","law and legal knowledge","management/supervisory skills","risk management"]}',
   3, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'HKIE', 'The Hong Kong Institution of Engineers', 'HK',
   '{"cycle_length_years":1,"annual_floor":30,"category_floors":{"DSTM":5,"BAS_GPM":5,"H_S":3},"self_learning_cap_hours":10,"social_cap_hours":3,"units":"hours","audit_sample_pct":1}',
   '{"categories":["DSTM","BAS_GPM","H_S","Others"],"source":"Guidance Notes for MCPD for Corporate Members, May 2026"}',
   null, 'active'), -- retention_years left NULL deliberately, not defaulted to 6 — see note below

  ('00000000-0000-0000-0000-000000000001', 'VSB', 'Veterinary Surgeons Board of Hong Kong', 'HK',
   '{"cycle_length_years":2,"cycle_choice":"rolling","cycle_start_month":10,"cycle_start_day":1,"cycle_floor_points":40,"structured_floor_points":25,"units":"points","audit_sample_pct":3}',
   '{"note":"not itemised this pass — VSB FAQ covers cycle/points/retention only, no category breakdown fetched"}',
   6, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'PT_BOARD', 'Physiotherapists Board (AHP Council)', 'HK',
   '{"cycle_length_years":3,"cycle_start_month":7,"cycle_start_day":1,"cycle_floor_points":45,"annual_floor_points":5,"core_floor_points":23,"units":"points"}',
   '{"main_categories":[{"code":"I","name":"Attendance at lecture/seminar/conference"},{"code":"II","name":"Post-graduate studies"},{"code":"III","name":"In-service training"},{"code":"IV","name":"Self study"},{"code":"V","name":"Active participation"},{"code":"VI","name":"Publication"}],"sub_categories":[{"code":"C","name":"Core","weight":1.0},{"code":"N","name":"Non-core","weight":0.5}]}',
   6, 'active'),

  ('00000000-0000-0000-0000-000000000001', 'LSHK', 'The Law Society of Hong Kong', 'HK',
   '{"_seed_placeholder": true, "_todo": "cycle not verified this session — only retention (2yr) was confirmed, per Credit Ledger §8.5"}',
   '{"_seed_placeholder": true, "_todo": "category taxonomy not verified this session"}',
   2, 'onboarding'), -- status=onboarding, not active, until cycle/category are grounded

  ('00000000-0000-0000-0000-000000000001', 'HKAM', 'Hong Kong Academy of Medicine', 'HK',
   '{"_note": "parent body only — 15 Colleges (incl. HKCR) are separate deferred child rows, not seeded individually this pass, per Out of Scope.md HKAM-partnership timing (Year 2+)"}',
   '{"_note": "not applicable at the parent level — each College sets its own taxonomy on partnership"}',
   6, 'deferred');
```

**HKIE `retention_years` note:** left `NULL` deliberately (schema currently declares it `not null default 6` — this row needs the column to allow NULL, or this plan needs to add a migration step widening it to nullable before this INSERT can succeed). **Stop and pick one before running this task:**
- (a) Alter `accrediting_bodies.retention_years` to allow `NULL` (meaning "no source states a figure, don't apply any default"), or
- (b) Seed HKIE at the schema default of `6` with a comment flagging it's unsourced.

This is exactly the "HKIE's retention default" item flagged as still-open in PROJECT_STATE.md's Open Decisions — **this task is where that decision actually has to be made**, not before. Pick (a) or (b) before running Task 7; either is a one-line change to this migration.

**Assert:**
```sql
select short_name, status, retention_years from public.accrediting_bodies order by short_name;
```
Expected: 8 rows, `LSHK` and `HKAM` NOT `status='active'` (per above).

**Commit:** `feat(cpd-s3a): seed accrediting_bodies — 6 grounded bodies + 2 explicit placeholders`

---

## Task 8: Migration — `credit_ledger` core schema + own hash chain

**Files:** Create `supabase/migrations/<tip+8>_credit_ledger.sql`

Column shape is Credit Ledger §4.1, already fully specified and citation-independent (Credit Ledger §8.1: confirmed two nullable unit columns suffice). Chain design mirrors `audit_events`' Sprint-1 fix (chain_seq overridden inside the lock) but with its **own** advisory lock name per §8.4.

```sql
-- CPD Sprint 3a — credit_ledger. Append-only, own hash chain (Credit
-- Ledger §8.4, resolved: separate from audit_events to avoid doubling
-- advisory-lock contention under check-in bursts). text+CHECK per Rule 2.

create table public.credit_ledger (
  id                     uuid primary key default gen_random_uuid(),
  chain_seq              bigint generated always as identity,
  licence_id             uuid not null references public.practitioner_licences(id),
  user_id                uuid not null references public.users(id),
  event_id               uuid references public.events(id),
  body_id                uuid not null references public.accrediting_bodies(id),
  entry_type             text not null
                            check (entry_type in (
                              'credit_earned','credit_adjusted','credit_transferred',
                              'credit_expired','credit_revoked'
                            )),
  points                 numeric,
  hours                  numeric,
  category               text,
  effective_date         date not null,
  expires_at             date,
  references_entry_id    uuid references public.credit_ledger(id),
  transfer_reference_id  uuid,
  reason                 text,
  actor_id               uuid references public.users(id),
  attestation_status     text
                            check (attestation_status in ('organiser_attested','body_confirmed')),
  created_at             timestamptz not null default now(),
  prev_hash              bytea,
  hash                   bytea not null
);

create index credit_ledger_licence_idx on public.credit_ledger(licence_id);
create index credit_ledger_body_idx on public.credit_ledger(body_id);
create index credit_ledger_chain_seq_idx on public.credit_ledger(chain_seq);

alter table public.credit_ledger enable row level security;

-- No UPDATE/DELETE policy for any role — append-only, enforced by RLS
-- absence (not just convention), matching audit_events.
create policy "credit_ledger_self_read" on public.credit_ledger
  for select to authenticated
  using (user_id = auth.uid());

create policy "credit_ledger_body_admin_read" on public.credit_ledger
  for select to authenticated
  using (exists (
    select 1 from public.accrediting_bodies ab
    join public.staff s on s.organisation_id = ab.organisation_id
    where ab.id = credit_ledger.body_id
      and s.email = app_private.auth_email()
      and s.status = 'active'
      and s.role in ('body_admin','eventar_staff')
  ));
-- No INSERT policy for authenticated/anon: all writes go through the
-- SECURITY DEFINER function in Task 9, never direct table INSERT.

-- Hash-chain trigger — same shape as audit_events' Sprint-1 fix, own lock name.
create function public.compute_credit_ledger_hash() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_prev_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtext('credit_ledger_chain'));

  select hash into v_prev_hash from public.credit_ledger
    order by chain_seq desc limit 1;

  new.prev_hash := coalesce(v_prev_hash, 'GENESIS'::bytea);
  new.hash := extensions.digest(
    new.id::text || new.entry_type || new.licence_id::text ||
    coalesce(new.points::text,'') || coalesce(new.hours::text,'') ||
    new.effective_date::text || new.prev_hash::text || new.created_at::text,
    'sha256'
  );
  return new;
end;
$$;

create trigger credit_ledger_chain_hash
  before insert on public.credit_ledger
  for each row execute function public.compute_credit_ledger_hash();

-- verify_ledger_chain() — mirrors verify_audit_chain()'s shape exactly.
create function public.verify_ledger_chain()
returns table(chain_seq bigint, link_valid boolean, content_valid boolean)
language sql security definer set search_path = public, extensions, pg_temp as $$
  with ordered as (
    select *, lag(hash) over (order by chain_seq) as expected_prev
    from public.credit_ledger
  )
  select
    ordered.chain_seq,
    (ordered.prev_hash = coalesce(ordered.expected_prev, 'GENESIS'::bytea)) as link_valid,
    (ordered.hash = extensions.digest(
      ordered.id::text || ordered.entry_type || ordered.licence_id::text ||
      coalesce(ordered.points::text,'') || coalesce(ordered.hours::text,'') ||
      ordered.effective_date::text || ordered.prev_hash::text || ordered.created_at::text,
      'sha256'
    )) as content_valid
  from ordered
  order by chain_seq;
$$;

-- Rule 6 grant hygiene: revoke everything, grant back only what's needed.
revoke all on function public.compute_credit_ledger_hash() from public, anon, authenticated;
revoke all on function public.verify_ledger_chain() from public, anon;
grant execute on function public.verify_ledger_chain() to authenticated; -- staff-facing verification, RLS still governs what rows they can see
```

**Assert:** `select count(*) from public.credit_ledger;` → 0 (no writer function wired yet — that's Task 9). `select proacl from pg_proc where proname in ('compute_credit_ledger_hash','verify_ledger_chain');` per Rule 6.

**Commit:** `feat(cpd-s3a): credit_ledger table + own hash chain (§8.4)`

---

## Task 9: Ledger-entry-writing function + dispute table (NOT wired to event transitions)

**Files:** Create `supabase/migrations/<tip+9>_credit_ledger_entry_fn.sql`

Per Rule 9 (scope boundary): this ships the *capability* to write a ledger entry and the dispute-resolution mechanism (Credit Ledger §7, resolved and unaffected by the review gate — Event Lifecycle §9.3 already locked "credit and mark for adjustment" in Q25). It does **not** wire this to the event `published→credited` transition — that wiring is Sprint 3b, once the reviewer-workflow shape is confirmed. `service_role`-only for now, same pattern as `record_session_revocation`.

```sql
-- CPD Sprint 3a — generic ledger-entry writer. service_role-only: no live
-- caller exists yet (event-transition wiring is Sprint 3b). Directly
-- testable via the admin client for RLS/chain integration tests.

create or replace function public.record_credit_entry(
  p_licence_id uuid, p_user_id uuid, p_event_id uuid, p_body_id uuid,
  p_entry_type text, p_points numeric, p_hours numeric, p_category text,
  p_effective_date date, p_attestation_status text, p_actor_id uuid default null,
  p_references_entry_id uuid default null, p_reason text default null
) returns public.credit_ledger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.credit_ledger;
begin
  insert into public.credit_ledger
    (licence_id, user_id, event_id, body_id, entry_type, points, hours, category,
     effective_date, attestation_status, actor_id, references_entry_id, reason)
  values
    (p_licence_id, p_user_id, p_event_id, p_body_id, p_entry_type, p_points, p_hours,
     p_category, p_effective_date, p_attestation_status, p_actor_id,
     p_references_entry_id, p_reason)
  returning * into v_row; -- ledger insert IS the last statement — own chain, no separate audit write (Rule 7)

  return v_row;
end;
$$;

revoke all on function public.record_credit_entry(
  uuid, uuid, uuid, uuid, text, numeric, numeric, text, date, text, uuid, uuid, text
) from public, anon, authenticated;
-- service_role only (implicit — no grant statement needed, service_role bypasses grants).
-- Verify per Rule 6 anyway: confirm no anon/authenticated/PUBLIC entry in proacl.

-- credit_dispute — Credit Ledger §7, resolved, unaffected by the review gate.
create table public.credit_dispute (
  id                   uuid primary key default gen_random_uuid(),
  ledger_entry_id       uuid not null references public.credit_ledger(id),
  raised_by            uuid not null references public.users(id),
  raised_at            timestamptz not null default now(),
  reason               text not null,
  status               text not null default 'open'
                          check (status in ('open','under_review','resolved_no_change',
                                             'resolved_corrected','resolved_revoked')),
  resolution_reference uuid references public.credit_ledger(id),
  resolved_by          uuid references public.users(id),
  resolved_at          timestamptz,
  resolution_note      text
);

alter table public.credit_dispute enable row level security;

create policy "credit_dispute_self_read" on public.credit_dispute
  for select to authenticated
  using (raised_by = auth.uid());

create policy "credit_dispute_self_raise" on public.credit_dispute
  for insert to authenticated
  with check (raised_by = auth.uid());
```

**Assert:** `select count(*) from public.credit_ledger;` still 0 (no seed rows in this plan — real entries land with Sprint 3b's wiring). Grant check per Rule 6 on `record_credit_entry`.

**Test file:** `tests/audit/credit_ledger_chain.test.ts` — mirror `tests/audit/chain.test.ts`'s shape: insert N entries via `admin.rpc('record_credit_entry', ...)`, call `verify_ledger_chain()`, assert all `link_valid`/`content_valid`. Include a concurrent-insert variant (same pattern as the Sprint-2 burst test, batched in chunks of 20 per the established client-connection-ceiling lesson) to exercise the `credit_ledger_chain` advisory lock under contention, independent of `audit_events_chain`.

> **Stop and read before writing this test — do not blindly copy `tests/audit/chain.test.ts`'s pattern.** Querying the live `audit_events` table while verifying `write_audit_event`'s signature (above) surfaced that its own concurrency test suite left roughly 200+ synthetic rows permanently in the live table (`chain_test_concurrent_0`–`199`, several `diag_batch_*`/`diag_concurrent_*`, one literal `forged` — all with `subject_type=null`), because the table is append-only with no DELETE path for cleanup. That's an accepted (if never explicitly decided) trade-off for `audit_events`. **It is a worse trade-off for `credit_ledger`**, which is meant to be a real, regulator-facing record of actual credits earned, byte-identical on every PDF re-export — permanently seeding it with hundreds of synthetic `credit_earned` rows is not obviously as harmless as it was for the action-log table. Before running this test at scale, pick one:
> (a) Run the concurrency/chain-integrity test against a Supabase **branch** (`create_branch`/`delete_branch` are already available via the Supabase MCP) instead of the live Seoul project, discarding it afterward — the clean option, if branch performance characteristics are representative enough for the P99 assertion to mean anything.
> (b) Accept the same trade-off as `audit_events`, but keep every test-inserted row unambiguously synthetic (fake `licence_id`/`user_id`/`body_id` UUIDs that can never resolve to a real practitioner) and flag this explicitly in the test file's own header comment, the way `checkin_throughput.rls.test.ts` already documents its fixtures.
> Do not silently pick (b) by default just because that's what happened last time — this is worth an explicit call given the stakes are higher.
>
> Separately, unprompted finding for Ivan: the existing ~200-row `audit_events` pollution is real and live right now, independent of this plan. Worth a cheap follow-up (either purge those specific `chain_test_concurrent_*`/`diag_*`/`forged` rows via a one-off `service_role` delete — the table's append-only *policy* doesn't mean `service_role` physically can't, since it bypasses RLS — or explicitly decide to leave them and note it somewhere so a future auditor pull isn't surprised by them). Not part of this plan; flagging so it doesn't stay silently undiscovered.

**Commit:** `feat(cpd-s3a): record_credit_entry + credit_dispute (not wired to event transitions — Sprint 3b)`

---

## Task 10: Exit gate

**Step 1 — static gates:**
```bash
export PATH=/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```
Expected: 0 tsc errors, 0 new eslint errors, vitest count = Task 0's baseline + all new tests from Tasks 1-9, `next build` route count unchanged (this plan touches zero routes).

**Step 2 — RLS/integration suite:**
```bash
pnpm test:rls
```
Expected: all Sprint 2 tests still pass + every new test file from Tasks 3, 4, 5, 6, 9.

**Step 3 — grant-hygiene sweep (Rule 6), comprehensive, not spot-checked:**
```sql
select p.proname, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('declare_licence','set_primary_licence','verify_licence',
                     'lapse_licence','revoke_licence','supersede_licence',
                     'compute_credit_ledger_hash','verify_ledger_chain',
                     'record_credit_entry');
```
Manually confirm every row against the intended grant in its own task above — do not assume Task 6/8/9's grants held; re-derive from `proacl` directly per the Sprint 2 lesson.

**Step 4 — `get_advisors` run** (Supabase MCP) — confirm no new security/performance advisories introduced by this plan's 4 new tables + 9 new functions.

**Step 5 — phase-completion protocol, two separate agents:**
- **Dev-lens review:** independently re-verify against the live DB (not this plan's text) that: `credit_ledger`'s chain uses its own lock (not `audit_events_chain`); every new SECURITY DEFINER function's `search_path` is pinned; the `practitioner_licences_one_primary_idx` partial unique index actually enforces at-most-one-primary; the HKIE `retention_years` decision from Task 7 was actually made (not left as a TODO); no new function has a residual bare-`PUBLIC` grant.
- **User-lens review:** confirm zero behavior change on any existing route (this plan adds tables/functions only, no wiring to live surfaces) — curl the same routes Sprint 2's exit gate checked, expect identical responses.
- **Backtest:** via Supabase MCP `execute_sql`, not mocked — insert a real `practitioner_licences` row, call `declare_licence` for real, confirm the `audit_events` row exists with the right payload; call `record_credit_entry` for real, confirm the `credit_ledger` row's hash chains correctly via `verify_ledger_chain()`.

**Step 6 — update `PROJECT_STATE.md`** with Sprint 3a's ship summary (commits, migration count, test count delta) and move its "Standing on Ivan"/"Genuinely external" open-decisions lines forward unchanged. **Do not write the Sprint 3a handoff doc until Steps 1-5 all pass** — same discipline as every prior sprint.

---

## Explicitly out of scope for 3a — do not build ahead of the gate

- `organiser_users`, `body_reviewer_permissions` tables
- Any trigger/wiring connecting the event `published→credited` transition to `record_credit_entry`
- Body-specific PDF export format
- Cross-body recognition automation
- HKCR, and Law Society's cycle/category — seeded as explicit placeholders (Task 7), not derived

These resume in **Sprint 3b**, gated on the external-voice review (or its documented escalation) actually happening.
