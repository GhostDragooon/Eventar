# Practitioner Eventar Record — handoff, 2026-09-19

**Scope:** build instruction "Build instruction — Practitioner Eventar Record" (Product decision 2026-09-18). Read-only `/account/record` page + three follow-up fixes surfaced by its own dual-lens review.

**Status: shipped, on `main`, all static gates green.** No open blockers on this feature. Section 2 below lists real but non-blocking residual items; section 3 lists two small product/scope calls worth Ivan's explicit sign-off rather than a silent default.

---

## 1. What shipped

Four commits, `main`, in order:

| Commit | What |
|---|---|
| [`f9146e7`](https://github.com/GhostDragooon/Eventar/commit/f9146e7) | `/account/record` itself — `listMyAttendanceRecords`/`listMyCreditRecords` Server Actions, `RecordClient.tsx`, the `registrations` self-read RLS migration + test (none existed before), and `tests/rls/credit_ledger.rls.test.ts` (self-read + body-admin-read policies existed since Sprint 3a with zero prior coverage — filled the gap while touching the table for the first time). |
| [`9492fbd`](https://github.com/GhostDragooon/Eventar/commit/9492fbd) | Every `/account/*` page's own sign-in gate now threads `next=<path>` so a signed-out visit round-trips back to where the user was headed, instead of always landing on `/account`. The `next=` plumbing itself (action, `MagicLinkSignInForm` hidden field, `/auth/callback` validation) already existed and already worked for the walk-in flow — this just wired 7 of 9 redirect call sites to use it. |
| [`6966748`](https://github.com/GhostDragooon/Eventar/commit/6966748) | `SiteShell`'s primary nav no longer wraps "Upcoming events" / "Sign in" mid-phrase at 375px. Brand + CTA pill are `shrink-0`/`whitespace-nowrap`; the middle nav-links group gets `min-w-0 overflow-x-auto` as a scroll safety net. Verified via live DOM measurement at 375px and 1024px, not just visual inspection. |
| *(this file)* | Handoff. |

**Product decisions locked during exploration** (spec vs. repo reality — see the plan file for full detail): `registrations.created_at` doesn't exist (it's `registered_at`); `events` is only cookie-readable when `status='published'`, so event titles for un-published/archived events come from a narrow, caller-scoped `supabaseAdmin()` lookup; `has_credit` is net-active per `(event_id, body_id)` — OR'd across bodies per event — matching `credit_ledger_attendance_uniq`'s real 3-column shape, not the 2-column shape the spec assumed. Rate limiting was deliberately skipped on the two new reads to match the existing convention (`listMyLicences`, `getMyAccountAndProfile` have none).

**Verification:** tsc, eslint, `next build` all clean on every commit. Full non-RLS vitest suite green throughout (ended the session at 952/952, up from a 942 baseline). Targeted RLS runs against the **local** stack only (never `.env.local`'s Seoul project) — `registrations_self_read` 5/5, `credit_ledger` 5/5, every other `registrations`-touching RLS file 23/23 — with confirmed clean fixture teardown after each. The full 36-file `pnpm test:rls` batch showed real, investigated, non-reproducible flakiness under repeated back-to-back runs (timeouts in unrelated files — `checkin_throughput`, `award_f1_f5_gate`, `self_check_in`, `event_checkin_modes` — never in anything this feature touches); every flake passed cleanly in isolation. Dual-lens review (separate dev-perspective and user-perspective agents) ran twice — the first pass hit a mid-run rate limit and produced no findings; the re-run completed cleanly with one real IMPORTANT finding (fixed: `has_credit` was silently collapsing a failed ledger read into a confident "not yet on record" rather than an honest unknown — now `boolean | null` with a distinct "Couldn't check" chip state, mirroring the same fix already applied once to `profileAndMembershipReady` on `/account`) and the two MINOR UI-parity gaps fixed in `f9146e7`'s follow-up edits (CPD-points empty state now links to `/account/profile`; its dates now match the Attendance section's `DD Mon YYYY` format instead of raw ISO).

---

## 2. Outstanding issues (non-blocking, not yet fixed)

All from the dev-perspective review, rated MINOR at the time — recorded here so they aren't lost, not because any of them are urgent:

1. **Sequential, not concurrent, secondary queries.** `listMyAttendanceRecords` (`app/account/actions.ts`) awaits the `registrations` select, then the `credit_ledger` select, then the admin `events` select, one after another — the first two don't depend on each other and could be `Promise.all`'d. Same shape in `listMyCreditRecords` for its `accrediting_bodies` + admin `events` lookups. Latency-only; not a correctness issue; bounded by the 100-row cap regardless of row count.
2. **`AttendanceRecordView.source` is fetched and typed but never rendered** in `RecordClient.tsx` (confirmed by grep — only appears in the test fixture). Harmless; plausibly intentional 1:1 mirroring of the `registrations` row shape, matching `LicenceRowView`'s own style. See §3.1 below — this is really a small product question, not a bug.
3. **`.limit(100)` on both list queries has no user-visible truncation indicator.** A practitioner with more than 100 registrations or ledger entries would silently lose the oldest rows with no "showing most recent 100" affordance. Very unlikely to trigger at current product age. See §3.2 below.
4. **`computeHasCreditByEvent`'s correctness rests on an assumption the DB doesn't enforce**: that a `credit_revoked`/`credit_expired` compensating row always carries the same `(event_id, body_id)` as the `credit_earned` row it reverses. Verified via repo-wide grep that no code path currently writes such a mismatched row — this is inherited ledger design the plan already accepted, not a defect introduced here, and nothing to act on unless the ledger's own write paths change.

**One thing investigated and explicitly closed, not outstanding:** the user-perspective review's other named mobile-overflow culprit — the "Review mode" dev banner — turned out to be a false positive. Direct DOM measurement (`getBoundingClientRect`, computed `overflow`/`whiteSpace`, full `textContent`) confirms it renders its complete message, wrapped, entirely within a 375px viewport. The apparent clipping in review screenshots was the browser-automation tool's own overlay icon sitting on top of the page at that exact spot. `components/dev/ReviewBanner.tsx` was left untouched.

**One occasional flake, not reproducible on demand:** both dual-lens sessions' live magic-link walkthroughs hit one silent session drop each across ~15-20+ navigations — `/account/record` served the sign-in page while the tab title still read "Your record · Eventar" (title reflects route metadata sent before the server-side auth check resolves, not actual auth state — a real gotcha for anyone eyeballing just the title bar). Both times, resubmitting the sign-in form with a fresh magic link recovered immediately. Not called a confirmed defect by either reviewer; flagging per their own instruction to report rather than bury it, in case a pattern emerges across future sessions.

---

## 3. Pending decisions

Two small product calls worth an explicit yes/no rather than a session silently picking one:

### 3.1 — Should `source` (self-registered / staff walk-in / invitation / migration) show on the Attendance row?

It's already fetched, typed (`AttendanceRecordView.source`), and RLS-safe to display — just not rendered. Could be a small muted label next to the status pill ("via staff walk-in"), or the field could be dropped from the type entirely if it's genuinely not wanted. Either is a one-line change; no strong reason to pick one over the other without a product call.

### 3.2 — Is the 100-row cap (both lists) fine to ship silently, or does it need a "showing most recent 100" note now?

No practitioner is remotely close to that volume today, so this is speculative — flagging only so a future session doesn't have to rediscover the ceiling from scratch. If Ivan wants it addressed proactively, the fix is a one-line `ponytail:`-style comment plus a conditional footer note; real pagination is a bigger, separate piece of work not worth building ahead of need.

---

## 4. Cross-session context (not evaluated, not touched)

Two other Claude Code sessions were active on this same working tree for parts of this session:

- **"Eventar open capture mode frontend"** — landed three commits on top of mine cleanly (`428c23a`, `a15c2cc`, `dd1cf30`; fix work + their own `docs/plans/handoff_20260919-checkin-fixes.md`), and as of this handoff has an **uncommitted, in-progress edit to `docs/plans/PROJECT_STATE.md`** sitting in the working tree. Deliberately not read past what git status shows, not staged, not touched — it's someone else's in-flight work.
- **"Full-spec frontend review"** — the source of the two pre-existing untracked docs (`docs/plans/handoff_20260917-walkthrough.md`, `docs/plans/handoff_20260918-frontend-review.md`) that predate this session entirely.

One incident worth recording: mid-session, while chasing browser-session flakiness, this session killed a stale `:3100` dev-server process that turned out to belong to the "Eventar open capture mode frontend" session. That session's own server came back on its own later (confirmed — a fresh `:3100` listener was up under a different PID by the time this session needed it again), so no lasting disruption, but it's the kind of collision worth Ivan knowing happened.

**Minor, local-only DB hygiene note:** the local Supabase stack (`127.0.0.1:54322`) carries 4 leftover `organisations` rows from unrelated, older RLS-test runs (`RLS Test Org 2 (licence mutations)`, `(mark_attended)`, `(organisers)`, `(licences)`) — pre-existing debris, not introduced this session, harmless (local dev DB only), not worth a dedicated cleanup task on its own.

---

## 5. Where to look next

- Plan file (full spec-vs-reality delta record): `/Users/ivan/.claude/plans/build-instruction-practitioner-typed-zephyr.md`
- Feature: `app/account/record/`, `app/account/actions.ts` (`listMyAttendanceRecords`/`listMyCreditRecords`), `app/account/schema.ts` (`AttendanceRecordView`/`CreditRecordView`)
- New RLS coverage: `tests/rls/registrations_self_read.rls.test.ts`, `tests/rls/credit_ledger.rls.test.ts`
- Redirect fix: `app/account/{record,claim,complete,profile}/page.tsx`
- Nav fix: `components/shell/SiteShell.tsx`
