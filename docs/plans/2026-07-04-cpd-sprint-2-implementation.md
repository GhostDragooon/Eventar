# CPD Sprint 2 — Security wrapper + audit path + attendee identity: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Spec (the WHY):** `docs/plans/2026-07-04-cpd-sprint-2-design.md`. This doc is the HOW. Where they ever disagree, the design wins on *intent*; this plan wins on *exact code/paths* (verified below).
> **Read before touching code:** `docs/plans/PROJECT_STATE.md`, `docs/plans/handoff_04072026.md`, `docs/architecture/BASELINE-DELTAS.md`, `AGENTS.md` (Next 16 breaking changes), and the CLAUDE.md hard rules.

**Goal:** Land the Sprint 2 backend security shell — a universal `withSecurity` Server-Action wrapper, an atomic audited-mutation path via `SECURITY DEFINER` functions, an authenticated deterministic abuse tier, attendee native email-OTP capability, and report-only CSP + security headers — with the frontend frozen and all 18 existing routes still working against the default org.

**Architecture:** Two layers. (1) **TS layer** — `withSecurity(handler, opts)` runs `requireStaff` (reconciled) → session/user rate-limit → Zod parse → handler → typed result carrying the Q18 RLS-silent-fail guard + `revalidatePath`. Actor identity is always derived server-side. (2) **DB layer** — compliance-subset mutations are `SECURITY DEFINER` functions shaped `gate → mutation → write_audit_event (LAST)`, atomic in one transaction, actor read from `auth.uid()`/`app_private.auth_email()` inside the function. The wrapper calls those functions as its handler through the request's *authenticated* Supabase client so `auth.uid()` resolves.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), TypeScript, Zod, Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs, auth-js `2.105.4`), Vitest (unit + env-gated real-DB integration via `pnpm test:rls`).

---

## Branch & commit discipline (read first)

- **Single `main` branch** (CLAUDE.md hard rule 6 + repo convention) — this plan does **not** use a worktree, contrary to the generic writing-plans default. Atomic commit per task, on `main`, unpushed (user pushes manually).
- **Dispatched subagents CAN commit in this session** (verified empirically across Tasks 0-2 — the older "Bash gate denies git commit for subagents" assumption did not hold here; corrected in memory `subagents-cannot-commit.md`). Subagents commit their own work per their task instructions; the controller still verifies the resulting commit (`git show <sha>`) as part of review.
- **Node PATH:** the shell defaults to node v14. Prefix every `pnpm`/`node` command with `/Users/ivan/.nvm/versions/node/v24.6.0/bin` on PATH (e.g. `PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH" pnpm exec tsc --noEmit`).
- **Migrations:** new files under `supabase/migrations/`, timestamp-prefixed `20260704140000_*` upward as a PLACEHOLDER naming convention only. **The Supabase MCP `apply_migration` tool has no version parameter — it assigns the version from server time at the moment it's called, ignoring your local filename.** Confirmed on Task 2: local file `20260704140000_require_active_staff.sql` was applied and recorded remotely as version `20260704162841` — a real, caught drift, fixed by `git mv`-ing to `20260704162841_require_active_staff.sql`. **Mandatory step for every remaining migration task:** immediately after `apply_migration`, call `list_migrations` and `git mv` the local file so its timestamp prefix exactly matches the remote-recorded version, in the same commit, before moving on. Backtest by querying rows back (Supabase MCP `execute_sql` / dashboard).
- **Frontend freeze:** no files under `app/**/page.tsx`, `components/**`, or any restyle. New code = `lib/`, `supabase/migrations/`, Server Actions, `next.config.ts`, one `/api` report-sink route, and tests only.

---

## Pinned P5 API-verification findings (resolved against real sources — do NOT re-derive from memory)

| # | Question | Verified answer (source) | Decision for this plan |
|---|---|---|---|
| P5.1 | Single-session-targeted revoke | auth-js `2.105.4` `GoTrueAdminApi.signOut(jwt, scope?)`, `scope ∈ {'global','local','others'}`. **No** by-session-ID revoke; **no** `admin.listUserSessions`/`deleteSession`. (`node_modules/.pnpm/@supabase+auth-js@2.105.4/.../GoTrueAdminApi.d.ts:63`, `types.d.ts:1676`) | §4 auto-revoke uses the design's named fallback: `admin.auth.admin.signOut(<offender's access token>, 'global')`. The abuse tier fires on the *current* caller hammering limits, so their access token is in-hand server-side. Audit records `subject_id = user_id`, `scope = 'global'`. |
| P5.2 | OTP admin `generateLink` shape | `generateLink({type,email,...})` → `{ data: { properties: { action_link, email_otp, hashed_token, verification_type, redirect_to }, user }, error }`. `type` for a new attendee = `'signup'` (creates the user); existing = `'magiclink'`. (`GoTrueAdminApi.d.ts:148`, `types.d.ts:791-817`) | Integration test uses `type:'signup'`, reads `data.properties.email_otp`, then `client.auth.verifyOtp({ email, token: email_otp, type: 'email' })`. Assert against this exact shape. No email is sent (sidesteps dev-sender ceiling per A4). |
| P5.3 | Next 16 headers mechanism | App Router supports `async headers()` in `next.config.ts` (`{source, headers:[{key,value}]}`). `proxy.ts` matcher is **staff-routes-only** (`proxy.ts:68-77`) — public routes under `app/(public)` are NOT matched. | **Security headers + report-only CSP go in `next.config.ts headers()` with `source: '/:path*'`**, NOT `proxy.ts`. This is the completed P5 verification the design asked for; it overrides the design's tentative "default to proxy.ts" because proxy.ts cannot cover public routes. Surfaced per Rule 7. |
| P5.4 | Consent version strings | `docs/legal/terms-and-conditions.md` frontmatter `version: "0.1 (draft)"`; `docs/legal/privacy-policy.md` `version: "0.2 (draft — non-solicitor cleanup pass)"`. `consent_records.consent_type` enum allows `terms_of_service`, `privacy_policy`. | Add `lib/legalVersions.ts` exporting stable identifiers `{ terms_of_service: 'tos-0.1-draft', privacy_policy: 'pp-0.2-draft' }` (coupled work per P5.4). Signup consent-grant writes these. A comment ties each to its `docs/legal/*` frontmatter so they track together. |

---

## Preflight decisions to confirm with the user before Task 1

1. **CSP report sink route** lives at `app/api/security/csp-report/route.ts`. This touches CLAUDE.md's "`/api/*` reserved for Phase 9 cron + external integration" rule. The design (§5, Catch 3) explicitly calls for "a route handler logging violations, UUIDs only" and flags it for confirmation ("veto → wire Sentry into Sprint 2 instead"). **Confirm: minimal internal no-PII sink route, or wire Sentry now?** Default assumed: internal sink route.
2. **Staff backfill** (Task 1) will read the live `staff` table to confirm both existing rows are `status='active'` before the tightened gate ships. Read-only; no confirmation needed, but noted.

---

## Task ordering (dependency-driven, backend-risk-first)

```
0  Preflight: gates baseline + staff backfill check + legalVersions.ts
1  requireStaff reconciliation            (§1/§4 depend on it)
2  app_private.require_active_staff gate   (R-D; every audited fn calls it)
3  D1: revoke write_audit_event grant + negative test
4  Rate-limit extension: session/user keyed
5  withSecurity wrapper (TS)
6  Audited definer fn: grant_consent / withdraw_consent (self-actor pattern)
7  Audited definer fn: transition_dsr (staff-actor pattern)
8  Audited definer fn: record_session_revocation (system-actor) + §4 abuse tier
9  Attendee OTP capability + post-signup consent (§3)
10 Convert self-check-in → definer fn (P3 behaviour-preserving)
11 Convert staff-scan check-in → definer fn (P3)
12 Convert event publish → definer fn (P3, emits event_published)
13 §5: security headers + report-only CSP in next.config.ts + report sink route
14 §6 exit gate: extend test:rls, burst throughput, static gates, 3-check protocol
15 Docs: DEFERRED.md / BASELINE-DELTAS / handoff — AFTER checks pass
```

---

### Task 0: Preflight — baselines, staff backfill, legal versions

**Files:**
- Create: `lib/legalVersions.ts`
- Test: `lib/legalVersions.test.ts`

**Step 1: Capture the green baseline** (so any later red is attributable).

Run:
```bash
PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH" \
  pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run
```
Expected: `tsc` clean · `eslint` 0 errors (5 pre-existing unrelated warnings) · vitest **438 passed | 17 skipped**. Record these numbers; the exit gate re-asserts deltas from here.

**Step 2: Staff backfill check** (must pass before Task 1 tightens the gate).

Run via Supabase MCP `execute_sql` (or dashboard SQL):
```sql
select id, email, role, status from public.staff order by created_at;
```
Expected: every row `status = 'active'`. If any row is not active, STOP and ask the user — the reconciled gate would lock them out.

**Step 3: Write the failing test for legal versions.**

```ts
// lib/legalVersions.test.ts
import { describe, it, expect } from 'vitest';
import { LEGAL_VERSIONS, CONSENT_TYPES } from './legalVersions';

describe('legalVersions', () => {
  it('pins a stable identifier per required consent type', () => {
    expect(LEGAL_VERSIONS.terms_of_service).toBe('tos-0.1-draft');
    expect(LEGAL_VERSIONS.privacy_policy).toBe('pp-0.2-draft');
  });
  it('CONSENT_TYPES matches the DB check-constraint subset used at signup', () => {
    expect(CONSENT_TYPES).toEqual(['terms_of_service', 'privacy_policy']);
  });
});
```

**Step 4: Run it — expect FAIL** (`Cannot find module './legalVersions'`).

Run: `PATH=... pnpm exec vitest run lib/legalVersions.test.ts`

**Step 5: Implement.**

```ts
// lib/legalVersions.ts
// Canonical consent version identifiers written to public.consent_records.version.
// Coupled to docs/legal/* frontmatter `version:` fields (P5.4) — update BOTH together.
//   terms_of_service  -> docs/legal/terms-and-conditions.md  version "0.1 (draft)"
//   privacy_policy    -> docs/legal/privacy-policy.md         version "0.2 (draft ...)"
export const CONSENT_TYPES = ['terms_of_service', 'privacy_policy'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const LEGAL_VERSIONS: Record<ConsentType, string> = {
  terms_of_service: 'tos-0.1-draft',
  privacy_policy: 'pp-0.2-draft',
};
```

**Step 6: Run test — expect PASS.**

**Step 7: Commit.**
```bash
git add lib/legalVersions.ts lib/legalVersions.test.ts
git commit -m "chore(cpd-s2): pin legal consent versions + capture Sprint 2 baseline"
```

---

### Task 1: `requireStaff` reconciliation — SPLIT per execution-time decision (2026-07-04)

> **Deviation from the original design, confirmed with the user during execution.** An Explore sweep found that widening `Staff.role` to include `'eventar_staff'` breaks `tsc --noEmit` at 9 staff-page call sites, because `components/shell/StaffShell.tsx:17` and `app/settings/SettingsClient.tsx:36` each declare their own local prop type `role: 'organizer' | 'manager'` and every page passes `{ email: staff.email, role: staff.role }` straight through. Fixing that means touching 2 files under `components/` and `app/settings/` — reserved for backend/migrations/Server-Actions/tests during the frontend freeze.
>
> **Verified before accepting the split:** grepped every `.role === '...'` comparison and every consumer of `lib/auth.ts`'s `Staff`/`requireStaff` repo-wide. The three `staff.role === 'manager'` checks (`app/(public)/events/[id]/page.tsx:65`, `app/events/[id]/details/page.tsx:90`, `app/events/[id]/details/emailActions.ts:66`) are non-exhaustive `||` fallbacks (owner-or-manager) — unaffected either way. Nothing in this plan's Task list branches on the literal string `'eventar_staff'` in TypeScript. The DB-side gate (`app_private.require_active_staff`, Task 2) reads `staff.role` directly via SQL and is unaffected by the TS type — the `staff.role` check constraint has allowed `'eventar_staff'` since Sprint 1's `20260704130200_staff_org_scope.sql`. So deferring the TS union costs Sprint 2 nothing functionally; it applies the same "zero consumer this sprint" logic the design already used to defer the whole MFA workstream (P1).
>
> **Resolution:** Task 1 splits into **1a** (ships in Sprint 2, below) and **1b** (deferred to Sprint 3, alongside the 5-role migration + frontend unfreeze — same commit that will need to touch `StaffShell.tsx`/`SettingsClient.tsx` anyway).

#### Task 1a: gate `status = 'active'` (ships now)

**Files:**
- Modify: `lib/auth.ts`
- Test: `lib/auth.test.ts` (extend)

**Step 1: Write failing tests** — extend `lib/auth.test.ts`. Mirror the existing mock style in that file (read it first). Add cases:

```ts
// active staff still passes (role type unchanged this task — Staff.role stays 'organizer' | 'manager')
it('accepts an active staff row', async () => {
  const client = mockClientReturningStaff({
    id: 's1', email: 'ops@x.io', role: 'manager', full_name: 'Ops', status: 'active',
  });
  const staff = await requireStaff(client);
  expect(staff.role).toBe('manager');
});

// non-active staff is rejected even if the email matches
it('rejects a suspended staff row', async () => {
  const client = mockClientReturningStaffOrNull(/* status filter yields null */ null);
  await expect(requireStaff(client)).rejects.toBeInstanceOf(NotAuthorizedError);
});
```
> Implementation detail: the reconciled query adds `.eq('status', 'active')`, so a suspended row is filtered by the DB → `maybeSingle()` returns `null` → existing `if (!staff) throw` path fires. Model the mock accordingly (return `null` when the status filter would exclude).

**Step 2: Run — expect FAIL** (no `status` filter yet, so the suspended-row test fails).

Run: `PATH=... pnpm exec vitest run lib/auth.test.ts`

**Step 3: Implement** in `lib/auth.ts` — **`Staff.role` stays exactly `'organizer' | 'manager'` this task** (1b, the widen to add `'eventar_staff'`, is deferred — see banner above). Only the query gains the status filter:
```ts
  const { data: staff } = await supabase
    .from('staff')
    .select('id, email, role, full_name')
    .eq('email', email)
    .eq('status', 'active')          // reconciled: suspended/removed lose access immediately
    .maybeSingle();
```
> Do NOT touch the `Staff` type in this task. `status` is a filter only, not selected into the returned object.

**Step 4: Run tests — expect PASS.** Also run the full unit suite + typecheck (should be a no-op diff on the type-consumer side since the union didn't change):
`PATH=... pnpm exec vitest run && pnpm exec tsc --noEmit`

**Step 5: Backtest** — via curl against `localhost:3000` (dev server always running) using the Eventar backtest recipe: confirm an authenticated staff request to a gated action still succeeds. **Live-DB backfill check already run during planning:** `select id, email, role, status from public.staff` returned exactly **one** row (`ahf.ivan@gmail.com`, `role='manager'`, `status='active'`) — not two as `PROJECT_STATE.md` assumed; the single row is active, so the tightened gate locks nobody out.

> **Carry-forward note:** `proxy.ts` (Layer 1) still selects `staff` by email only, no status filter. `requireStaff` (Layer 2) now gates status, so a suspended user passes the matcher but is denied at the action — defense-in-depth holds. Tightening proxy.ts to `status='active'` is a 1-line optional hardening; do it in Task 13 alongside the headers change if cheap, else leave (Layer 2 already blocks).

**Step 6: Commit.**
```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat(cpd-s2): reconcile requireStaff — active-status gate (role-union widen deferred to Sprint 3, see plan Task 1 banner)"
```

#### Task 1b: widen `Staff.role` to include `'eventar_staff'` — DEFERRED to Sprint 3

Do not implement in Sprint 2. Tracked for Sprint 3 alongside the 5-role enum migration and the frontend-freeze lift, bundled with the required `StaffShell.tsx`/`SettingsClient.tsx` prop-type updates (and the 9 call sites' `{ role: staff.role }` construction) as one coordinated change. Record this explicitly in Task 15's DEFERRED.md update.

---

### Task 2: shared DB gate `app_private.require_active_staff(variadic p_roles text[])`

> **Correction confirmed during execution (2026-07-05):** empirically verified via a direct PostgREST call (`curl .../rest/v1/rpc/require_active_staff` → `404 PGRST202`, error text literally "Searched for the function **public**.require_active_staff") that PostgREST only ever searches the `public` schema for RPC — `app_private.*` functions are categorically unreachable via `.rpc()`, by design, regardless of auth or the function's existence. So Step 3 below (calling it directly from a test client) can never pass and is **not** implemented as written. The plan's own footnote pointed at the wrong task for the transitive fallback, too: **Task 6 does not call `require_active_staff`** (its functions gate on `auth.uid()` directly, self-actor pattern) — **Task 7's `transition_dsr` is the actual first real consumer** (`docs/plans/2026-07-04-cpd-sprint-2-implementation.md` line ~609). Task 2 ships the migration only; behavioral regression coverage (non-staff caller of `transition_dsr` → 42501, active staff → succeeds) is Task 7's job and IS the real test of this gate. Task 2 instead does a one-time manual SQL-level backtest (`set_config('request.jwt.claims', ...)` + direct call via `execute_sql`) to prove the gate logic before Task 7 depends on it — documented in the commit, not committed as an automated test file.

**Files:**
- Create: `supabase/migrations/20260704140000_require_active_staff.sql`
- Test: none committed this task (see correction above — automated coverage lands in Task 7)

**Step 1: Write the migration.**

```sql
-- CPD Sprint 2 / §1 R-D — one shared audited-mutation gate.
-- Returns the acting staff row (so audited definer functions get
-- actor.role / actor.organisation_id for free); raises 42501 otherwise.
-- Composed from app_private.auth_email(); mirrors pseudonymise_user's
-- in-function gate so the gate is defined exactly once.
create function app_private.require_active_staff(variadic p_roles text[])
returns public.staff
  language plpgsql stable security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  select * into actor
  from public.staff
  where email = app_private.auth_email()
    and status = 'active'
    and (p_roles is null or array_length(p_roles, 1) is null or role = any(p_roles))
  order by created_at
  limit 1;

  if actor.id is null then
    raise exception 'require_active_staff: caller is not active staff in %', p_roles
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

grant execute on function app_private.require_active_staff(text[])
  to authenticated, service_role;
```
> `variadic p_roles text[]` lets callers write `require_active_staff('manager','eventar_staff')`. The `array_length ... is null` branch makes a no-arg call "any active staff."

**Step 2: Apply** via Supabase MCP `apply_migration` (name `require_active_staff`) or CLI `db push`.

**Step 3: Write the failing integration test** (env-gated, joins the existing `tests/rls` suite). Follow `tests/rls/foundations.rls.test.ts` structure and `tests/helpers/clients.ts` (`admin`, `createTestUser`, `deleteTestUser`).

```ts
// tests/rls/require_active_staff.rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const RUN = process.env.RLS_TESTS === '1';
const d = RUN ? describe : describe.skip;

d('app_private.require_active_staff', () => {
  let outsider: TestUser;
  beforeAll(async () => { outsider = await createTestUser('gate-outsider'); });
  afterAll(async () => { await deleteTestUser(outsider); });

  it('non-staff caller gets 42501', async () => {
    const { error } = await outsider.client.rpc('require_active_staff', { p_roles: ['manager'] });
    expect(error?.code).toBe('42501'); // insufficient_privilege surfaced by the raise
  });
});
```
> Note: `require_active_staff` is in schema `app_private`, not exposed via PostgREST RPC by default. If the test cannot reach it directly, assert the gate transitively through a Task-6 audited function that calls it (a non-staff caller of `grant_consent`-style staff functions gets 42501). Prefer the transitive assertion if `app_private` RPCs 404 — record which path was used in the commit message.

**Step 4: Run — expect FAIL** before apply, PASS after: `PATH=... pnpm test:rls`

**Step 5: Commit.**
```bash
git add supabase/migrations/20260704140000_require_active_staff.sql tests/rls/require_active_staff.rls.test.ts
git commit -m "feat(cpd-s2): shared require_active_staff gate (R-D) for audited definer fns"
```

---

### Task 3: D1 — revoke `write_audit_event` EXECUTE from `authenticated`

**Files:**
- Create: `supabase/migrations/20260704140100_restrict_write_audit_event.sql`
- Test: add a **negative** case to `tests/audit/chain.test.ts` (or new `tests/rls/audit_grant.rls.test.ts`)

**Why this is safe (pin in the migration comment):** every audited path calls `write_audit_event` from inside a `SECURITY DEFINER` function owned by `postgres` (`pseudonymise_user` today; the Task 6–12 functions next). Such functions execute as `postgres`, which holds `audit_writer` membership (`grant audit_writer to postgres` in `20260704130400`) and therefore inherits EXECUTE on `write_audit_event`. Revoking the `authenticated` grant only removes the *direct* PostgREST call path — the forgery vector from carried-forward item #1.

**Step 1: Write the migration.**
```sql
-- CPD Sprint 2 / D1 — close the audit-authenticity gap (Sprint 1 carried-
-- forward #1). Direct PostgREST calls by authenticated users could forge a
-- correctly-chained row with false actor claims. Audited mutations reach
-- write_audit_event only via SECURITY DEFINER functions owned by postgres
-- (which inherits audit_writer's EXECUTE), so this revoke breaks only the
-- forgery path, not any legitimate caller.
revoke execute on function
  public.write_audit_event(text, uuid, text, uuid, text, uuid, jsonb)
  from authenticated;
-- service_role retains EXECUTE (test harness + service-context paths).
```

**Step 2: Apply** (MCP `apply_migration` / `db push`).

**Step 3: Write the failing negative test** — proves the grant is gone:
```ts
// a logged-in user calling write_audit_event directly must be denied
it('authenticated cannot call write_audit_event directly (D1)', async () => {
  const u = await createTestUser('audit-forger');
  const { error } = await u.client.rpc('write_audit_event', {
    p_event_type: 'forged', p_actor_role: 'manager',
  });
  expect(error).toBeTruthy();
  // PostgREST surfaces a function-permission denial (42501 / "permission denied for function")
  expect(`${error?.code}${error?.message}`).toMatch(/42501|permission denied/i);
  await deleteTestUser(u);
});
```

**Step 4: Run — expect FAIL before apply** (call currently succeeds), **PASS after**.
Run: `PATH=... pnpm test:rls`
> If run before apply returns success (row written), delete that stray audit row via admin after the test, or run this test only post-apply. Note in the test file that it asserts a post-D1 invariant.

**Step 5: Regression** — confirm `pseudonymise_user` still writes its audit row (it calls `write_audit_event` as a postgres-owned definer). Quick MCP check: call `pseudonymise_user` as staff in a scratch fixture, then `select event_type from audit_events order by chain_seq desc limit 1;` → `user_pseudonymised`. (Or rely on the existing Sprint 1 pseudonymise test if present.)

**Step 6: Commit.**
```bash
git add supabase/migrations/20260704140100_restrict_write_audit_event.sql tests/audit/chain.test.ts
git commit -m "feat(cpd-s2): D1 — revoke write_audit_event EXECUTE from authenticated (+ negative test)"
```

---

### Task 4: rate-limit extension — session/user-keyed

**Files:**
- Modify: `lib/rateLimit.ts`
- Test: `lib/rateLimit.test.ts` (extend)

**Step 1: Write failing unit tests** for the new pure/thin helpers. The existing suite tests `parseClientIp` / `windowStartMs`; add key-composition tests that don't hit the DB (mock `rateLimit` or assert the composed key). Prefer extracting a pure `composeKey(scope, discriminator)` if the file doesn't already inline it, and test:
```ts
it('rateLimitBySession composes scope:session key', () => {
  expect(composeRateKey('sessionAbuse', 'sess_abc')).toBe('sessionAbuse:sess_abc');
});
it('rateLimitByUser composes scope:user key', () => {
  expect(composeRateKey('sessionAbuse', 'user_123')).toBe('sessionAbuse:user_123');
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement** — add to `lib/rateLimit.ts`, reusing the existing `rateLimit(key, opts)` core (no new external service — hard rule 7; same Postgres `rate_limit_check` RPC):
```ts
/** Compose a rate-limit key. Exported for unit testing. */
export function composeRateKey(scope: string, discriminator: string): string {
  return `${scope}:${discriminator}`;
}

/**
 * Rate-limit by the caller's Supabase session (access-token-derived id).
 * Used by the §4 authenticated abuse tier. `sessionId` is derived server-side
 * from the authenticated session — never from client input.
 */
export async function rateLimitBySession(
  scope: string, sessionId: string, opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return rateLimit(composeRateKey(scope, sessionId), opts);
}

/** Rate-limit by user id (broader than session — all of a user's activity). */
export async function rateLimitByUser(
  scope: string, userId: string, opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return rateLimit(composeRateKey(scope, userId), opts);
}
```
> These reuse the exact fixed-window fail-open semantics documented in the file. The abuse-tier "3 hits in 60 min → revoke" (Task 8) reads the returned `remaining`/`allowed` to detect the 3rd breach.

**Step 4: Run tests — expect PASS.**

**Step 5: Commit.**
```bash
git add lib/rateLimit.ts lib/rateLimit.test.ts
git commit -m "feat(cpd-s2): session/user-keyed rate limiting (§4 abuse tier substrate)"
```

---

### Task 5: `withSecurity` wrapper (TS, universal)

**Files:**
- Create: `lib/withSecurity.ts`
- Test: `lib/withSecurity.test.ts`

**Design contract (from §1):** `withSecurity(handler, opts)` runs, in order:
`requireStaff()` → per-session/user rate-limit → Zod `opts.input.parse(raw)` → `handler(parsed, ctx)` → wrap result. `ctx` carries the reconciled `staff` (actor identity, server-derived) + the request's authenticated `supabaseServer()` client. On RLS-silent-fail (handler signals `null`/zero-rows), return a typed error (Q18 guard). On success, run `opts.revalidate` paths. Errors are fail-visible (Rule 12): `NotAuthorizedError` → typed `{ error: 'not_authorized' }`; rate-limit → `{ error: 'rate_limited', retryAfterMs }`; Zod → `{ error: 'invalid_input', issues }`.

**Step 1: Write failing tests** (unit, mock `requireStaff`, the rate-limit helper, and `revalidatePath`):
```ts
// lib/withSecurity.test.ts — representative cases
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// mock ./auth and ./rateLimit and ./supabase/server as needed

describe('withSecurity', () => {
  afterEach(() => vi.clearAllMocks());

  it('rejects unauthenticated callers before running the handler', async () => { /* requireStaff throws NotAuthorizedError -> { error: 'not_authorized' }, handler never called */ });
  it('rejects when rate-limited, without running the handler', async () => { /* limiter returns allowed:false -> { error:'rate_limited', retryAfterMs } */ });
  it('rejects invalid input via the Zod schema', async () => { /* parse fail -> { error:'invalid_input' } */ });
  it('runs the handler with server-derived actor + revalidates on success', async () => { /* asserts handler received ctx.staff.id from requireStaff, revalidatePath called for each opts.revalidate */ });
  it('surfaces an RLS-silent-fail from the handler as a typed error (Q18)', async () => { /* handler returns the null-sentinel -> { error: 'not_found_or_forbidden' } */ });
});
```

**Step 2: Run — expect FAIL** (`Cannot find module './withSecurity'`).

**Step 3: Implement** `lib/withSecurity.ts`:
```ts
import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireStaff, NotAuthorizedError, type Staff } from './auth';
import { supabaseServer } from './supabase/server';
import { rateLimitBySession } from './rateLimit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SecurityCtx = { staff: Staff; supabase: SupabaseClient };

/** Sentinel a handler returns to signal an RLS-silently-filtered mutation (Q18). */
export const RLS_SILENT_FAIL = Symbol('RLS_SILENT_FAIL');

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'not_authorized' | 'rate_limited' | 'invalid_input' | 'not_found_or_forbidden'; retryAfterMs?: number; issues?: z.ZodIssue[] };

export function withSecurity<I, T>(
  handler: (input: I, ctx: SecurityCtx) => Promise<T | typeof RLS_SILENT_FAIL>,
  opts: {
    input: z.ZodType<I>;
    rateLimit: { scope: string; windowMs: number; max: number };
    revalidate?: string[];
  },
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    // 1. Auth — actor derived server-side, never from `raw`.
    let staff: Staff;
    try {
      staff = await requireStaff();
    } catch (e) {
      if (e instanceof NotAuthorizedError) return { ok: false, error: 'not_authorized' };
      throw e; // unexpected — fail visibly
    }
    const supabase = await supabaseServer();

    // 2. Rate limit, keyed to the authenticated session (server-derived).
    const { data: sess } = await supabase.auth.getSession();
    const sessionId = sess.session?.access_token ?? staff.id; // fallback: user id
    const rl = await rateLimitBySession(opts.rateLimit.scope, sessionId, {
      windowMs: opts.rateLimit.windowMs, max: opts.rateLimit.max,
    });
    if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

    // 3. Validate input.
    const parsed = opts.input.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

    // 4. Run handler.
    const result = await handler(parsed.data, { staff, supabase });
    if (result === RLS_SILENT_FAIL) return { ok: false, error: 'not_found_or_forbidden' };

    // 5. Revalidate + return.
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    return { ok: true, data: result as T };
  };
}
```
> **Do NOT retrofit existing shipped actions onto this wrapper in Sprint 2 unless a task says so.** The wrapper is the substrate; Tasks 10–12 convert the check-in/publish surfaces (they become audited definer calls invoked *through* `supabaseServer()`, not the admin client, so `auth.uid()` resolves inside the function). Routine event/registration/survey mutations stay as-is (design: "wrapper only" is the target end-state, not a Sprint-2 mass migration — frozen-frontend + surgical-change rules).

**Step 4: Run tests — expect PASS.** Then `tsc --noEmit`.

**Step 5: Commit.**
```bash
git add lib/withSecurity.ts lib/withSecurity.test.ts
git commit -m "feat(cpd-s2): withSecurity wrapper — auth + session rate-limit + Zod + Q18 guard"
```

---

### Task 6: audited definer fn — `grant_consent` / `withdraw_consent` (self-actor pattern)

**Files:**
- Create: `supabase/migrations/20260704140200_consent_audited_fns.sql`
- Test: `tests/rls/consent_audited.rls.test.ts`

**Canonical self-actor shape** (actor = the signing-up user, NOT staff; gate = "must be authenticated"):
```sql
-- CPD Sprint 2 / §1+§3 R-C — consent capture as an audited, atomic Server
-- Action (NOT in handle_new_user: the audit write holds the chain advisory
-- lock to commit; embedding it in the signup trigger serialises signups —
-- see design P2). Actor is the user themselves.
create function public.grant_consent(p_consent_type text, p_version text)
returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'grant_consent: no authenticated user' using errcode = '42501';
  end if;
  if p_consent_type not in ('terms_of_service','privacy_policy','ai_processing_notice','marketing') then
    raise exception 'grant_consent: unknown consent_type %', p_consent_type;
  end if;
  if p_version is null or trim(p_version) = '' then
    raise exception 'grant_consent: version is required';
  end if;

  insert into public.consent_records (user_id, consent_type, version)
  values (v_uid, p_consent_type, p_version)
  returning id into v_id;

  -- LAST statement: audit write (same transaction). Anonymous-actor columns
  -- are nullable; here actor IS the user.
  perform public.write_audit_event(
    'consent_granted', v_uid, 'self', null, 'consent', v_id,
    jsonb_build_object('consent_type', p_consent_type, 'version', p_version)
  );
  return v_id;
end;
$$;
grant execute on function public.grant_consent(text, text) to authenticated, service_role;

create function public.withdraw_consent(p_consent_id uuid)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'withdraw_consent: no authenticated user' using errcode = '42501';
  end if;
  update public.consent_records
     set withdrawn_at = now()
   where id = p_consent_id and user_id = v_uid and withdrawn_at is null;
  if not found then
    raise exception 'withdraw_consent: consent % not found for caller or already withdrawn', p_consent_id;
  end if;
  perform public.write_audit_event(
    'consent_withdrawn', v_uid, 'self', null, 'consent', p_consent_id, '{}'::jsonb
  );
end;
$$;
grant execute on function public.withdraw_consent(uuid) to authenticated, service_role;
```

**Step 1–4 (TDD):** write failing integration test → apply migration → test passes. Test (real DB):
```ts
// gate: unauthenticated (service-role rpc with no jwt) — assert self-scoping instead:
it('grant_consent writes a consent row + audit event for the caller', async () => {
  const u = await createTestUser('consent-self');
  const { data: id, error } = await u.client.rpc('grant_consent', {
    p_consent_type: 'terms_of_service', p_version: 'tos-0.1-draft',
  });
  expect(error).toBeNull();
  // row exists under the caller
  const { data: rows } = await u.client.from('consent_records').select('id').eq('id', id);
  expect(rows?.length).toBe(1);
  // audit event appended (read via service-role admin — authenticated cannot select all)
  const { data: ev } = await admin.from('audit_events')
    .select('event_type, subject_id').eq('subject_id', id).eq('event_type', 'consent_granted');
  expect(ev?.length).toBe(1);
  await deleteTestUser(u);
});
```
Run: `PATH=... pnpm test:rls`

**Step 5: Commit.**
```bash
git add supabase/migrations/20260704140200_consent_audited_fns.sql tests/rls/consent_audited.rls.test.ts
git commit -m "feat(cpd-s2): audited grant_consent/withdraw_consent (self-actor definer shape)"
```

---

### Task 7: audited definer fn — `transition_dsr` (staff-actor pattern)

**Files:**
- Create: `supabase/migrations/20260704140300_dsr_audited_fn.sql`
- Test: `tests/rls/dsr_audited.rls.test.ts`

**Canonical staff-actor shape** (uses the Task-2 shared gate):
```sql
-- CPD Sprint 2 / §1 — DSR lifecycle transitions are staff-gated + audited.
-- Self-submission stays on the existing RLS insert policy (subject's own
-- request, lower tamper-sensitivity); staff status transitions are the
-- compliance-sensitive surface and become audited here.
create function public.transition_dsr(p_id uuid, p_status text, p_notes text default null)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  actor := app_private.require_active_staff('manager','eventar_staff');  -- gate: 42501 otherwise
  if p_status not in ('pending','in_progress','completed','rejected','escalated') then
    raise exception 'transition_dsr: invalid status %', p_status;
  end if;

  update public.data_subject_requests
     set status = p_status,
         resolver_staff_id = actor.id,
         resolution_notes = coalesce(p_notes, resolution_notes),
         resolved_at = case when p_status in ('completed','rejected') then now() else resolved_at end
   where id = p_id;
  if not found then
    raise exception 'transition_dsr: request % not found', p_id;
  end if;

  perform public.write_audit_event(
    'dsr_transitioned', auth.uid(), actor.role, actor.organisation_id,
    'data_subject_request', p_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;
grant execute on function public.transition_dsr(uuid, text, text) to authenticated, service_role;
```

**TDD:** failing test → apply → pass. Test: non-staff caller → 42501; active manager transitions a fixture DSR and appends `dsr_transitioned`. Fixture DSR row created via `admin`.

**Commit:**
```bash
git add supabase/migrations/20260704140300_dsr_audited_fn.sql tests/rls/dsr_audited.rls.test.ts
git commit -m "feat(cpd-s2): audited transition_dsr (staff-actor definer shape via shared gate)"
```

---

### Task 8: audited fn `record_session_revocation` + §4 authenticated abuse tier

**Files:**
- Create: `supabase/migrations/20260704140400_session_revocation_audit.sql`
- Create: `lib/abuseTier.ts` (TS orchestration — measurement → auto-act)
- Test: `tests/rls/session_revocation.rls.test.ts`, `lib/abuseTier.test.ts`

**DB side — audit-only definer (system actor):**
```sql
-- CPD Sprint 2 / §4 — record an automatic session revocation. The signOut
-- itself happens in the app layer (admin API — no SQL equivalent); this
-- function only appends the tamper-evident audit fact, LAST + atomic.
create function public.record_session_revocation(
  p_user_id uuid, p_reason text, p_scope text default 'global'
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_id uuid;
begin
  select public.write_audit_event(
    'session_revoked', null, 'system', null, 'user', p_user_id,
    jsonb_build_object('reason', p_reason, 'scope', p_scope)
  ) into v_id;
  return v_id;
end;
$$;
grant execute on function public.record_session_revocation(uuid, text, text)
  to authenticated, service_role;
```
> `actor_user_id = null`, `actor_role = 'system'` — this is the anonymous/system-actor path the design (§3) confirms is already supported by the nullable actor columns. No signature change to `write_audit_event`.

**TS side — the measurement→act policy (deterministic code, NOT model — Rule 5):**
```ts
// lib/abuseTier.ts
import 'server-only';
import { supabaseAdmin } from './supabase/admin';
import { rateLimitBySession } from './rateLimit';

const ABUSE_SCOPE = 'sessionAbuse';
const ABUSE_WINDOW_MS = 60 * 60 * 1000; // 60 min
const ABUSE_MAX = 3;                    // 3 hits in the window → revoke

/**
 * Deterministic abuse tier (§4): 3 session rate-limit hits within 60 min →
 * automatic global session revoke of the offending session's user. A pure
 * measurement (rate-limit counter) driving an automatic action — no
 * inference, no IP enforcement on authenticated routes (pivot §6).
 *
 * Returns whether a revoke was triggered. Fails visibly (Rule 12).
 */
export async function recordAbuseHitAndMaybeRevoke(args: {
  sessionAccessToken: string; userId: string;
}): Promise<{ revoked: boolean }> {
  const rl = await rateLimitBySession(ABUSE_SCOPE, args.sessionAccessToken, {
    windowMs: ABUSE_WINDOW_MS, max: ABUSE_MAX,
  });
  if (rl.allowed) return { revoked: false };

  const admin = supabaseAdmin();
  // P5.1: no by-session-id revoke in auth-js 2.105.4 — global revoke of the
  // offending caller's own token is the verified fallback.
  const { error: soErr } = await admin.auth.admin.signOut(args.sessionAccessToken, 'global');
  if (soErr) console.error('[abuseTier] signOut failed', { code: soErr.code });

  const { error: auditErr } = await admin.rpc('record_session_revocation', {
    p_user_id: args.userId, p_reason: '3_session_rate_limit_hits_60min', p_scope: 'global',
  });
  if (auditErr) console.error('[abuseTier] audit write failed', { code: auditErr.code });

  return { revoked: true };
}
```
> Wiring this into a live caller (which authenticated Server Action feeds `recordAbuseHitAndMaybeRevoke`) is deliberately **not** a Sprint-2 frontend change. The design's §4 target consumer is future authenticated routes; Sprint 2 ships the capability + its backtest (Task 14). Document that the wire-up lands with the first authenticated attendee mutation surface (post-freeze).

**TDD:** `lib/abuseTier.test.ts` mocks `rateLimitBySession` + `supabaseAdmin` — assert: 1st/2nd hit → no revoke; 3rd (limiter `allowed:false`) → `signOut` + `record_session_revocation` both called with the right args. Integration test asserts `record_session_revocation` appends a `session_revoked` row and the chain stays valid (`verify_audit_chain`).

**Commit:**
```bash
git add supabase/migrations/20260704140400_session_revocation_audit.sql lib/abuseTier.ts lib/abuseTier.test.ts tests/rls/session_revocation.rls.test.ts
git commit -m "feat(cpd-s2): §4 abuse tier — 3-in-60 session revoke + audited session_revoked"
```

---

### Task 9: attendee native email-OTP capability + post-signup consent (§3)

**Files:**
- Create: `lib/attendeeAuth.ts` (thin `signInWithOtp` capability wrapper — server-side)
- Test: `tests/rls/attendee_otp.rls.test.ts` (integration, admin `generateLink` per A4/P5.2)

> **No frontend, no wallet UI, no registration linking (D2).** This ships the capability + the signup→consent audited path, API-testable only. The Sprint-1 `handle_new_user` trigger already auto-populates `public.users` on signup — do NOT add consent capture into that trigger (R-C / P2). Consent is a separate post-signup call to `grant_consent` (Task 6).

**Step 1: Implement the capability wrapper** (uses the anon browser-config client server-side; native email OTP):
```ts
// lib/attendeeAuth.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Request a native email OTP for an attendee (accounts + sessions).
 * Capability only — no registration linking (D2). Real email delivery waits
 * for the Resend cutover (D3); until then dev-sender / admin generateLink. */
export async function requestAttendeeOtp(email: string): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { error: error.message };
  return { ok: true };
}
```

**Step 2: Integration test (A4 — admin `generateLink`, no email sent, hosted project):**
```ts
it('attendee OTP capability: generateLink -> verifyOtp mints a session + populates public.users', async () => {
  const email = `otp-attendee-${Date.now()}@rls-test.invalid`;
  // A4: admin generateLink returns the token in-band (P5.2 shape) — no dev-sender hit.
  const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'signup', email });
  expect(glErr).toBeNull();
  const otp = gl!.properties!.email_otp;          // P5.2 pinned shape
  expect(typeof otp).toBe('string');

  const client = createAnonClient();               // helper: anon client, no persist
  const { data: v, error: vErr } = await client.auth.verifyOtp({ email, token: otp, type: 'email' });
  expect(vErr).toBeNull();
  expect(v.session).toBeTruthy();

  // handle_new_user mirror populated public.users
  const uid = v.user!.id;
  const { data: mirror } = await admin.from('users').select('id').eq('id', uid);
  expect(mirror?.length).toBe(1);

  // consent-grant exercises the §1 definer pattern against a real session (§3 rationale)
  const { error: cErr } = await client.rpc('grant_consent', {
    p_consent_type: 'terms_of_service', p_version: 'tos-0.1-draft',
  });
  expect(cErr).toBeNull();

  await admin.auth.admin.deleteUser(uid);          // cascades public.users + consent
});
```
> Add a `createAnonClient()` helper to `tests/helpers/clients.ts` if not present (mirror the anon client already built inside `createTestUser`). Follow `afterEach(cleanup)` conventions only for RTL — these are non-RTL integration tests.

**Step 3–4:** run `pnpm test:rls`, expect PASS.

**Step 5: Commit.**
```bash
git add lib/attendeeAuth.ts tests/rls/attendee_otp.rls.test.ts tests/helpers/clients.ts
git commit -m "feat(cpd-s2): §3 attendee email-OTP capability + post-signup audited consent"
```

---

### Task 10: convert self-check-in → audited definer fn (P3 behaviour-preserving)

**Files:**
- Create: `supabase/migrations/20260704140500_self_check_in_fn.sql`
- Modify: `app/(public)/checkin/confirm/actions.ts`
- Test: `tests/rls/self_check_in.rls.test.ts` + keep any existing action test green

> **P3 protocol — capture behaviour FIRST.** Before rewriting, run the existing self-check-in curl backtest (Eventar backtest recipe) and record: valid code → attended; re-tap → "already checked in"; deleted → "no longer valid". These must still hold after conversion. The one **intended** behaviour change: rate-limit key moves per-IP → **per-event** (design §4 venue-NAT counterexample). Name it in the commit.

**DB definer function** (self/anonymous actor; per-event rate-limit inside; audit LAST):
```sql
-- CPD Sprint 2 / A1+P3 — self check-in becomes atomic + audited. Actor is
-- anonymous (actor_user_id null, actor_role 'self_check_in'); tamper-evidence
-- is on the check-in FACT. Per-event rate-limit (not per-IP) sized for real
-- door-open burst — see design §4 / P2 (200 attendees >> a 10/min cap).
create function public.self_check_in(p_code text)
returns table (result text, event_id uuid)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_event_id uuid;
  v_reg_id   uuid;
  v_status   text;
  v_rl       jsonb;
  v_win      timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
begin
  -- resolve registration + event (definer bypasses RLS)
  select id, event_id, status into v_reg_id, v_event_id, v_status
  from public.registrations where registration_code = p_code;
  if v_reg_id is null then
    result := 'invalid'; event_id := null; return next; return;
  end if;

  -- per-event rate limit (slow work BEFORE audit-write, P2). Sized > burst.
  v_rl := public.rate_limit_check('selfCheckIn:' || v_event_id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then
    result := 'rate_limited'; event_id := v_event_id; return next; return;
  end if;

  if v_status = 'attended' then
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = 'qr'
   where id = v_reg_id and status <> 'attended';
  if not found then
    -- lost the idempotency race between read and update
    result := 'already'; event_id := v_event_id; return next; return;
  end if;

  -- LAST: audit the check-in fact (anonymous actor).
  perform public.write_audit_event(
    'attendee_checked_in', null, 'self_check_in',
    (select organisation_id from public.events where id = v_event_id),
    'registration', v_reg_id,
    jsonb_build_object('event_id', v_event_id, 'method', 'qr')
  );
  result := 'ok'; event_id := v_event_id; return next;
end;
$$;
grant execute on function public.self_check_in(text) to anon, authenticated, service_role;
```
> `rate_limit_check` is granted only to `service_role`, but this definer is owned by `postgres` (function owner ⇒ has EXECUTE) so the internal call succeeds. Grant `self_check_in` to `anon` because the public pass is unauthenticated. `600/min/event` is sized well above a realistic 200-attendee door burst so the Task 14 throughput test measures **lock latency, not throttling** (P2); it is the single knob to tune if the burst test shows throttling.

**TS action** — replace the admin-update body with a single RPC call (via admin client — anon context, `auth.uid()` null is correct here), map results to the existing user-facing strings (behaviour-preserving), keep `revalidatePath`:
```ts
export async function selfCheckIn(code: string): Promise<{ ok: true; eventId: string } | { error: string }> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('self_check_in', { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;   // set-returning fn
  switch (row?.result) {
    case 'ok': revalidatePath('/checkin/confirm'); return { ok: true, eventId: row.event_id };
    case 'already': return { error: "You're already checked in." };
    case 'rate_limited': return { error: 'Too many attempts. Please try again in a moment.' };
    default: return { error: 'This registration is no longer valid.' };
  }
}
```
> The former two-branch "no longer valid" vs "already checked in" distinction is preserved: `invalid` → no-longer-valid; `already` → already-checked-in. Remove now-unused imports (`rateLimitByIp` from this file). Keep `isValidRegistrationCode`.

**TDD + P3 backtest:** integration test on the real DB — 200 rows / one event all reach `ok`; a 201st beyond the cap → `rate_limited`; re-tap → `already`; unknown code → `invalid`; `verify_audit_chain` stays all-valid. Re-run the pre-capture curl script; assert identical user-facing outcomes except the intended per-event limit.

**Commit:**
```bash
git add supabase/migrations/20260704140500_self_check_in_fn.sql "app/(public)/checkin/confirm/actions.ts" tests/rls/self_check_in.rls.test.ts
git commit -m "feat(cpd-s2): convert self-check-in to audited definer fn; per-IP→per-event limit (intended)"
```

---

### Task 11: convert staff-scan check-in → audited definer fn (P3)

**Files:**
- Create: `supabase/migrations/20260704140600_mark_attended_fn.sql`
- Modify: `app/events/[id]/checkin/actions.ts`
- Test: `tests/rls/mark_attended.rls.test.ts`

> **P3 capture first:** owner marks attended → ok; non-owner (manager/other organiser) → "Code not recognised" (info-hiding preserved); re-mark → "Already attended". These must survive.

**DB definer** (staff-actor via shared gate; owner-exclusivity preserved by an explicit owner check inside — the definer bypasses RLS, so A5's in-function gate is load-bearing):
```sql
create function public.mark_attended(p_code text, p_method text)
returns table (result text, registration_id uuid, full_name text, event_id uuid, event_title text)
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor    public.staff%rowtype;
  v_reg    public.registrations%rowtype;
  v_event  public.events%rowtype;
  v_win    timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_rl     jsonb;
begin
  actor := app_private.require_active_staff('organizer','manager','eventar_staff');
  if p_method not in ('qr','manual') then raise exception 'mark_attended: bad method'; end if;

  select * into v_reg from public.registrations where registration_code = p_code;
  if v_reg.id is null then result := 'not_recognised'; return next; return; end if;

  select * into v_event from public.events where id = v_reg.event_id;
  -- owner-exclusive check-in (Q19 / 2026-06-02): non-owner sees not_recognised
  if v_event.created_by <> actor.id then result := 'not_recognised'; return next; return; end if;

  v_rl := public.rate_limit_check('markAttended:' || v_event.id::text, v_win, 600);
  if (v_rl->>'allowed')::boolean is false then result := 'rate_limited'; return next; return; end if;

  if v_reg.status = 'attended' then
    result := 'already'; registration_id := v_reg.id; return next; return;
  end if;

  update public.registrations
     set status = 'attended', check_in_at = now(), check_in_method = p_method
   where id = v_reg.id and status <> 'attended';
  if not found then result := 'already'; registration_id := v_reg.id; return next; return; end if;

  perform public.write_audit_event(
    'attendee_checked_in', auth.uid(), actor.role, actor.organisation_id,
    'registration', v_reg.id,
    jsonb_build_object('event_id', v_event.id, 'method', p_method, 'via', 'staff_scan')
  );
  result := 'ok'; registration_id := v_reg.id; full_name := v_reg.full_name;
  event_id := v_event.id; event_title := v_event.title; return next;
end;
$$;
grant execute on function public.mark_attended(text, text) to authenticated, service_role;
```
> **Call this via `supabaseServer()` (authenticated client), NOT admin** — the gate reads `auth_email()`/`auth.uid()` from the JWT. Map results to the existing action's return contract. Preserve the raw-ISO `alreadyAttendedAt` by returning `check_in_at` in the `already` branch if the client formats it (add a column to the result table if needed; else keep the action's fallback lookup for that one field via `supabaseServer()`).

**TDD + backtest:** owner ok; non-owner not_recognised; re-mark already; chain valid. Commit:
```bash
git add supabase/migrations/20260704140600_mark_attended_fn.sql "app/events/[id]/checkin/actions.ts" tests/rls/mark_attended.rls.test.ts
git commit -m "feat(cpd-s2): convert staff-scan check-in to audited definer fn (owner-exclusive preserved)"
```

---

### Task 12: convert event publish → audited definer fn (P3, emits `event_published`)

**Files:**
- Create: `supabase/migrations/20260704140700_publish_event_fn.sql`
- Modify: `app/events/[id]/edit/actions.ts` (`publishEvent`)
- Test: `tests/rls/publish_event.rls.test.ts`

> **P3 capture first:** owner publishes draft → status `published`; the existing `.select().maybeSingle()` zero-row guard fires for non-owners. The A1 forward-note: the organiser-attested accreditation payload layers onto this same `event_published` event in Sprint 3 — so include a minimal, forward-compatible payload now.

**DB definer:**
```sql
create function public.publish_event(p_event_id uuid)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.require_active_staff('organizer','manager','eventar_staff');
  update public.events
     set status = 'published'
   where id = p_event_id and created_by = actor.id   -- owner-exclusive
   returning organisation_id into v_org;
  if not found then
    raise exception 'publish_event: event % not found or not owned by caller', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')  -- A1 forward-compatible
  );
end;
$$;
grant execute on function public.publish_event(uuid) to authenticated, service_role;
```
> If `events` has no `published_at` column, add it in this migration (`add column if not exists published_at timestamptz`) and set it in the UPDATE — the P3 checklist asserts `published_at` written. Verify against the live schema (`list_tables`) before writing; if the design's `published_at` doesn't exist yet, adding it is coupled work here.

**TS action** — `publishEvent(id)` calls `supabase.rpc('publish_event', { p_event_id: id })` via `supabaseServer()`, keeps the three `revalidatePath` calls, surfaces the 42501/RLS case as the existing error. **Confirm `attestation_status`/`published_at` are acceptable additions against the live `events` schema before writing.**

**Commit:**
```bash
git add supabase/migrations/20260704140700_publish_event_fn.sql "app/events/[id]/edit/actions.ts" tests/rls/publish_event.rls.test.ts
git commit -m "feat(cpd-s2): convert event publish to audited definer fn (emits event_published)"
```

---

### Task 13: §5 — security headers + report-only CSP + no-PII report sink

**Files:**
- Modify: `next.config.ts`
- Create: `app/api/security/csp-report/route.ts` (pending preflight confirmation — see Preflight #1)
- Test: `app/api/security/csp-report/route.test.ts`; a headers assertion in the exit-gate backtest

**Step 1: Add global headers in `next.config.ts`** (P5.3 — `next.config.ts headers()`, `source: '/:path*'`, covers public + staff routes; `proxy.ts` cannot):
```ts
import type { NextConfig } from "next";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",          // report-only: records violations without breaking inline scripts (nonce boundary deferred to enforcement cutover, Sprint 3/4)
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "report-uri /api/security/csp-report",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
      ],
    }];
  },
};
export default nextConfig;
```
> `camera=(self)` — the check-in scanner uses the camera; do NOT set `camera=()`. Verify against the html5-qrcode usage. `frame-ancestors 'none'` is the CSP form of anti-clickjacking (preferred over `X-Frame-Options` in modern browsers). **Report-only only** — no enforcement this sprint (design §5).

**Step 2: Report sink route** — no-PII, UUID-only, unauthenticated ingest:
```ts
// app/api/security/csp-report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

/** Minimal internal CSP violation sink (design §5 Catch 3). No PII: log the
 * violated-directive + blocked-uri ORIGIN only + a random correlation id.
 * Switches to Sentry when Sentry lands. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = body?.['csp-report'] ?? body;
    let blockedOrigin = 'unknown';
    try { blockedOrigin = new URL(r?.['blocked-uri'] ?? '').origin || 'inline-or-eval'; } catch { blockedOrigin = 'inline-or-eval'; }
    console.warn('[csp-report]', {
      id: randomUUID(),
      violatedDirective: r?.['violated-directive'] ?? r?.['effective-directive'] ?? 'unknown',
      blockedOrigin,   // origin only — never full URL (may carry query PII)
    });
  } catch { /* malformed report — ignore, do not 500 */ }
  return new NextResponse(null, { status: 204 });
}
```
> This adds one `/api/*` route (Preflight #1). Route count 18 → 19.

**Step 3: Test** the route (unit): a well-formed report → 204 + a `console.warn` with no full URL; a malformed body → still 204. A headers integration assertion belongs in Task 14's backtest (curl `-I http://localhost:3000/` and grep the 5 headers + `Content-Security-Policy-Report-Only`).

**Step 4: (Optional) tighten `proxy.ts`** to `status='active'` if trivially safe (see Task 1 carry-forward). Skip if any doubt — Layer 2 already gates.

**Step 5: Commit.**
```bash
git add next.config.ts app/api/security/csp-report/route.ts app/api/security/csp-report/route.test.ts
git commit -m "feat(cpd-s2): §5 global security headers + report-only CSP + no-PII report sink"
```

---

### Task 14: §6 exit gate — extend test:rls, burst throughput, static gates, three-check protocol

**Files:**
- Create: `tests/rls/checkin_throughput.rls.test.ts` (200-concurrent burst)
- Modify: `docs/plans/PROJECT_STATE.md` invariants (route count 18→19; note new integration tests)

**Step 1: Burst throughput backtest (P2 / §6).** 200 concurrent self-check-ins on one event; measure P50/P95/P99; **failure criterion P99 > 2 s**. Reuse the Sprint-1 lesson: the local Node/undici layer chokes on a literal 200-wide `Promise.all` — **batch into concurrent chunks of ~20** (empirically reliable; 30 already showed a failure). The batching is a client-side harness constraint, not a throughput cap — it still exercises overlapping transactions contending the audit-chain advisory lock.
```ts
// shape: seed 1 event + 200 registrations via admin; fire self_check_in for
// all 200 in chunks of 20; collect per-call latency; assert every call ok;
// compute percentiles; expect p99 < 2000ms; then verify_audit_chain all-valid.
```
Run: `PATH=... pnpm test:rls` (run **once per session** — back-to-back runs exhaust local sockets and produce spurious failures per the Sprint-1 operational caveat; re-run once after a pause before assuming a regression).

**Step 2: Full static gates** (the phase-completion "static gates"):
```bash
PATH="/Users/ivan/.nvm/versions/node/v24.6.0/bin:$PATH" \
  pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```
Expected: all green; `next build` shows **19 routes** (18 + `/api/security/csp-report`); vitest count = 438 + new unit tests (legalVersions, withSecurity, abuseTier, csp-report, rateLimit/auth additions), 17→N skipped integration tests unchanged under plain `pnpm test`.

**Step 3: Full RLS + integration suite** — `pnpm test:rls` green, covering: D1 negative (Task 3), each audited definer end-to-end (6,7,8,10,11,12), OTP via generateLink (9), session-revoke abuse (8), per-surface behaviour-preserving backtests (10–12), burst throughput (this task).

**Step 4: Existing-routes backtest** — curl the 18 pre-existing routes on `localhost:3000` against the default org; manager reads unchanged (7 events / 63 registrations baseline from Sprint 1); headers present on a public route (`curl -I`).

**Step 5: THREE-CHECK PHASE-COMPLETION PROTOCOL** (CLAUDE.md — mandatory, two SEPARATE agents + backtest, BEFORE any handoff doc):
- **Dev-lens agent** (code-reviewer or general-purpose): reads the full diff + changed files, re-runs gates independently, verifies against the *live DB* (not this plan): every audited definer ends with the audit write LAST; `require_active_staff` gate present in each; `search_path` pinned on every new definer; D1 grant actually revoked; no `write_audit_event` reachable from `authenticated`; no side effects between audit-write and commit (P2); per-event (not per-IP) keys confirmed. Check CLAUDE.md hard-rule compliance (audit-insert-last, service-role only in admin.ts, three-layer validation/auth, no PII in logs — inspect the csp-report sink).
- **User-lens agent** (SEPARATE agent): cold-start the attendee OTP happy path + the obvious wrong thing (bad OTP, replayed code, non-owner check-in), read every error string for honesty/leakage; confirm the frozen frontend is genuinely unaffected (curl `/`, `/login`, `/events`, `/dashboard` behave exactly as Sprint 1).
- **Backtest**: already executed above against real Supabase — cite the row-back evidence.

Fix whatever they find; re-run any gate touching the affected surface.

**Step 6: Commit** (tests + state invariants only; docs in Task 15):
```bash
git add tests/rls/checkin_throughput.rls.test.ts docs/plans/PROJECT_STATE.md
git commit -m "test(cpd-s2): exit-gate suite — burst throughput + full audited-path integration"
```

---

### Task 15: Docs — DEFERRED / BASELINE-DELTAS / handoff (AFTER the three checks pass)

**Files:**
- Modify: `docs/DEFERRED.md` (Turnstile + strike ladder, Resend OTP cutover, historical registration linking, MFA workstream → Sprint 4)
- Modify: `docs/architecture/BASELINE-DELTAS.md` (record Findings 1 & 2 resolution state; D1 landed; per-IP→per-event change)
- Modify: `docs/plans/PROJECT_STATE.md` (rotate ACTIVE PHASE; Sprint 2 SHIPPED block with commit table)
- Create: `docs/plans/handoff_04072026_s2.md` (retrospective; defects found during execution; carried-forward for Sprint 3 — including the P2 shared-vs-separate ledger-lock decision and the abuse-tier live-caller wire-up)

> These are the "summary docs" the phase-completion protocol says come AFTER the three checks — not before. Do not write a "Sprint 2 shipped" claim until Task 14 is green.

**Commit:**
```bash
git add docs/DEFERRED.md docs/architecture/BASELINE-DELTAS.md docs/plans/PROJECT_STATE.md docs/plans/handoff_04072026_s2.md
git commit -m "docs(cpd-s2): Sprint 2 close-out — handoff, deferred tracker, baseline-deltas"
```

---

## Cross-cutting invariants (hold across every task)

- **Audit-insert-last:** every audited definer function emits `write_audit_event` as the LAST statement before return; all slow work (gate, lookups, rate-limit) precedes the mutation; the mutation is second-to-last; no side effects between audit-write and commit (P2).
- **Actor server-side only:** never accept `actor_user_id`/`actor_role` from client input; read from `auth.uid()`/`auth_email()` inside the function or `requireStaff` in the wrapper.
- **Definer functions:** `security definer` + `set search_path = public, pg_temp` on every one (Sprint-1 lesson).
- **Call convention:** staff-actor audited fns via `supabaseServer()` (JWT context resolves the gate); anonymous fns (`self_check_in`) via `supabaseAdmin()`; §4 revoke via `supabaseAdmin()`.
- **Fail visibly (Rule 12):** every zero-row mutation, rate-limit breach, and gate denial returns/raises an explicit signal — never a silent success.
- **Frozen frontend:** no `page.tsx`/component/restyle changes. Surgical, in-scope edits only.
- **Run `pnpm test:rls` once per session**; re-run once after a pause before treating a failure as real (Sprint-1 socket caveat).

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-07-04-cpd-sprint-2-implementation.md`. Two execution options:

1. **Subagent-Driven (this session)** — REQUIRED SUB-SKILL `superpowers:subagent-driven-development`. Fresh subagent per task, code review between tasks, controller (me) commits each task (subagents can't commit). Fast iteration; I hold context.
2. **Parallel Session (separate)** — REQUIRED SUB-SKILL `superpowers:executing-plans` in a new session. Batch execution with checkpoints.

**Before either:** confirm Preflight #1 (CSP report sink route vs Sentry). Which approach?
