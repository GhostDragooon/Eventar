# Project State — Eventar
_Last updated: 2026-06-04 (Phase 7 Resend integration shipped — credentials pending)_

> Source of truth for "what's active vs forward-looking."
> **Read this BEFORE writing any code.** Updated at the end of each phase.
> Vault decisions live at `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`.

---

## ACTIVE PHASE — Phase 8 (next) — Vercel deploy

**Goal.** Deploy Eventar to Vercel against the production Supabase project. First public URL; first real email infrastructure exercised end-to-end. Operational work primarily, not code.

**Active surface (operational + minimal code):**
- Vercel project creation; link to GitHub repo `GhostDragooon/Eventar`.
- Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (set to canonical Vercel URL or custom domain), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Domain verification on Resend before first prod registration (otherwise sandbox sender `onboarding@resend.dev` is fine but recipient sees it).
- Remove `lib/devEmailStub.ts` per `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol" once `RESEND_API_KEY` is in `.env.local` AND a local smoke registration confirms the real Resend path works.

**Active discipline:**
- CLAUDE.md hard rule 7 (no premature externals) — Vercel is now the canonical deploy, but pg_cron still waits for Phase 9.
- All Phase-8 deploy gates are CLOSED (see CARRIED-FORWARD below).

---

## JUST SHIPPED — Phase 7 (Resend integration — code only; credentials pending)

Real production email infrastructure landed in 7 commits (2026-06-04). The code is production-grade; only the `RESEND_API_KEY` is missing. Until it's added in `.env.local`, registrations route through the parallel `lib/devEmailStub.ts` (returns `{ skipped: true }`, leaves `email_log.status='queued'`) — exactly the design's "build temp in parallel for testing; remove without fuss" goal.

**Commits:**
- `2a0a73c` chore(deps): resend + @react-email/components + @react-email/render
- `089242f` + `d579900` feat(email): lib/devEmailStub.ts (+ PII test broadening fix)
- `a9f8eff` feat(email): lib/resend.ts production facade
- `5762f82` feat(email): emails/confirmation.tsx React Email template
- `7d7a2c4` feat(email): wire facade into registerForEvent step 6+7
- `ec388b2` docs(env): document RESEND_API_KEY + RESEND_FROM_EMAIL

**Test count:** 169 → 180 (+11 tests across 4 new test files).

**Design + plan + smoke notes:** `docs/plans/2026-06-04-phase-7-resend-design.md` (fc938e5) + `docs/plans/2026-06-04-phase-7-resend.md` (a3520e5).

**Architectural patterns codified:**
- Two-file separation (`lib/resend.ts` production / `lib/devEmailStub.ts` removable) over a single facade-with-branches, because removal cost is the design metric.
- Env switch INSIDE registerForEvent (not at module top) so per-test env mutations work without `vi.resetModules()`.
- Production code throws on missing `RESEND_API_KEY` (Rule 12 — misconfig must surface); dev stub returns `{ skipped }` instead.
- React Email template renders to inline-styled HTML; props pre-formatted at the call site so the template imports no request-context helpers.

**One known upstream finding:** `@react-email/components@1.0.12` is marked deprecated. Resend's docs now point to `@react-email/ui` as the successor. Decision was to ship with the deprecated package (it's the latest version, Resend maintains it, only one template uses it) and migrate as a small follow-up. See commit `2a0a73c` body for the full rationale.

---

## CARRIED-FORWARD CONSIDERATIONS

Things to hold in mind during the ACTIVE build, **NOT to act on now**:

- **Phase-8 deploy gates** — **all 4 closed** (R1 security batch + M1 drift reconcile):
  1. ✅ **CLOSED** — PII enumeration oracle on `/checkin/confirm`: name dropped + rate-limited (commits `7c5bcbd` + `20ac68f`).
  2. ✅ **CLOSED** — `Math.random` → `crypto.randomInt`; codes widened 4→6 chars (commit `659eee0`).
  3. ✅ **CLOSED** — Host-header spoofing: `lib/origin.ts::getRequestOrigin` reads `NEXT_PUBLIC_SITE_URL` first (commit `561d2cb`).
  4. ✅ **CLOSED** — Migration history drift reconciled 2026-06-02 (`list_migrations` ↔ `ls supabase/migrations/` diff exits 0).
- **devEmailStub removal protocol** — Once `RESEND_API_KEY` is set in `.env.local` AND a smoke registration confirms the real Resend path works, remove the temp per `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol." ~3 minutes. Until then, ALL registrations log "[email queued]" — no real email sends.
- **Phase 9 (pg_cron)** will read `email_log` — do NOT rename the `purpose` enum values (`confirmation`, `reminder`, `survey`).
- **Three-layer validation** (form → Zod → DB constraint) for every new mutation.
- **`requireStaff()` at top of every staff Server Action** — hard rule.
- **Q18 patterns** (RLS-silent-fail + revalidatePath) — required for every mutation Server Action.
- **Rate-limit any new public Server Action / GET endpoint** via `lib/rateLimit.ts::rateLimitByIp`. Existing limits: selfCheckIn/submitSurvey 10/min/IP · registerForEvent 30/min/IP · GET /checkin/confirm + /survey 60/min/IP.
- **`NEXT_PUBLIC_SITE_URL`** must be set in Vercel env before Phase 8 deploy. `lib/origin.ts` throws in production if missing.
- **Owner-only by default for mutation surfaces** (Q19, 2026-06-02). New mutation pages gate at page entry via `event.created_by !== staff.id` redirect; new mutation actions use `supabaseServer()` so RLS enforces. `supabaseAdmin()` only for documented exceptions (public anon flows).
- **`@react-email/components` → `@react-email/ui` migration** — small follow-up post-Phase-8 once the `emails/confirmation.tsx` template is iterating. Single import-path change (or possibly a small JSX rewrite depending on API drift). Not blocking.

---

## EXPLICITLY OUT OF SCOPE FOR THE ACTIVE PHASE

Intentionally NOT in Phase 8 — surface as "for later" if they come up in conversation:

- **Real edit form** for events. `/edit` remains read-only + Publish for owners only (Q19).
- **`/api/*` routes.** Server Actions remain the in-app public-write surface. `/api/*` reserved for Phase 9 cron callbacks.
- **Manager-specific UI.** RLS scopes visibility; no role-branching per Q16 Decision B.
- **Email #2 reminder + Email #3 survey-invite sends.** Wait for Phase 9 (pg_cron).
- **Phase 9 cron infrastructure.** That's its own phase.
- **Queued-row backlog sweep.** Per user direction during Phase 7 brainstorm: don't worry about transient stub-era rows.

---

## Open decisions

_(none currently. Phase 8 work is operational; ask the user before adding non-deployment scope.)_

---

## Phase ledger (compressed)

| Phase | Status | Demoable end-state |
|---|---|---|
| 1 / 1.5 / 1.5b | ✅ shipped | Magic-link login → create draft event (accordion form) → public `/events/:id` after publish |
| 2 | ✅ shipped | Anonymous registration (inline on info page) → DB row + email_log stub |
| 3 / 3.5 | ✅ shipped | Publish action; one QR per event; poster page; CSV registrant export |
| 4 / 4.6 | ✅ shipped | Tablet roster with Realtime + html5-qrcode scanner; `/checkin/confirm?code=` self-checkin; M3 indigo design system |
| 5 | ✅ shipped | `/survey?code=` 5-question categorical template (Q15 schema) |
| 6 | ✅ shipped | Per-event `/analytics` (categorical distributions, no avg ratings — Q16) |
| 6.5 | ✅ shipped | Dashboard redesign + per-event `/details` with 5-state lifecycle (Q17) |
| 7 | ✅ shipped (code) | Real Resend infrastructure + React Email template for Email #1 — credentials pending in `.env.local` |
| **8** | **next** | Vercel deploy; env vars + Resend domain verified; first real email out the door |
| 9 | planned | pg_cron drives Email #2 (60-min reminder) + Email #3 (10-min survey invite) |

---

## How to keep this current

- The phase that just shipped updates this doc as part of its `docs/plans/handoff_DDMMYYYY.md` close-out.
- "ACTIVE PHASE" rotates to the next phase's design plan.
- "JUST SHIPPED" rotates to what was previously ACTIVE.
- "CARRIED-FORWARD CONSIDERATIONS" gets new items appended; resolved items removed.
- If this file's `Last updated` is more than one phase out of date, treat it as stale and prefer the latest handoff doc in `docs/plans/`.
