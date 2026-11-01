# Handoff, 2026-11-01: the six CX-04R review proposals are applied and pushed; one local commit (organiserTz removal) is not

**Date:** 2026-11-01
**Status:** DONE. CX-04R is closed. Only carried Decide items remain (§0).
**Bead(s):** none (`bd` is not installed here)
**Epic:** MVP execution plan, `docs/plans/2026-10-11-mvp-execution-plan.md`
**Chain:** `mvp-execution` seq `8`
**Parent:** `handoff_20261101-mvp-execution-7.md`
**Prior chain:** `handoff_20261023-mvp-execution.md` > `-2` > `-3` > `handoff_20261031-mvp-execution-4.md` > `-5` > `-6` > `-7` > this

Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.
Mining pass: Quick (light session: it covers only what happened after seq 7 was written).

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Carried from seq 7 item 7, still open:** the em-dash copy and hex gradient in `components/auth/AuthBackdropCard.tsx:51` (`#0E79EC`, `#1C3C94`, `#0B1F4A`; the only `check:ui-colours` hits left), the desktop card position, the "Admin" caption above Settings, phone navigation (the strip clips Settings at 375 px; its own round), and seq 5 Decide 3, 4 and 6. Each is a frontend call, so each needs a before and after from me first. Recommend taking phone navigation next: it is the one with a user-visible defect.
2. **Cancelled events and the roster.** Check-in is gone from cancelled cards. The desk is closed for them (`checkInGateMessage`, `lib/lifecycle/eventLifecycle.ts:74`), but I did not check whether the desk still shows the roster read-only. If it does, that view is now reachable only by typing the URL. Recommend I check it before UX-02, 5 minutes [I: not yet read].
3. **Events fetch cap, the real fix.** I only reworded the footer. The true fix is to leave finished events out of the 300-row fetch (`app/dashboard/data.ts:79`), which needs an `.or(...)` and a test-fake change (`tests/helpers/staffPageFakes.ts` has no `.or`). Not worth doing until an organisation gets near 300 events. Recommend leaving it.

**Execute** (only Ivan can)
1. **Push the last commit, if you want it:** local `main` is two ahead of `origin/main`: `b951527` (removes `organiserTz` and its test) and this handoff commit (docs only). Reply "push main up to <tip sha>" with the SHA from my last message; the tip is the commit that holds this file in a session where you want it. It has not been through the full tip gate (§Checks).
2. Hosted migrations and the dev-3100 lock: unchanged, nothing to do.

**Queued for Claude:** UX-02 re-cut, then the remaining door copy ("nothing else", per your build order). Claim the card first (`parallel-session-card-claim`).

**Other sessions:** I did not re-check this stretch. Run `ListAgents` and `list_sessions` with `linked: true` before starting UX-02.

---

## Where we are

CX-04R was built, reviewed and backtested in seq 7. In this stretch you chose "Show me first", I showed the six open review proposals as before and after with evidence, you said "Apply all six", then "remove the cookie and push main up to b8968a8, then handoff".

| # | Proposal | State |
|---|---|---|
| 1 | Tab semantics | Applied. Plain filter buttons (`role="group"`, `aria-pressed`), hidden ", " before each count |
| 2 | Honest caps | Applied. Events footer reworded; History says "Showing the newest 100 completed events." at 100 |
| 3 | Small copy | Applied (four changes, table below) |
| 4 | No Check-in on cancelled | Applied |
| 5 | Remove `DashboardWorkstation.tsx` | Applied, own commit so it reverts alone |
| 6 | CSV formula prefix | Applied |
| + | Remove `organiserTz` (the orphaned cookie reader) | Applied, committed locally, not pushed |

## What changed [X]

**`components/dashboard/EventsHome.tsx`**
- Tabs: `<div role="group" aria-label="Filter events by state">`, buttons carry `aria-pressed`, count preceded by `<span className="sr-only">, </span>`. A screen reader now reads "Active, 11".
- Subtitle: "N events. Finished events are in" followed by a `History` link to `/analytics`.
- Empty search: ``Nothing in ${tab label} matches this search.`` (was "No events match this search.").
- Cancel dialog body: "Registrants keep their records and nobody is emailed. The events move to the Cancelled tab." Evidence for "nobody is emailed": `lib/email/*.ts` has no cancellation code (grep, no hit). I did not execute a cancel to see an `email_log` row, so this rests on code reading [R].
- Dialog titles: one event is named (`Delete "Title"?`, `Cancel "Title"?`); several are counted (`Delete 2 events?`). Confirm button labels are unchanged (`Delete 1 event`, `Cancel 1 event`).
- Cancelled cards render Details and Edit only (`grid-cols-2`, same as drafts).
- Footer: "Showing the 300 events with the latest dates. Finished events are in History." Reason: `fetchDecoratedEvents` loads the newest 300 across every status, completed ones belong to no tab, so the old "Older ones are not listed here yet" implied missing events. On the local DB the page shows 18 rows and the footer fires, so the old text was wrong in practice [X].
- `csvEscape`: a cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`; `\r` is now in the quote trigger set. Not opened in Excel [not checked].

**`app/analytics/page.tsx`:** `HISTORY_CAP = 100` replaces the literal; a note renders when the query returns 100.

**Item 5 (`f587bf6`)**
- `ProgrammeEvent` moved to `components/dashboard/programmeEvent.ts`. `WorkstationEvent` was merged into it; `DashboardMetrics`, `ViewMode` and `Segment` had no other users (grep) and went with the file.
- Importers repointed: `EventsHome.tsx`, `EventsHome.test.tsx`, `app/dashboard/data.ts`.
- `data.ts`: removed `countCreditsIssued` (the URL-length fix for the credits tile, unused since the tile went), `registered7d`, `checkedInToday`, the `tz` argument and the `check_in_at` select. `fetchDecoratedEvents` now returns `{ events }`.
- `data.test.ts`: removed the `countCreditsIssued` block (3 tests) and the three-zone `checkedInToday` cases; kept the `dayKey` case as its own describe.
- `app/dashboard/page.tsx`: no longer reads the `eventar-tz` cookie, passes no `key={tz}`.
- Stale comments fixed in `lib/tz.ts`, `app/error.test.tsx`, `components/dialogs/DestructiveDialog.tsx`, `scripts/demo/seed-demo.ts`.
- Plan check before deleting (skill `dead-code-deletion`, step 2): `docs/plans/2026-10-11-mvp-execution-plan.md` lines 62, 110, 295, 307, 311, 319 and `docs/plans/mvp/CX-04.md` name the file only in file-ownership lists and card history, not as a planned building block [R].

**`b951527`:** removed `organiserTz` from `lib/tz.ts` and its test block from `lib/tz.test.ts`. `formatInTz`, `browserTz` and `tzFromCoords` stay (`app/analytics/page.tsx` uses `formatInTz`).

**The cookie finding.** The `eventar-tz` cookie's only writer was a `useEffect` in `DashboardWorkstation` (`document.cookie = eventar-tz=...; max-age=31536000`, then `router.refresh()`). It stopped rendering in `3e94ee6`, so since then cold visits to `/dashboard` have rendered in UTC with nothing to correct them. Nothing reads "today" there any more (the stat row went), so no screen is wrong now, but it was a silent behaviour loss the card did not name. Date labels use each event's own zone, so they were never affected [R].

## Tests [X]

- New in `EventsHome.test.tsx`: cancelled card has no Check-in; empty search names the tab; Cancel dialog names the event and says nobody is emailed; several events are counted; 300-event note shown and absent under 300; CSV prefix for four leading characters (`=HYPERLINK(...)`, `+852 mixer`, `-1 night`, `@cmd`); an ordinary title keeps its comma quoting.
- New in `app/analytics/page.test.ts`: the cap note at 100 rows and none below.
- Tab tests moved from role `tab` to `button` with `aria-pressed`; name regexes now expect "Active, 2".
- Mutation checks: reverting the CSV prefix failed 4 tests; reverting the cancelled rule failed 1.
- The History cap note matcher uses `\s+` because `textOf` splits JSX text around `{HISTORY_CAP}`.

## Checks

| Check | Result |
|---|---|
| Tip gate on `f587bf6` (detached worktree, local stack, RLS on) | tsc 0; eslint 0 errors; vitest 259 files, 2392 tests, all passed; next build 0 |
| Test count vs seq 7 | 2410 of 2411 before; 2392 of 2392 now. Net -18: the workstation tests and 3 `countCreditsIssued` tests and 3 zone cases left, 12 new tests arrived |
| `check:ui-colours` | 3 hits, all `AuthBackdropCard.tsx:51` (was 5; the 2 in the deleted file are gone) |
| `check:ui-primitives` | 5 hits (was 7): `app/account/profile/ProfileClient.tsx:510`, `app/events/[id]/checkin/RosterClient.tsx:486`, `app/settings/OrgOnboardingClient.tsx:120` and `:142`, `components/details/MultiBodyAccreditationWizard.tsx:245`. None in this diff |
| Gate coverage | `b8968a8` is docs only on top of `f587bf6`, so the gate covers what was pushed. `b951527` was NOT run through the tip gate: only tsc 0, eslint on the two files 0, vitest on `lib/tz.test.ts` and `app/dashboard` 22 passed |
| Em-dash scan | The gate script's `rg` returned 127 here (see Gotchas), so the scan did not run there. I scanned the diff with grep: one hit, a test title in `data.test.ts`, fixed |
| Live on :3100 (review mode, `eventar_staff`) | Tabs read "Active, 11 / Drafts, 5 / Cancelled, 2 / Deleted, 2", `aria-pressed` set, no `tablist`; `?tab=cancelled` opens Cancelled, cards show Details and Edit; drafts show Details and Edit; empty search under Drafts reads "Nothing in Drafts matches this search."; Cancel dialog showed the named title and the email line, closed with Keep events, nothing was cancelled; `/analytics` showed 100 rows and the note; screenshot of the Cancelled tab taken |
| Not checked | Dark mode and phone frames of the new states; a CSV opened in Excel; a viewer who is not `eventar_staff`; whether a cancelled event's check-in desk still lists the roster |

## Push [X]

Your go named `b8968a8` in this session. Pre-checks: `git fetch`; `rev-list --left-right --count origin/main...b8968a8` = `0 15`; `merge-base --is-ancestor origin/main b8968a8` true. Ran `git push origin b8968a8:refs/heads/main`: `3dc6b4f..b8968a8`. Afterwards `origin/main` = `b8968a85fdc69893652cc578f59cdc3173bd5c92` and `origin/main...main` = `0 1` (the one commit is `b951527`). Pushing the SHA, not `main`, is what kept `b951527` out.

## Commits

On `origin/main` now: `cf9a2e1` (items 1 to 4, 6), `f587bf6` (item 5), `b8968a8` (docs: PICKS and the seq 7 note).
Local only: `b951527` (organiserTz removal), then this handoff and the PROJECT_STATE pointer.

## Decisions and rulings (all in `docs/plans/mvp/PICKS.md`)

- "Apply all six" 2026-11-01, including item 5 (deletion) which I had held back for your word.
- "remove the cookie" 2026-11-01.
- Recommendation not taken: none this stretch; every recommendation was accepted.

## Gotchas found this session

- **`rg` fails under this shell.** `rtk: search failed: Failed to spawn process: No such file or directory`. Use `grep` or `git grep`. The tip-gate script's em-dash scan uses `rg` and returns 127; the scratchpad copy `tipgate2.sh` has the same fault. Fix it (`git grep` or `grep -E`) before the next tip gate or the scan silently does nothing.
- **zsh aborts the whole command on an unmatched glob** (`app/dashboard/page.test.ts*`), so the greps after it never ran. Quote globs or use `git grep`.
- **BSD `sed -i` needs an empty suffix argument** (`sed -i ''`). A failed `sed -i ... && git commit` chain stops silently before the commit; I used small Python edits instead.
- **Two-commit split of one working tree:** item 5 changed the import line in the same file as items 1 to 4. I committed items 1 to 4 with the old `./DashboardWorkstation` import (so that commit builds alone), then flipped the import and committed item 5. `git commit -- <paths>` committed only those paths and left the staged deletions alone.
- **Stale project skills, not touched** (autoharness-managed, the tree there is dirty): `.claude/skills/eventar-timezone-correctness/SKILL.md:18` still says `fetchDecoratedEvents(supabase, nowMs, staff, tz)` takes the zone as a 4th argument, and `.claude/skills/eventar-live-verify-worktree/SKILL.md` (lines 26 and 27) still describes the `eventar-tz` cookie probe. Both are wrong now. The `.claude/skills` modifications and untracked folders in `git status` are the autoharness run's, not this session's; I staged none of them.
- The earlier `/account/sign-in` empty-card stall on a production build is still unreproduced (carried from seq 6).

## Where we're going

1. Ivan reads §0 (about 3 minutes) and answers any of Decide 1 to 3, or says "UX-02".
2. UX-02 re-cut, then the remaining door copy. Before starting: run `list_sessions` with `linked: true` and search for "UX-02" (skill `parallel-session-card-claim`).
3. Fix the tip-gate script's `rg` call before the next gate.
4. Optional: tell the autoharness owner that the two skills above are stale.

## Files to open first

- `docs/plans/mvp/PICKS.md` (bottom): every ruling, in order.
- `components/dashboard/EventsHome.tsx` and `EventsHome.test.tsx`: the Events home as built.
- `components/dashboard/programmeEvent.ts`: where `ProgrammeEvent` lives now.
- `docs/plans/handoff_20261101-mvp-execution-7.md`: build detail and the backtest write; its §0 is superseded by this file.
