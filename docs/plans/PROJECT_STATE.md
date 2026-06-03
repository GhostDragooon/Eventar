# Project State — Eventar
_Last updated: 2026-06-02 (post-R1 + M1 + Q19 access policy refinement)_

> Source of truth for "what's active vs forward-looking."
> **Read this BEFORE writing any code.** Updated at the end of each phase.
> Vault decisions live at `/Users/ivan/Desktop/Eventar/02 — Decisions Log.md`.

---

## ACTIVE PHASE — Phase 7 (next)

**Goal.** Replace stubbed `console.log` email sends with real Resend calls + React Email templates. **Email #1 only** (registration confirmation) — #2 (60-min reminder) and #3 (10-min-after survey invite) wait for Phase 9 (pg_cron).

**Active files to touch:**
- `app/(public)/events/[id]/actions.ts::registerForEvent` — replace the `console.log` at step 6 with `resend.emails.send`
- NEW: `emails/confirmation.tsx` — React Email template
- NEW: `lib/resend.ts` — single Resend client (`'server-only'`)

**Active discipline:**
- CLAUDE.md hard rule 2: `email_log` row inserted FIRST, send SECOND. The `registerForEvent` action already does this; do not reorder.
- CLAUDE.md rule 10: UUIDs only in logs; never recipient email or name.
- Q18A/B (RLS-silent-fail guard + revalidatePath) still required for any new mutation.

---

## JUST SHIPPED — Phase 6.5 (dashboard + per-event details)

5-state lifecycle DERIVED from existing schema + 1 new column (`registration_close_at`). New surfaces: `/dashboard` General Category band + lifecycle-grouped event sections; new `/events/[id]/details` route with Registration / Attendance / Feedback sections. New patterns codified: RLS-silent-fail guard, revalidatePath discipline, single-clock-per-request.

See [[02 — Decisions Log#Q17]] + [[02 — Decisions Log#Q18]] and `docs/plans/handoff_01062026.md`.

---

## CARRIED-FORWARD CONSIDERATIONS

Things to hold in mind during the ACTIVE build, **NOT to act on now**:

- **Phase-8 deploy gates** — **all 4 closed** (R1 security batch + M1 drift reconcile):
  1. ✅ **CLOSED** — PII enumeration oracle on `/checkin/confirm`: name dropped from page + ConfirmButton; full_name removed from SELECT (commit `7c5bcbd`). Velocity side closed by rate limits (commit `20ac68f`).
  2. ✅ **CLOSED** — `Math.random` → `crypto.randomInt`; codes widened 4→6 chars; old 4-char codes grandfathered (commit `659eee0`).
  3. ✅ **CLOSED** — Host-header spoofing: `lib/origin.ts::getRequestOrigin` reads `NEXT_PUBLIC_SITE_URL` first, throws in prod if unset (commit `561d2cb`).
  4. ✅ **CLOSED** — Migration history drift reconciled 2026-06-02: remote `supabase_migrations.schema_migrations` realigned to local file versions (DELETE 5 stale remote rows + INSERT 5 local-only). `supabase db push` no longer blocks. `list_migrations` ↔ `ls supabase/migrations/` diff exits 0.
- **Phase 9 (pg_cron)** will read `email_log` — do NOT rename the `purpose` enum values during Phase 7 (`confirmation`, `reminder`, `survey`).
- **`registration_close_at` editor** lives ONLY on `/details`. Do not add a duplicate surface in `/edit` during Phase 7.
- **Three-layer validation** (form → Zod → DB constraint) for every new mutation (vault `Security + Robustness` §1).
- **`requireStaff()` at top of every staff Server Action** — hard rule.
- **Q18 patterns** (RLS-silent-fail + revalidatePath) — required for every mutation Server Action.
- **Rate-limit any new public Server Action / GET endpoint**. The infrastructure (`lib/rateLimit.ts::rateLimitByIp`) is live; new surfaces should opt in. Existing limits: selfCheckIn/submitSurvey 10/min/IP · registerForEvent 30/min/IP · GET /checkin/confirm + /survey 60/min/IP.
- **`NEXT_PUBLIC_SITE_URL`** must be set in Vercel env before Phase 8 deploy. `lib/origin.ts` throws in production if missing.
- **Owner-only by default for mutation surfaces** (Q19, 2026-06-02). New staff mutation pages (`/events/[id]/X` where X edits or controls something) should gate at page entry: read `event.created_by`, redirect non-owners to `/details`. New mutation actions use `supabaseServer()` so RLS enforces ownership. `supabaseAdmin()` is reserved for documented exceptions (public anon flows like `registerForEvent`). Managers retain READ access via existing RLS to all events/registrations/surveys — `/dashboard`, `/details`, `/analytics` remain manager-visible.

---

## EXPLICITLY OUT OF SCOPE FOR THE ACTIVE PHASE

Intentionally NOT in Phase 7 — surface as "for later" if they come up in conversation:

- **Real edit form** for events. `/edit` is currently read-only. F#5 in `docs/plans/handoff_01062026.md` is an open decision.
- **`/api/*` routes.** Server Actions remain the in-app public-write surface. `/api/*` reserved for Phase 9.
- **Manager-specific UI.** RLS scopes visibility; no role-branching per Q16 Decision B.
- **Email #2 reminder + Email #3 survey-invite sends.** Wait for Phase 9 (pg_cron).
- **Vercel deploy.** Phase 8.

---

## Open decisions

_(none — F#5 resolved by Q19's access policy refinement. The Drafted slice routing question is now moot: non-owners can't reach `/edit` at all; owners see the Publish action prominently on Draft state with no misleading copy.)_

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
| **7** | **next** | Real Resend sends + React Email templates for Email #1 |
| 8 | planned | Vercel deploy |
| 9 | planned | pg_cron drives Email #2 (60-min reminder) + Email #3 (10-min survey invite) |

---

## How to keep this current

- The phase that just shipped updates this doc as part of its `docs/plans/handoff_DDMMYYYY.md` close-out.
- "ACTIVE PHASE" rotates to the next phase's design plan.
- "JUST SHIPPED" rotates to what was previously ACTIVE.
- "CARRIED-FORWARD CONSIDERATIONS" gets new items appended; resolved items removed.
- If this file's `Last updated` is more than one phase out of date, treat it as stale and prefer the latest handoff doc in `docs/plans/`.
