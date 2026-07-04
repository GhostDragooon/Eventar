# CPD Sprint 2 — Design: Security wrapper + audit path + attendee identity

_Status: **scope locked** 2026-07-04 (three decisions + §1 keystone review, five amendments, P1–P5 resolution). This doc is the **WHY**; the task-by-task **HOW** is the separate executable plan (`superpowers:writing-plans` output). Backend only — frontend frozen._

> Read first: `docs/plans/PROJECT_STATE.md`, `docs/plans/handoff_04072026.md`, `docs/architecture/BASELINE-DELTAS.md` (§1/§2/§3/§4 + Sprint 2 amendments), vault `20 — Roadmap/CPD Roadmap — Backend First.md` §Sprint 2.

---

## Locked scope

Backend only; existing 18 routes keep working against the default org.

1. **§1 — `withSecurity` wrapper + audit path** (keystone)
2. **§3 — Attendee native email OTP** (retained as a documented YAGNI exception — see §3)
3. **§4 — Authenticated deterministic abuse tier**
4. **§5 — `proxy.ts` security headers + CSP report-only**
5. **§6 — Exit gate**
6. **`requireStaff` reconciliation** (extracted from the former §2 staff-auth workstream, retained standalone because §1/§4 depend on it)

**Moved to Sprint 4 (P1 — YAGNI):** the staff MFA workstream in full — password + TOTP backend on `auth.mfa`, `app_private.mfa_is_fresh()` helper, wrapper freshness-gate wiring to real callers, enrolment UI, TOTP-mandatory enforcement. It had **zero consumer** in Sprint 2 (magic link stays the live login; TOTP isn't enforced until Sprint 4; there's no enrolment UI in Sprint 2 either, so "build early to avoid UI churn" bought nothing).

**Deferred (see `docs/DEFERRED.md`):** Turnstile + escalating unauth strike ladder; Resend OTP-email cutover; historical registration linking.

---

## Decisions locked

**D1 — Restrict the `write_audit_event` grant.** Revoke `EXECUTE` from `authenticated`; keep `service_role` + the definer-owner path. Audited mutations become `SECURITY DEFINER` DB functions ending in the audit write (the `pseudonymise_user` shape); no client ever calls `write_audit_event` directly. Closes the audit-**authenticity** gap carried from Sprint 1.

**D2 — Defer historical registration linking.** No consumer until the wallet unfreeze (post-M4); ratified by the identity model — the credit ledger keys on `licence_id`, not the account↔registration link. Avoids shared-email over-linking / changed-email under-linking entirely. Sprint 2 still ships the attendee OTP **capability**.

**D3 — Defer Turnstile + Resend OTP cutover.** Keeps Sprint 2 self-contained and fully locally backtestable. Interim residual = ADR Finding 2 (below) + `docs/DEFERRED.md`.

---

## §1 — `withSecurity` wrapper + audit path (keystone) [LOCKED]

Two responsibilities at two layers.

**Security (TS layer, universal).** `withSecurity(handler, opts)` — every mutation Server Action passes through:

`requireStaff` (reconciled — `status='active'` + `eventar_staff`-aware) → per-session/user rate limit → Zod parse → run `handler` → typed result carrying the existing Q18 RLS-silent-fail guard + `revalidatePath`. Actor identity is derived server-side; client input never sets actor fields.

> The optional **MFA-freshness gate** is a **Sprint 4** addition to this pipeline (moved with the rest of the MFA workstream). The Sprint 2 wrapper has no freshness gate.

**Audit atomicity (DB layer, compliance subset only).** *"Audit-insert-last, same transaction"* **cannot** be satisfied by an app-level "mutate, then call `write_audit_event`" — those are two separate PostgREST transactions (ADR Finding 1). So audited mutations follow the `pseudonymise_user` shape: a `SECURITY DEFINER` function doing **gate → mutation → `write_audit_event` (last)**, atomically, with actor read from `auth.uid()` / `app_private.auth_email()`. The wrapper calls that function as its `handler`.

**Rejected alternatives:** *every mutation → definer RPC* (forces all logic into plpgsql for no benefit); *wrapper writes audit in TS after the mutation* (separate transactions ⇒ crash orphans mutation from audit; breaks the hard rule; forces keeping the `authenticated` grant).

**Audited subset (Sprint 2):** DSR lifecycle · erasure completion around `pseudonymise_user` (session revoke + `auth.users` email scrub via admin API) · consent grant/withdraw · session revoke (from §4) · **check-in (both paths)** · **event publication**.  Routine event/registration/survey mutations = wrapper only.

### Amendments folded in

- **A1 — audited subset widened.** *Check-in* is the credit ledger's raw material → tamper-evident from the moment recorded: staff-scan (actor = staff) + self-check-in (`actor_user_id = null`, `actor_role = 'self_check_in'` marker; tamper-evidence is on the check-in *fact*). *Event publication* emits `event_published` now; the Pillar-1 organiser-attested accreditation payload layers onto that same event in Sprint 3 when `event_accreditations` exists.
- **A2 → `requireStaff` reconciliation, standalone deliverable** (details below).
- **A5 — RLS-guard scope.** Audited definer functions (owned by `postgres`) **bypass RLS by design** — which is *why* the in-function gate (`raise 42501` + `if not found then raise`) is load-bearing. Routine mutations = wrapper + RLS + Q18 guard; audited mutations = wrapper + in-function gate + in-function fail-visible; the RLS guard is **deliberately absent** on audited paths (no RLS to silently fail). Documented so a reviewer reads the absence as intent.

### Reminder-driven refinements

- **R-C — consent capture is a post-signup audited Server Action, NOT in `handle_new_user`.** The audit write holds `pg_advisory_xact_lock` until commit; embedding it in the signup trigger would serialize every signup on the audit-chain lock (see P2). Also keeps `handle_new_user` lean.
- **R-D — one shared gate: `app_private.require_active_staff(variadic p_roles text[])`** (raises `42501`, composed from `auth_email()` / `is_*` helpers). Every new audited definer function calls it, so the gate is defined once. Function templating/codegen deferred to Sprint 3/4.

---

## `requireStaff` reconciliation (standalone, retained from §2)

`lib/auth.ts` still types `role: 'organizer' | 'manager'` and ignores `status`; §1 (wrapper) and §4 (staff-scan check-in) both depend on it, so it stays in Sprint 2 even though the rest of §2 moved.

- Widen the role type to today's real DB values: `'organizer' | 'manager' | 'eventar_staff'` (DB is US-spelled `organizer`; the `organiser`/5-role enum is a Sprint 3 migration).
- Gate `status = 'active'`.
- Forward-compatible with the Sprint 3 expansion.
- **Backfill check first:** verify both existing staff rows are `status='active'` before the tightened gate ships — no current staff locked out.

---

## §3 — Attendee native email OTP  [YAGNI exception]

- Supabase Auth native email OTP (`signInWithOtp`), accounts + sessions. The Sprint-1 `users` mirror + `handle_new_user` trigger auto-populate `public.users` on signup.
- **Consent at signup** → a post-signup **consent-grant audited mutation** (R-C) writing `consent_records` (terms_of_service, privacy_policy).

**Why retained despite no Sprint 2 consumer (documented exception, not a precedent):**
- Auth is foundational infrastructure — painful to retrofit later.
- Consent-write on signup naturally exercises the §1 definer-function pattern.
- §4's auto session-revoke needs real sessions to test against.

The exception is scoped to attendee OTP only. No other workstream failing the same YAGNI test is retained on this basis.

- **No registration linking** (D2), **no wallet UI** (frozen) — capability-building, API-testable only.
- **Anonymous-actor already supported** — `write_audit_event`'s actor params + the `audit_events` actor columns are already nullable (verified against the Sprint-1 migration); no signature change needed for self-check-in / anonymous consent paths.
- **Test mechanism (A4):** OTP via GoTrue **admin `generateLink`** (token in-band, no email sent) against the hosted project — sidesteps the dev-sender rate ceiling. Inbucket is local-stack only. Real-user OTP + email-template work + zh-HK variant wait for the Resend cutover; **no pilot cohort against the dev sender.**

---

## §4 — Authenticated deterministic abuse tier

- Extend `lib/rateLimit.ts` from IP-keyed to **session/user-keyed** (`rateLimitBySession` / `rateLimitByUser`) on the existing Postgres `rate_limit_check` pattern — **no new external service** (hard rule 7).
- **3 session rate-limit hits in 60 min → automatic session revoke** — a *measurement* → auto-act (§4). Admin session revoke; emits `session_revoked` (audited).
- **Check-in keyed per-event, not per-IP** (§4 venue-NAT counterexample). **The per-event threshold must be sized for real door-open burst** (200 attendees ≫ a 10/min limit) — set consistently with the P2 burst test so the test measures lock latency, not throttling.
- **No IP enforcement on authenticated routes, ever** (§4 / pivot §6). (Self-check-in is unauthenticated; per-event replaces its former per-IP limit — an intentional behaviour change, see P3.)

---

## §5 — `proxy.ts` security headers + CSP (report-only)

- Global security headers (HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) + **CSP in report-only mode** (`Content-Security-Policy-Report-Only`) with the target policy. Verify the Next 16 mechanism (`next.config.ts headers()` vs `proxy.ts`) before writing (AGENTS.md); default to `proxy.ts` as single source of truth.
- **Report sink (Catch 3):** Sentry is not wired in this repo yet, so `report-to`/`report-uri` targets a **minimal internal no-PII sink** (route handler logging violations, UUIDs only) for the Sprint 2–3 collection window; the target switches to Sentry when Sentry lands. *(Flagged for confirmation; veto → wire Sentry into Sprint 2 instead.)*
- **Enforcement mode gated on a clean real-user violation window** — ships Sprint 3/4, not Sprint 2. The **nonce boundary decision** (proxy nonce generation vs static headers) defers to enforcement cutover; report-only records violations without breaking inline scripts, so it need not be decided now.
- The unauth **Turnstile + escalating IP strike ladder is deferred** (D3 / ADR Finding 2).

---

## P2 — Global audit-chain lock discipline (canonical)

> The audit chain serialises all audit writes through a single global advisory lock held for transaction duration. Definer functions that write audit events must complete all slow work before the audit-write statement and produce no side effects between the audit-write and commit. Check-in throughput is validated at exit gate against 200 concurrent self-check-ins on one event.

Concrete rules for every audited definer function:
1. All slow work (session resolution, registration/event lookup, permission check) completes **before** the audit-write statement.
2. The mutation itself is the **second-to-last** statement, immediately before the audit-write.
3. **No side effects** (external calls, notifications, email, analytics) between the audit-write and commit — async work is queued (`pg_notify` / scheduled job) and runs post-commit.

**Sprint 3 forward-flag:** the credit ledger must decide whether ledger writes share the audit-chain lock or use a separately-anchored chain. Recorded as a Sprint 3 opening-scope entry item; not a Sprint 2 decision.

---

## P3 — Behaviour-preserving TDD on rewritten surfaces

Check-in (both paths) and event-publish are **shipped** surfaces being converted to definer functions. Each conversion:
1. Capture current behaviour (curl script + manager-read backtest) **before** rewrite.
2. Rewrite to the definer-function shape.
3. Re-run the same tests — any delta must be **intentional and named** in the commit/PR.

**Per-surface backtest checklist:**
- **Self-check-in:** 200 attendees / one IP / one event all succeed (per-event, not per-IP) · 200 from one IP across multiple events → limit fires per-event · anonymous-actor path preserved · chain integrity maintained.
- **Staff-scan check-in:** `requireStaff` (reconciled) · per-event limit · actor from `auth.uid()` server-side · chain integrity.
- **Event publish:** organiser via `requireStaff` · `attestation_status = 'organiser_attested'` at launch · `published_at` written · chain integrity.
- The **per-IP → per-event** rate-limit change is validated as **intended** behaviour, documented in the migration commit + ADR — not a silent regression.

---

## P5 — API-verification checklist (execute during writing-plans, per AGENTS.md)

Each verified against real docs or a working repro, not memory; results pinned into the executable plan.
- [ ] **Single-session-targeted revoke** — `supabase.auth.admin` API to revoke one session by ID without terminating the user's other sessions. Fallback: `signOut(userId, 'global')` if targeted revoke is unsupported.
- [ ] **OTP admin `generateLink` response shape** — exact shape + applicable `type` for the attendee OTP flow; integration test asserts against the pinned shape.
- [ ] **Next 16 headers mechanism** — `next.config.ts headers()` availability; `proxy.ts` request API (`request.headers.get('x-forwarded-for')`, not `request.ip`). Default: all headers in `proxy.ts`.
- [ ] **Consent version strings** — current `docs/legal/*` filenames + the canonical version identifiers signup writes to `consent_records`. If versioning isn't in the doc filenames yet, add it in Sprint 2 as coupled work.

---

## ADR findings (also in `BASELINE-DELTAS.md` Sprint 2 amendments)

**Finding 1 — strengthens §3.4 (Residual 4a):**
> Every PostgREST RPC executes as its own transaction. An application-layer wrapper calling `write_audit_event` after a mutation therefore runs the audit write in a separate transaction from the mutation. This violates the "audit-insert-last, same transaction" rule at the layer we thought would enforce it. Audited mutations must be `SECURITY DEFINER` database functions ending with the audit write. `pseudonymise_user` is the canonical shape.

**Finding 2 — §4 Turnstile-window residual:**
> During the Turnstile deferral window, unauthenticated endpoints have flat per-IP rate limits only. No escalating block, no bot challenge, no strike ladder. A persistent attacker can hammer `/login` and `/otp/*` at just-under-rate-limit indefinitely. Acceptable only while the platform is not publicly exposed. Public exposure gates on Turnstile provisioning.

---

## Forward constraints (NOT Sprint 2 scope — held per Rule 13)

- **Business model:** practitioner-first passport; organisers first paying layer; institutions later; advertising rejected. ⇒ check-in + evidence generation are load-bearing (organisers pay for them) — why they're audited.
- **Identity model:** self-declared `practitioner_licences`, one `is_primary`, ledger keys on `licence_id`. (Sprint 3.)
- **Event lifecycle** 7-state draft + **credit-ledger framework** (append-only, corrections-as-entries, hash-chained, PDF-as-projection) drafted for review. **Sprint 3 ledger implementation gated on** (a) ledger-framework answers, (b) external review by ≥1 accrediting body + ≥1 organiser, and (c) the P2 shared-vs-separate-lock decision.
- **"The record":** attendance (check-in) is the credit trigger; feedback is event metadata, not a credit gate.

---

## §6 — Exit gate (final)

- **Static gates:** `tsc --noEmit` · `eslint .` · `vitest run` · `next build` — all green; existing 18 routes unbroken against default org (backtest).
- **RLS + integration suite** (extend `pnpm test:rls`):
  - **Negative test:** a logged-in test user calling `write_audit_event` directly → `42501` (proves D1 grant revocation).
  - Each audited definer function end-to-end (gate → mutation → audit-last → fail-visible-on-not-found).
  - OTP flow via admin `generateLink`.
  - Session-revoke abuse backtest (3-in-60 → revoke; race handling).
  - Per-surface behaviour-preserving backtests (P3 checklist).
  - **Check-in burst throughput backtest — 200 concurrent self-check-ins on one event; P50/P95/P99 measured; failure criterion P99 > 2 s** (P2).
- **Three-check phase-completion protocol** (dev-lens agent + separate user-lens agent + real-Supabase backtest) before the handoff doc.
- **Deferred with its dependency:** the Turnstile + strike-ladder abuse backtest (returns when Turnstile is provisioned); the MFA freshness dogfood test (moved to Sprint 4 with §2).
