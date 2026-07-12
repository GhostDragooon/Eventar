# Milestone A — Demo-Ready: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (or superpowers:subagent-driven-development in-session). Before ANY task: read `docs/plans/PROJECT_STATE.md`, vault `30 — Reference/Agent Working Method.md`, and this plan's Environment Facts. Tasks 9–10 touch the LIVE Seoul DB — security-reviewer lens is mandatory at the phase gate. Shell-out rule: `execFileSync` with array args only — never `exec`/`execSync` with interpolated strings.

**Goal:** Everything Milestone A promises: rehearsable demo pack on the local stack, replay/tamper CI harness, `set_staff_role()` + grant hygiene closed on live, collateral drafted under the CPD Ledger name (Q29), graph refreshed.

**Architecture:** Demo scripts are standalone `tsx` scripts against the LOCAL Supabase stack only (never Seoul — `credit_ledger` is append-only there); migrations for Tasks 9–10 go to live Seoul via CLI `db push` per convention; CI harness spins a throwaway local stack in GitHub Actions.

**Tech Stack:** TypeScript + `@supabase/supabase-js` (scripts), plpgsql migrations, vitest (env-gated `pnpm test:rls`), supabase CLI, GitHub Actions.

---

## Environment Facts (verified 2026-07-11/12 — do not rediscover)

- `pnpm`/`node`: **always** `export PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:/opt/homebrew/bin:$PATH"` first (system node is v14; launch runners ship minimal PATH).
- Local stack: `supabase start` then `supabase db reset` (replays all migrations + seed; proven). Keys: `supabase status -o env` → `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`. Mail catcher: `http://127.0.0.1:54324`. DB direct: `docker exec supabase_db_Eventar psql -U postgres -d postgres`.
- The committed seed's staff row is a placeholder (`MANAGER_EMAIL`) — unusable; demo seed creates its own operator (`demo-staff@local.test` pattern proven 2026-07-11).
- Demo server: `bash /Users/ivan/Eventar-demo/scripts/demo/dev-local.sh` (worktree; Next 16 allows one dev server per project directory — `:3000` belongs to the main checkout). After committing script changes: `git -C /Users/ivan/Eventar-demo checkout --detach <new-sha>`.
- Auth redirects for `:3100` already allowlisted in `supabase/config.toml`.
- Live migrations: `supabase db push` from the main checkout; migration list must stay two-sided (`supabase migration list`); RLS suite: `pnpm test:rls` (env-gated, live Seoul). Full static gates: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build`.
- Run `pnpm test:rls` once per session only (back-to-back runs exhaust local sockets → spurious failures; documented in PROJECT_STATE).

---

### Task 1: Shared demo helper + `tsx` availability

**Files:**
- Create: `scripts/demo/lib.ts`
- Modify (maybe): `package.json` (devDependency `tsx` if absent)

**Step 1: Check tsx**
Run: `grep '"tsx"' package.json || echo MISSING` — if MISSING: `pnpm add -D tsx`.

**Step 2: Write the helper**

```ts
// scripts/demo/lib.ts — clients for the LOCAL stack only.
// Refuses anything that isn't 127.0.0.1 (Seoul's ledger is append-only; demo rows would be permanent).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

export function localEnv() {
  const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)`, 'm'))?.[1];
  const url = get('API_URL');
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error(`Refusing non-local stack: ${url}`);
  return { url, anon: get('ANON_KEY')!, service: get('SERVICE_ROLE_KEY')! };
}
export function psqlLocal(sql: string): string {
  // fixed container + array args; sql is authored by our scripts, never user input
  return execFileSync('docker',
    ['exec', 'supabase_db_Eventar', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql],
    { encoding: 'utf8' }).trim();
}
export const admin = () => { const e = localEnv(); return createClient(e.url, e.service, { auth: { persistSession: false } }); };
export const anonClient = () => { const e = localEnv(); return createClient(e.url, e.anon, { auth: { persistSession: false } }); };
export async function signedInClient(email: string, password: string) {
  const e = localEnv();
  const c = createClient(e.url, e.anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
```

**Step 3: Verify it refuses non-local + works local**
Run: `supabase start && pnpm exec tsx -e "import('./scripts/demo/lib.ts').then(m => console.log(m.localEnv().url))"`
Expected: `http://127.0.0.1:54321`.

**Step 4: Commit** — `feat(demo): local-only client helper for demo scripts`

---

### Task 2: `seed-demo.ts` — fixture per the run sheet

**Files:**
- Create: `scripts/demo/seed-demo.ts`
- Read first: `docs/plans/demo-run-sheet.md` (fixture spec) · `app/(public)/events/[id]/actions.ts` (registration row shape) · events/agenda schema in `supabase/migrations/` · locate the check-in window constant: `grep -rn "CHECKIN_OPEN" lib/ app/ --include=*.ts`.

**Spec (idempotent — every insert upsert/on-conflict-do-nothing):**
1. Operator: `auth.admin.createUser({ email: 'demo-staff@local.test', password: 'demo-staff-pw-2026', email_confirm: true })` + `staff` row (`role: 'eventar_staff'`, `full_name: 'Sarah Lee'`).
2. Practitioner: `demo-doctor@local.test` / same password pattern; `users.preferred_name = 'Dr. Karen Lau'`.
3. Event **"Clinical Update Seminar 2026"** as **draft** (Beat 2 demos the publish moment): default org, `created_by` = operator staff id, `start_time = now()+45min` (registration AND check-in windows both open mid-demo — run-sheet rule), `end_time = +4h`, venue "HKCEC — Room 2", capacity 180; 2 agenda blocks (keynote — Dr. Karen Lau, 60 min; case panel — 3 speakers, 75 min); 3 speakers.
4. 6 attendees as `registrations` rows via service role (`k.lau@demo.test` etc.); capture codes; print the demo attendee's prominently: `DEMO PASS CODE: XXXXXX`.
5. Print summary: event id, public path, pass code, both logins.

**Step 1:** Write it. **Step 2:** `supabase db reset && pnpm exec tsx scripts/demo/seed-demo.ts` → summary prints; run again → same summary, zero duplicate-key errors.
**Step 3:** Verify counts via `psqlLocal` or:
`docker exec supabase_db_Eventar psql -U postgres -d postgres -c "select count(*) from registrations;"` → 6.
**Step 4: Commit** — `feat(demo): seed-demo fixture (draft event + 6 attendees + operator)`

---

### Task 3: `reset-demo.ts`

**Files:** Create: `scripts/demo/reset-demo.ts`

**Spec:** local-only guard → delete demo rows in dependency order (checkins → survey_responses → registrations → agenda_blocks/speakers → events; `practitioner_licences` via the retained service-role DELETE; auth users via `auth.admin.deleteUser`) → re-run seed module → verify both chains via `psqlLocal('select count(*) from verify_audit_chain()')` and the ledger equivalent (**check both functions' actual return shapes in their migrations first — adjust assertions to reality, don't assume**) → print `RESET OK`.

**Steps:** write → run (expect `RESET OK`) → run twice more back-to-back (idempotency) → commit `feat(demo): reset-demo with chain verification`.

---

### Task 4: `render-emails.ts` — confirmation + reminder pass

**Files:**
- Create: `scripts/demo/render-emails.ts`
- Read first: `emails/confirmation.tsx` · `emails/reminder.tsx` (props incl. `checkinCode`, `qrCid`) · find the QR lib already in the repo: `grep -n "qrcode" package.json`.

**Spec:** render both with `@react-email/render` for the pre-registered attendee; reminder's `cid:` image swapped for a **data-URI QR** (browser can't show cid attachments); write to `scratch-demo/confirmation.html` + `scratch-demo/pass-reminder.html`; add `scratch-demo/` to `.gitignore`; print absolute paths. Links use `http://localhost:3100` (or `DEMO_SITE_URL`).

**Steps:** write → run → open both files: QR renders, manual code matches seed output → commit `feat(demo): email render script (pass QR as data-URI)`.

---

### Task 5: `ledger-demo.ts` — the trust-moment choreography

**Files:**
- Create: `scripts/demo/ledger-demo.ts`
- Read first: `supabase/migrations/*licence_mutations*.sql` (exact `declare_licence`/`verify_licence` signatures) · `*credit_ledger_entry_fn*.sql` + `*transfer_ref*.sql` (`record_credit_entry` params) · `*self_check_in*.sql` (code+ip params) · `tests/rls/` helpers for the session patterns.

**Spec (numbered checkpoints, narration-friendly; exit non-zero on any expectation miss):**
1. Practitioner session → `declare_licence` at HKCP (body id looked up by `short_name`).
2. Staff session → `verify_licence` → `LICENCE VERIFIED ✓`.
3. `anonClient().rpc('self_check_in', { p_code: <seed code>, p_ip: '203.0.113.10' })` → `CHECKED IN ✓`.
4. Service role → `record_credit_entry` (licence/user/body/event, 3.5 pts) → `CREDIT POSTED · chain #N · 9f2c…`.
5. **Grant layer:** service-role `update credit_ledger set points_value=99…` → expect permission error → `DIRECT EDIT BLOCKED (42501) ✓`.
6. **Chain layer:** `psqlLocal('update credit_ledger set points_value=99 where chain_seq=N')` (superuser exists only locally — that's the demo's point) → run ledger verifier → `TAMPER DETECTED at #N ✓` → remind operator to run `reset-demo`.

**Steps:** write → run on fresh seed → all checkpoints ✓ → `reset-demo` → commit `feat(demo): ledger trust-moment driver (post, block, detect)`.

---

### Task 6: Full-beat rehearsal verification (the demo's own backtest)

No new files. On a fresh stack: seed → start the worktree demo server → sign in via Mailpit magic link (proven flow) → **Beat 2** publish via UI → **Beat 3** register a 7th attendee via the public form (`email_log` row appears) → **Beat 4** self-check-in with the pass code (roster updates) → **Beat 5** `ledger-demo.ts`. Any mechanic that differs from `docs/plans/demo-run-sheet.md` gets folded back into the sheet in the same session (working-method §7). Commit sheet edits if any.

---

### Task 7: CI harness — local script

**Files:** Create: `scripts/ci/replay-and-verify.sh`

```bash
#!/usr/bin/env bash
# Replay-from-zero + chain/tamper gate. Throwaway local stack only.
set -euo pipefail
supabase db reset
q() { docker exec supabase_db_Eventar psql -U postgres -d postgres -tA -c "$1"; }
# 1) both chains verify clean on a fresh replay
[ "$(q 'select count(*) from verify_audit_chain()')" = "0" ] || { echo "audit chain dirty on fresh replay"; exit 1; }
[ "$(q 'select count(*) from verify_ledger_chain()')" = "0" ] || { echo "ledger chain dirty on fresh replay"; exit 1; }
# 2) two real writer events, tamper the first, expect detection
q "select write_audit_event('ci_probe','system',null,null,null,'{}'::jsonb)" >/dev/null
q "select write_audit_event('ci_probe','system',null,null,null,'{}'::jsonb)" >/dev/null
q "update audit_events set payload='{\"tampered\":true}'::jsonb where chain_seq=(select min(chain_seq) from audit_events where event_type='ci_probe')"
[ "$(q 'select count(*) from verify_audit_chain()')" -ge 1 ] || { echo "tamper NOT detected"; exit 1; }
echo "REPLAY + TAMPER GATE: PASS"
```

> **Before finalizing:** read the two verifiers' + `write_audit_event`'s real signatures/return shapes in their migrations and adjust the calls — verify against reality, never the plan's guess.

**Steps:** write → `chmod +x` → run twice (idempotent via reset) → commit `feat(ci): replay-from-zero + tamper detection gate`.

---

### Task 8: CI harness — GitHub Actions job

**Files:** Create: `.github/workflows/replay-verify.yml`

```yaml
name: replay-verify
on: [push, pull_request]
jobs:
  replay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: bash scripts/ci/replay-and-verify.sh
      - if: always()
        run: supabase stop
```

**Steps:** write → syntax-check (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/replay-verify.yml'))"`) → commit `feat(ci): Actions replay/tamper job` → note in PROJECT_STATE that first green run lands with Ivan's next push.

---

### Task 9: `set_staff_role()` — audited role mutation (LIVE Seoul migration)

**Files:**
- Create: `supabase/migrations/<apply-timestamp>_set_staff_role.sql`
- Create: `tests/rls/staff_role_mutations.rls.test.ts`
- Read first: `*staff_5role_widen*.sql` (role CHECK list) · `*init_audit_chain*.sql` (`write_audit_event` signature; audit-insert-LAST convention) · `*staff_org_scope*.sql` (staff columns) · Hard Rule 11 in `CLAUDE.md`.

**Design (decided):** column-level revoke — `revoke update (role) on public.staff from anon, authenticated, service_role;` — fixture INSERTs (which set roles at creation) keep working; role *changes* become definer-only. Gate: `app_private.require_active_staff('eventar_staff')` (platform staff only; org-admin delegation is a later decision). Audit event `staff_role_changed`, payload `{staff_id, old_role, new_role, organisation_id}`, emitted LAST. Explicit `revoke execute … from public, anon; grant execute … to authenticated` per Sprint-2 grant discipline; `search_path` pinned.

**Step 1 — failing tests first** (patterns from existing `tests/rls/` files):
1. service-role direct `update staff set role='body_admin'` → assert SQLSTATE **42501** specifically (RED today — proves the test bites).
2. `set_staff_role` as plain authenticated → 42501.
3. `set_staff_role` as eventar_staff → role changed + newest `audit_events` row is `staff_role_changed` with correct payload + `verify_audit_chain()` clean.
4. Regression guard: service-role INSERT of a staff row WITH a role still succeeds.

**Step 2:** `pnpm test:rls -- staff_role_mutations` → negatives RED.
**Step 3:** write the migration. **Step 4:** `supabase db push` → `supabase migration list` two-sided.
**Step 5:** suite green. **Step 6:** live ACL probe — `select proacl from pg_proc where proname='set_staff_role'` → no PUBLIC entry; `has_table_privilege` confirms the column revoke.
**Step 7: Commit** — `feat(auth): set_staff_role audited definer fn + column-level role revoke`

---

### Task 10: Residual grant hygiene + fail-loud fixture cleanup (LIVE migration + test refactor)

**Files:**
- Create: `supabase/migrations/<apply-timestamp>_grant_hygiene_residual_public.sql`
- Create: `tests/rls/function_grants.rls.test.ts`
- Modify: every `tests/rls/*.rls.test.ts` `afterAll` (≈14 files) · Create helper in `tests/helpers/` (`mustDelete` — throws on `.delete()` error)

**Migration spec:** for `public.self_check_in`, `app_private.require_active_staff`, `public.pseudonymise_user`: `revoke all … from public;` then re-grant exactly the intended roles (`self_check_in`: anon + authenticated — deliberately anon-open; `require_active_staff`: no PostgREST grants; `pseudonymise_user`: authenticated only). End with a DO block asserting the `has_function_privilege` matrix and RAISE-ing on drift (self-verifying migration).

**Test spec:** anon cannot execute `pseudonymise_user`; anon CAN execute `self_check_in` (invalid code → domain error, not permission error); `require_active_staff` not callable via PostgREST.

**Steps:** tests (meaningful negatives RED) → migration → push → `mustDelete` swapped into every `afterAll` → run `pnpm test:rls` ONCE → fix any orphan it surfaces (known: `dsr-manager@`, `markattended-*@rls-test.invalid`) → commit `fix(rls): close residual PUBLIC grants + fail-loud fixture cleanup`.

---

### Task 11: Collateral drafts (CPD Ledger naming — Q29)

**Files:** Create: `docs/collateral/one-pager.md` · `docs/collateral/trust-one-pager.md` · `docs/collateral/outreach-email.md`

**Spec:** One-pager — what it is (2 sentences), the loop (text diagram), the **CPD Ledger** integrity story (3 bullets: real-time first-party attendance vs self-report + 30-working-day third-party verification; append-only chain; body-verifiable), pilot structure, `**Pilot fee: [PRICE — Ivan]**`. Trust one-pager — chain design in lay terms, grant-posture summary, Q24 retention citation table, replay/CI posture, PDPO posture. Outreach — 5 sentences to a CPD/education-committee secretariat, demo ask, zero jargon. **The word "Passport" appears nowhere.**

**Steps:** write all three → check against Q29 + the competitor note's differentiation section → commit `docs(collateral): one-pagers + outreach (CPD Ledger naming)`.

---

### Task 12: Graph refresh

Run the standing `/graphify --update` flow (extraction + AST caches make it cheap; ~20 docs changed since 2026-07-08). **Abort-cleanly rule binds:** if any extraction chunk fails, no merge, no `save_manifest` (auto-memory `graphify-partial-update-manifest-trap`). Commit `chore(graph): refresh knowledge graph`.

---

### Task 13: Phase-completion protocol (three lenses + backtest)

1. **Dev-lens agent** — full diff Tasks 1–12; re-runs all gates independently; re-verifies the grant matrix against LIVE (`proacl` queries, never migration text).
2. **User-lens agent** (separate) — cold-start: fresh stack, seed, run every run-sheet beat as a stranger; read every error message; read the collateral as a body administrator.
3. **Security-reviewer agent** (`everything-claude-code:security-reviewer`) — Tasks 9–10 specifically.
4. **Backtest** — Tasks 6 + 7 are the backtest; re-run both after any fix.
Fix → re-run affected lens → only then Task 14.

### Task 14: Close-out

Update `docs/plans/PROJECT_STATE.md` (Milestone A shipped block) → `docs/plans/handoff_DDMMYYYY.md` → vault `CPD Roadmap` status line → tasks #1/#3–#7 completed. Commit `docs: Milestone A close-out`.

---

**Execution estimate:** T1–T6 ≈ 1.5–2 days · T7–T8 ≈ ½ day · T9–T10 ≈ 1–1.5 days (live-DB care) · T11–T12 ≈ ½ day · T13–T14 ≈ ½–1 day → **3–5 working days**, matching the program plan.
