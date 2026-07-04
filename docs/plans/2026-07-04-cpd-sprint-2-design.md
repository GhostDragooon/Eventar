# CPD Sprint 2 — Design: Auth split + security shell

_Status: design **approved** 2026-07-04 (three decisions + §1 keystone review, five amendments folded, two reminder-driven refinements). This doc is the **WHY**; the task-by-task **HOW** is the separate executable plan (`superpowers:writing-plans` output). Backend only — frontend remains frozen._

> Read first: `docs/plans/PROJECT_STATE.md`, `docs/plans/handoff_04072026.md`, `docs/architecture/BASELINE-DELTAS.md` §1/§2/§3/§4, vault `20 — Roadmap/CPD Roadmap — Backend First.md` §Sprint 2.

---

## Scope (post-decision)

Five workstreams, all backend, frontend frozen; existing 18 routes keep working against the default org:

1. **`withSecurity` wrapper + audit path** (§1 — keystone)
2. **Staff password + TOTP MFA backend + `amr` freshness helper** (§2)
3. **Attendee native email OTP identity** (§3)
4. **Authenticated deterministic abuse tier** (§4)
5. **`proxy.ts` security headers/CSP** (§5)

**Cut from Sprint 2 (deferred, see `docs/DEFERRED.md`):** the unauthenticated Turnstile + escalating IP strike ladder (needs Cloudflare keys), the Resend OTP-email cutover (needs Supabase Auth SMTP), and historical registration linking.

---

## Decisions locked this pass

**D1 — Restrict the `write_audit_event` grant.** Revoke `EXECUTE` from `authenticated`; keep `service_role` + the definer-owner path. Audited mutations become `SECURITY DEFINER` DB functions ending in the audit write (the `pseudonymise_user` shape), so no client ever calls `write_audit_event` directly. Closes the audit-**authenticity** gap carried from Sprint 1 (tamper-*evidence* was already intact).

**D2 — Defer historical registration linking.** No consumer exists until the wallet unfreeze (post-M4). **Ratified** by the identity model locked this pass: the credit ledger keys on `licence_id`, not the account↔registration link, so linking is provably off the credit path. Avoids the shared-email over-linking / changed-email under-linking edge cases entirely. Sprint 2 still ships the attendee OTP **capability**.

**D3 — Defer Turnstile + Resend OTP cutover.** Keeps Sprint 2 self-contained and fully locally backtestable (no external-key gating). Interim security residual recorded in the ADR findings below and in `docs/DEFERRED.md`.

---

## §1 — `withSecurity` wrapper + audit path (keystone) [LOCKED]

Two responsibilities at two layers.

**Security (TS layer, universal).** `withSecurity(handler, opts)` — a higher-order wrapper every mutation Server Action passes through:

`requireStaff` (now `status='active'` + `eventar_staff`-aware — see Amendment 2) → optional `amr` MFA-freshness gate (≤30 min, opt-in per action) → per-session/user rate limit → Zod parse → run `handler` → typed result carrying the existing Q18 RLS-silent-fail guard + `revalidatePath`. Actor identity is derived server-side; client input never sets actor fields.

**Audit atomicity (DB layer, compliance subset only).** The hard rule *"audit-insert-last, same transaction"* **cannot** be satisfied by an app-level "mutate, then call `write_audit_event`" — those are two separate PostgREST transactions (see ADR Finding 1). So audited mutations follow the `pseudonymise_user` shape: a `SECURITY DEFINER` function doing **gate → mutation → `write_audit_event` (last)**, atomically, with actor read from `auth.uid()` / `app_private.auth_email()`. The wrapper calls that function as its `handler`.

**Rejected alternatives:**
- *Every mutation → definer RPC* — forces all business logic into plpgsql for no benefit. Routine mutations need the wrapper, not an audit row.
- *Wrapper writes audit in TS after the mutation* — separate transactions ⇒ a crash orphans the mutation from its audit row; breaks the hard rule; and would force keeping the `authenticated` grant.

**Audited subset (Sprint 2):** DSR lifecycle · erasure completion around `pseudonymise_user` (session revoke + `auth.users` email scrub via admin API — the migration comment defers this here) · consent grant/withdraw · staff security actions (MFA enrol, session revoke) · **check-in (both paths)** · **event publication**. Routine event/registration/survey mutations = wrapper only, no audit event.

### Amendments folded in (from §1 review)

- **A1 — audited subset widened.** *Check-in* is the raw material for Sprint 3's credit ledger, so it must be tamper-evident from the moment it's recorded, not retro-anchored — both staff-scan (actor = staff) and self-check-in (actor null/anonymous; the tamper-evidence is on the check-in *fact*). *Event publication* emits `event_published` now (tamper-evident publication record); the Pillar-1 **organiser-attested accreditation** payload layers onto that same event in Sprint 3 when `event_accreditations` exists — no re-plumbing.
- **A2 — `requireStaff` reconciliation is an explicit Sprint 2 deliverable** (not just an integration note). `lib/auth.ts` still types `role: 'organizer' | 'manager'` and ignores `status`. Reconcile to: gate `status = 'active'`; widen the role type to today's real DB values `'organizer' | 'manager' | 'eventar_staff'` (DB uses US-spelled `organizer`; the `organiser`/5-role enum is a Sprint 3 migration); forward-compatible with that expansion. Backfill-check that both existing staff rows are `status='active'` so the tightened gate doesn't lock out current staff.
- **A5 — RLS-silent-fail guard scope confirmed.** Audited mutations are `SECURITY DEFINER` (owned by `postgres`) and **bypass RLS by design** — which is *why* the in-function gate (`raise 42501` + `if not found then raise`) is load-bearing, not belt-and-suspenders. So: routine mutations get wrapper + RLS + Q18 guard; audited mutations get wrapper + in-function gate + in-function fail-visible-on-not-found, and the RLS guard is **deliberately absent** (no RLS to silently fail). Documented so a future reviewer reads the absence as intent.

### Reminder-driven refinements

- **R-C — consent capture is a post-signup audited Server Action, NOT in `handle_new_user`.** The audit write holds `pg_advisory_xact_lock` until commit; embedding it in the signup trigger would serialize **every signup** on the audit-chain lock. Keeping consent out of the trigger also keeps `handle_new_user` lean (the "should this be sync-in-trigger?" review Reminder C asks for).
- **R-D — one shared staff-gate helper, not twelve hand-copied gates.** Extract `app_private.require_active_staff(variadic p_roles text[])` (raises `42501`, composed from the existing `auth_email()` / `is_manager()` / `is_eventar_staff()` helpers). Every new audited definer function calls it, so the gate is defined **once**. Full function templating/codegen deferred to Sprint 3/4.

---

## §2 — Staff MFA backend + freshness helper

- Native `auth.mfa` **password + TOTP** factors. **No custom tables** (BASELINE §1, §2.12).
- **Magic link stays the live login path** (frontend freeze); password + TOTP added as *backend capability*, mandatory only in Sprint 4 (when the minimal enrolment screen — the one permitted freeze exception — lands).
- `app_private.mfa_is_fresh(p_max interval)` reads `auth.jwt() -> 'amr'` factor timestamps → boolean; usable in RLS (SQL) and mirrored in the TS wrapper (`withSecurity({ requireMfaFreshness })`). No custom freshness table.
- Houses the **A2 `requireStaff` reconciliation**.
- **A3 decision — freshness gate is plumbing + a dogfood test, no live enforcement caller in Sprint 2.** Rationale: gating any real staff action on freshness *before* the Sprint-4 enrolment UI would lock out any un-enrolled staff member. A real-`auth.mfa` integration test exercises the full enrol→fresh→stale cycle (via the admin API), so the path is proven, not dead code — the first *enforcement* caller lands Sprint 4.

---

## §3 — Attendee native email OTP identity

- Supabase Auth native email OTP (`signInWithOtp`), accounts + sessions. The Sprint-1 `users` mirror + `handle_new_user` trigger auto-populate `public.users` on signup.
- **No registration linking** (D2), **no wallet UI** (frozen) — this is capability-building for the post-M4 unfreeze; API-testable only, no live mutation consumer in Sprint 2 (attendee-facing actions stay anonymous-by-code on their frozen surfaces).
- **Consent at signup** → a post-signup **consent-grant audited mutation** (per R-C), writing `consent_records` (terms_of_service, privacy_policy).
- **A4 test mechanism — admin `generateLink`, not the dev email sender or inbucket.** The project runs against the hosted Seoul project; inbucket is a *local-stack* feature. Hosted integration tests generate the OTP via the GoTrue **admin API (`generateLink`, token returned in-band, no email sent)**, sidestepping the dev-sender rate ceiling. Real-user OTP testing waits for the Resend cutover; **no pilot cohort against the dev sender**. (Verify the exact admin-API surface against Supabase docs before writing — AGENTS.md.)

---

## §4 — Authenticated deterministic abuse tier

- Extend `lib/rateLimit.ts` from IP-keyed to **session/user-keyed** (`rateLimitBySession` / `rateLimitByUser`) on the existing Postgres `rate_limit_check` pattern — **no new external service** (satisfies hard rule 7; the mechanism is already durable/serverless-safe by design).
- **3 session rate-limit hits in 60 min → automatic session revoke** — a *measurement* → auto-act is allowed under §4's measurement-vs-inference rule. Mechanism: admin session revoke; emits `session_revoked` (audited subset).
- **Check-in keyed per-event, not per-IP** (§4's venue-NAT counterexample: 200 attendees on one NAT is aggregation, not measurement).
- **No IP enforcement on authenticated routes, ever** (§4 / pivot §6).

---

## §5 — `proxy.ts` security headers/CSP

- Global security headers (CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) — likely via `next.config.ts` `headers()` so they cover public routes too, with `proxy.ts` keeping its (A2-reconciled) staff-route auth gate. Verify the Next 16 headers API before writing (AGENTS.md).
- The unauth **Turnstile + escalating IP strike ladder is deferred** (D3). Interim residual: ADR Finding 2 below.

---

## ADR findings (first-class, verbatim)

> **Proposed** for a surgical, dated Sprint-2 amendment to `docs/architecture/BASELINE-DELTAS.md` (§3.4 / §4). Captured here as authoritative for Sprint 2; the frozen-baseline edit is confirmed with the user before it lands.

**Finding 1 — strengthens Residual 4a (enforcement mechanism, not the rule):**

> Every PostgREST RPC executes as its own transaction. An application-layer wrapper calling `write_audit_event` after a mutation therefore runs the audit write in a separate transaction from the mutation. This violates the "audit-insert-last, same transaction" rule at the layer we thought would enforce it. Audited mutations must be `SECURITY DEFINER` database functions ending with the audit write. `pseudonymise_user` is the canonical shape.

**Finding 2 — Turnstile-deferral window residual:**

> During the Turnstile deferral window, unauthenticated endpoints have flat per-IP rate limits only. No escalating block, no bot challenge, no strike ladder. A persistent attacker can hammer `/login` and `/otp/*` at just-under-rate-limit indefinitely. Acceptable only while the platform is not publicly exposed. Public exposure gates on Turnstile provisioning.

---

## Forward constraints (NOT Sprint 2 scope — held per Rule 13)

Locked/drafted this pass; they shape Sprint 2's *semantic weight* but no Sprint 2 code depends on them:

- **Business model:** practitioner-first CPD passport; organisers are the first paying layer; institutions later. Advertising rejected. ⇒ check-in + evidence generation are disproportionately load-bearing (organisers pay for them) — which is why they're in the audited subset.
- **Identity model:** self-declared `practitioner_licences`, one `is_primary`, ledger keys on `licence_id`. (Sprint 3.)
- **Event lifecycle** 7-state draft (`draft→published→accredited→live→closed→credited→archived`, `+cancelled`) and **credit-ledger framework** (append-only, corrections-as-entries, hash-chained, PDF-as-projection) are drafted for review; **Sprint 3 ledger implementation is gated on** (a) answers to the ledger-framework questions and (b) external review by ≥1 real accrediting body + ≥1 organiser.
- **"The record":** attendance (check-in) is the credit trigger; feedback is event metadata, not a credit gate — consistent with the audited subset.

---

## Exit gate + test plan

- **Static gates:** `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build` all green; existing 18 routes unbroken against default org (backtest).
- **Integration suite** (extend the Sprint-1 `pnpm test:rls` harness): grant-revocation denial (`authenticated` can no longer call `write_audit_event`) · each new audited definer function (gate → mutation → audit-last → fail-visible-on-not-found) · `mfa_is_fresh` enrol→fresh→stale via admin API · OTP flow via admin `generateLink` · session/user rate limit + 3-in-60 auto session revoke · per-event check-in limit.
- **Deferred from the gate with its dependency:** the Turnstile + strike-ladder abuse backtest (returns when Turnstile is provisioned).
- **Three-check phase-completion protocol** (dev-lens agent + separate user-lens agent + real-Supabase backtest) before the handoff doc.
