# Handoff — 19 Sep 2026 — Two BLOCKER fixes + three follow-up checkin fixes

Work instruction: pick up from `handoff_20260917-walkthrough.md` + `handoff_20260918-frontend-review.md`, plan Open Capture Mode (new "Managed vs Open" event capture mode — instruction pasted 2026-09-19). Planned as **Step 0** (fix the review's two BLOCKERs first) + **Phase A** (mode control + event-level walk-up). This session closed Step 0 and three follow-up fixes Ivan spawned as task chips off of it. **Phase A was not started.**

**Executor:** Claude (Opus 4.7 → Sonnet 5 mid-session, model switched by Ivan), single session, ponytail mode active.

---

## What shipped

### Commit `428c23a` — two BLOCKER fixes from the 2026-09-18 frontend review

- **F-DETAILS-1** — the `/events/[id]/details` readiness strip's accreditation cell fell through to "Not set" for an event accredited via the multi-body wizard (a bridge-shaped `event_accreditation_groups` row) whose credits were already issued — the existing `lapsedButLocked` branch required the legacy single-body scalar columns, which such an event never has. Added a sibling `bridgeButLocked` branch; extracted the whole derivation into a new pure, unit-tested [accreditationCell.ts](../../app/events/[id]/details/accreditationCell.ts) (mirrors the `collegeExportProjection.ts` precedent). Root-caused independently by reading the code cold, then confirmed it matched the review doc's own diagnosis (line 637) exactly.
- **F-CHECKIN-1** — the `/events/[id]/checkin` scoreboard's status badge only branched on live/upcoming, so a completed or cancelled event fell through to "Not open yet". Now covers all six `Lifecycle` values explicitly in [Scoreboard.tsx](../../app/events/[id]/checkin/Scoreboard.tsx). A user-lens review surfaced a related gap in the same component: the big countdown headline always read "Started Xh ago" regardless of lifecycle — now reads "Ended Xh ago" once closed, echoes "Cancelled" when cancelled (matches `LiveScoreboard.tsx`'s existing convention for the same case). Required threading `event.end_time` through `page.tsx` → `RosterClient.tsx` → `Scoreboard.tsx` (was fetched but unused before).

Both live-verified against the real event (`043018e9-e6c3-4885-9e05-860408d2cb47`) the original findings were reported on.

### Commit `dd1cf30` — three fixes from Ivan-spawned follow-up tasks

1. **Checkin page crashed inconsistently under DB load.** `eligRes`/`rolesRes` (in `page.tsx`) were already correctly non-throwing (log + degrade). The actual crash source was `blocksRes`/`checkinsRes` (agenda_blocks / speaker_checkins reads), which still threw — under heavy concurrent load, whichever subset of the 5 reads timed out in a given request determined whether the page degraded gracefully or hard-crashed to the generic app-wide error boundary (no route-scoped one exists, and adding one would be a brand-new pattern with zero precedent elsewhere in the app — considered, not done). Downgraded `blocksRes`/`checkinsRes` to the same log-and-continue pattern: their only consumer, `SpeakersCard`, already has a specced empty state for zero speakers, so nothing new was needed. `rosterRes` (and the top-level event read) still throw deliberately — an empty roster is indistinguishable from "nobody registered", so a failed read there must stay visible as a failure.

   Live-verified via real production-shaped server logs (not synthetic): caught one request where eligibility+roles both hit SQLSTATE 57014 and the page still rendered 200 (fix working), and a separate request that still crashed with the same error digest but with neither eligibility nor roles logged first — confirming the crash surface narrowed to exactly the two reads (roster, event) that are supposed to still throw.

2. **Walk-in gate used the stale `status` DB column, not derived lifecycle.** [actions.ts](../../app/events/[id]/checkin/actions.ts)'s `walkInRegisterAndCheckIn` only checked `event.status !== 'published'`. Since `pg_cron` is deferred (Hard Rule 7 — Stage 8, not yet wired), `status` never auto-flips to `'completed'` after an event ends — it stays `'published'` forever. The gate was silently ineffective for **every** ended event in the system, not a one-off. Fixed to call `computeLifecycle()` (the same function the Scoreboard already trusts), requiring `lifecycle === 'live'`. Ivan chose "hard block when not live" via AskUserQuestion over two alternatives (a grace window; leave-as-is-but-fix-copy-only).

   Extracted the rejection copy into a new shared `walkInClosedMessage(lifecycle)` in [eventLifecycle.ts](../../lib/lifecycle/eventLifecycle.ts) so the server action and — after a user-lens follow-up caught the message only appearing after a wasted submit round-trip — the `WalkInDialog`'s new up-front warning can't drift from each other. The dialog now shows the message immediately on open and disables "Register & check in" before any submit attempt (verified via `document.querySelector('button[type="submit"]').disabled === true`, not just visual styling).

   Had to backfill real `start_time`/`end_time`/`registration_close_at`/`registration_open_at` into 5 existing test fixtures in [walkIn.test.ts](../../app/events/[id]/checkin/walkIn.test.ts) that never had them — `computeLifecycle` silently misclassifies (falls through to `'registering'`) without real timestamps, which would have broken those tests the moment this fix landed. Added 3 new regression tests (ended/cancelled/not-yet-open rejection) plus unit tests for the new pure `walkInClosedMessage` function.

3. **`registrations` was never in the `supabase_realtime` publication.** Discovered while investigating the "roster doesn't refresh after a walk-in" report — confirmed **empty on both the local stack AND Seoul production** (`select tablename from pg_publication_tables where pubname = 'supabase_realtime'` returned zero rows on both, independently re-confirmed by the dev-lens review via its own Supabase MCP query against Seoul). `RosterClient.tsx`'s `postgres_changes` subscription (already correctly handles both INSERT and UPDATE) has done nothing since it was written, in every environment, for every session — not a review-mode artifact. Migration [20260919010000_registrations_realtime_publication.sql](../../supabase/migrations/20260919010000_registrations_realtime_publication.sql) adds the table. Safe: `postgres_changes` already respects each subscriber's own RLS (`registrations`' SELECT policies are all `authenticated`-scoped, no `anon` policy exists), so this grants no new visibility.

   Applied to local via a direct `psql` statement (not `supabase db reset`, which would have wiped other active sessions' data). Verified the new regression test ([realtime_publication.rls.test.ts](../../tests/rls/realtime_publication.rls.test.ts)) actually catches the gap by manually toggling the publication membership off and back on, not just asserting a tautology. Added a small `sqlSuperuserQuery` helper (sibling to the existing `sqlSuperuser`, returns rows instead of void) to [tests/helpers/clients.ts](../../tests/helpers/clients.ts) since no existing helper could run a catalog query and return results.

   **⚠️ Not yet pushed to Seoul** — needs `supabase db push --linked` from Ivan's own terminal, per this repo's established convention (confirmed via `list_migrations`: latest applied remote migration is still `20260916040000_profile_enrichment_tables`).

### Commit `a15c2cc` — docs only (PROJECT_STATE.md update for the first two fixes)

---

## Reviews (phase-completion protocol)

Two-agent dev-lens/user-lens review run **four times** across this change set as it grew (initial two BLOCKER fixes → headline delta → eligibility/walk-in/realtime fixes → the WalkInDialog UX follow-up). No bugs found in any pass. Highlights:

- Dev-lens independently traced `bridgeButLocked`'s boolean logic against every combination it could construct and confirmed it cannot produce a false "Locked" for a genuine multi-body config.
- Dev-lens independently confirmed `LiveScoreboard.tsx` does NOT share F-CHECKIN-1's bug (already handles completed/cancelled correctly) — and separately, unprompted, caught that its `EventDateTimeRangePicker.test.tsx` "failure" in one gate run was CPU contention from running vitest concurrently with tsc/eslint, re-ran alone to confirm (8/8 passed).
- Dev-lens corrected a review-doc mislabel: F-EDIT-3 (the `/edit` page's CpdAccreditationSection contradiction) is actually a manifestation of the separately-documented **F-DETAILS-2**, not F-DETAILS-1 — meaning a future fix needs one of F-DETAILS-2's three logged IA options, not a `bridgeButLocked`-style single-component mirror.
- Dev-lens independently re-verified the realtime-publication claims against Seoul production itself via the Supabase MCP, not from this session's self-report.
- User-lens found 3 IMPORTANT issues on the original two-fix pass (the CpdAccreditationSection contradiction — confirmed = F-DETAILS-2, not new; the check-in headline never saying "ended" — fixed; roster not refreshing + no gate on closed-event walk-ins — both root-caused and fixed as the two follow-up tasks).
- User-lens verified the walk-in gate is server-enforced, not just client-side theater (reloaded and double-submitted to rule out a bypass).

---

## Gates

Static gates run repeatedly through the session (tsc / eslint / vitest / `next build`) — all clean at every checkpoint. Final state: tsc 0 errors, eslint 5 pre-existing errors / 0 new (unrelated files: `app/invite/[token]/*`, `app/settings/page.tsx`), vitest 960 passed (one confirmed-flaky unrelated file, `EventDateTimeRangePicker.test.tsx`, passes clean in isolation), `next build` clean, 38 routes.

`pnpm test:rls` **could not get a clean isolated run this session.** Both of Ivan's other Claude Desktop sessions ("Practitioner Eventar record", "Full-spec frontend review") were intermittently active against the same local stack for most of the window — one pushed 3 commits to `origin/main` mid-session without this session doing anything. Concrete proof it's external, not a regression: a foreign-key violation naming a row created by a different session's test fixture; individual RLS assertions taking 25-30s each (a queueing signature, not a logic bug); the local stack's `supabase_pooler_Eventar` service reported stopped in every `supabase status` check this session, meaning every connection — including two sessions' concurrent heavy test suites — went direct to Postgres with no pooling. None of this session's diffs touch DB/RPC/grant surface, so `test:rls` isn't a meaningful gate for them specifically. Full diagnosis in memory: `eventar-peer-sessions-contend-local-stack.md`.

---

## Open for Ivan (nothing here is new information beyond what was already said in-session — collected here for the next session to read first)

1. **Open Capture Mode Phase A has not started.** Plan at `~/.claude/plans/pick-up-from-handoff-immutable-wave.md`. Step 0 (this handoff) is done; say go whenever ready.
2. **Migration `20260919010000_registrations_realtime_publication.sql` needs `supabase db push --linked` to Seoul** from an interactive terminal.
3. **F-DETAILS-2** (single-body CPD section contradicts the multi-body wizard on the same page) — still live, confirmed by user-lens this session. 3 options already logged in `handoff_20260918-frontend-review.md` line 638. Not touched.
4. **D5 — `creditsBlocked` dashboard-stat org-scoping** — open since 2026-09-17 (see `PROJECT_STATE.md`), two options logged, unrelated to this session's work but still unresolved.
5. **`LiveScoreboard.tsx` has no explicit `drafted` case** in its ELAPSED/WRAPS-IN headline pair (unlike its correctly-handled completed/cancelled cases) — noticed while investigating F-CHECKIN-1, cosmetic at worst (a draft event's headline would show a zeroed elapsed time rather than something sensible), different file from what was asked, not fixed, not previously reported until Ivan asked "any outstanding issues" at session end.
6. **Peer-session contention on the local stack is an ongoing environmental hazard**, not resolved this session — expect `test:rls` (and possibly other local-stack-dependent commands) to keep being unreliable while Ivan's other sessions are active. Not something either individual session can fix alone.

### Already-documented, pre-existing issues not touched this session (all from `handoff_20260918-frontend-review.md`, listed here only so this handoff is a complete picture — none of this is new)

`ConfirmDialog`'s four a11y/primitive gaps (F-DIALOG-1..4, closes on one primitive rework) · systemic Base UI Select label-vs-raw-value issue across 6+ sites (F-SWEEP-SELECT-1) · "published" vs "Completed" status-word inconsistency (F-SWEEP-STATUS-1) · Analytics/Reports using 3 different icons for one concept (F-SWEEP-ICON-1) · `verified` vs `verified_user` icon inconsistency (F-SWEEP-ICON-2) · read-only `/edit` CPD field question, implement-or-rename (F-EDIT-1/2) · invalid invite-token page rendering as if valid until clicked (F-INVITE-1) · `exportEvidenceActions.ts` not sharing `lib/csv.ts`'s BOM fix · `verify_evidence_chain()` grant is `authenticated`-callable rather than `service_role`-only (low-value, metadata-only exposure).

---

## Reproducibility notes

- Local stack recovery: `bash scripts/demo/dev-local.sh` from the repo root (kills any stale `:3100`, exports env from `supabase status`, starts Next on `:3100`).
- Test event used throughout: `043018e9-e6c3-4885-9e05-860408d2cb47` ("Walkthrough Test Event — HKCP CME"), now shows 5/5 checked in (4 test walk-ins from the 2026-09-18 user-lens review + the original attendee), all still on the local stack, nothing written to Seoul.
- If `pnpm test:rls` shows scattered failures across files unrelated to whatever you're testing, run `ListAgents` before assuming a regression — see the peer-session memory note.
