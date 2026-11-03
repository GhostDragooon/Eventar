# MVP acceptance walk, run 2 (2026-11-03): summary

**Verdict: the MVP is NOT done.** Two product decisions are open, one MAJOR has no destination to fix, several rows were not run, and the fixes below are uncommitted and only partly re-walked. Nothing here is committed, staged or pushed.

Tags: [X] executed this run, [R] read in code, [I] inferred. A row without [X] is not a pass. "Agent-run" = rests on a subagent's run only.
Files: `REVIEW-FINAL-organiser.md`, `REVIEW-FINAL-practitioner.md`, `REVIEW-FINAL-dev-r2.md`, `REVIEW-FINAL-backtest-r2.md` (the older `REVIEW-FINAL-*` files from the first walk are untouched). Fix tables: `FIX-event-form.md`, `FIX-dashboard-details.md`, `FIX-account-wizard.md`.
Server: :3100, `EVENTAR_REVIEW_MODE` off (signed-out `/dashboard` gave 307 to `/login`) [X]. Local stack only.

## Checklist ("MVP is done when")

| Row | Status | Evidence |
|---|---|---|
| O1 sign in at `/login`, land on Events, no Programme/Manage | PASSED | [X] redirect, magic link, sidebar Check-in / Events / History / Settings |
| O2 create, Save draft, findable | PASSED with fixed finding | [X] "Draft saved…"; Drafts-tab chip read "Drafted", now "Draft" [X live] |
| O3 agenda, no silent loss | PASSED data, FAILED copy, copy FIXED | [X] 3 in / 3 out, remove, no gap, no dups; error copy fix is unit-tested only [R], not re-walked live |
| O4 publish gate, next action | PASSED | [X] confirm names what goes live, Keep editing changes nothing, status published; body_admin sees "Publishing needs an organiser admin" [X] |
| O5 one Events home | PASSED | [X] |
| O6 Roster vs Check-in split | PASSED | [X] Registrations and Check-in each land on the right page |
| O7 check-in only inside the window | FAILED for speakers | [X] attendee desk: before, inside, after, duplicate all correct, DB read-back. Speaker "Check in" has no window rule: a row was written 31 days early, buttons stay enabled after the event (decision for Ivan) |
| O8 walk-in, source label, no staff identity | PASSED | [X] source walk_in, user_id NULL |
| O9 post-event path | PASSED with MINOR | [X] History to event to exports in 2 clicks |
| ux-member repeat (steps 2-6) | NOT RUN (partial) | [X] sign-in, Settings, Enter-code check-in as member. Create, agenda, publish as member not run |
| ux-body repeat (steps 2, 4) | PARTIAL | [X] step 4 reason shown. Step 2 not run |
| A1 doors from landing and public event | PASSED with findings | Agent-run only |
| A2 sign-up, wizard, land on Registrations | FAILED (open) | [X] lands correctly; wizard dead end fixed (unit-tested, not re-walked live); the wizard cannot be finished without a licence (decision) |
| A3 browse from portal | PASSED | [X] |
| A4 register, "on your record" | PASSED | [X] DB: user_id = auth user |
| A5 record state | PASSED | [X] |
| A6 organiser CTA while signed in | PASSED | [X] honest explanation, still signed in |
| A7 staff on public page | PASSED | [X] guest user_id NULL, no profile under ux-admin/ux-member/ux-body |
| tsc | PASSED | [X] exit 0 |
| eslint | PASSED | [X] 0 errors, 10 warnings |
| vitest `RLS_TESTS=1` | NOT A CLEAN RUN | [X] 2707 of 2708 passed in the full run; the failure (`self_check_in_grant.rls`, "Database error creating new user") passed alone 3/3: a flake, not a clean pass |
| `pnpm test:rls` (two-stage) | PASSED | [X] 43 files / 453 tests + 4 files / 55 tests |
| next build | PASSED | [X] exit 0 (dirty tree, not a clean worktree) |
| check:ui-colours | PASSED | [X] clean |
| check:ui-primitives | FAILED, pre-existing | [X] 4 hits, none in a file I touched: ProfileClient.tsx:510 (at HEAD), OrgOnboardingClient.tsx:120/142, MultiBodyAccreditationWizard.tsx:245. The handoff said 3 |
| gates on a clean worktree at the final HEAD | NOT RUN | nothing is committed, so there is no final HEAD |
| every card committed and pushed | NOT RUN | needs your word |
| PROJECT_STATE, vault, graph | NOT RUN | wait for your rulings |

## What the fix wave changed (uncommitted, 39 modified files + 6 new)
Live re-checked [X]: Events header and Active tab agree ("25 active events"); Deleted tab chip "Deleted"; Drafts chip "Draft"; draft Details shows "Status Draft / Published Not yet" with no timer; Cancel with unsaved changes opens "Discard your changes?" and stays on the page.
Unit-tested, each test failed first, not re-walked live: agenda error names the block and the cause; all missing required fields listed at once; CPD "saves accreditation only" helper line; Venue marked required; wizard required marks and "why Continue is disabled" hint; Sign up link keeps `next`; Registrations deleted-event filter, paging past 1000 rows, filter-aware empty copy; speaker action signed-out message and draft/cancelled/deleted refusal; Settings Team card replaced by an explanation for non-admins; role-lock race migration `20261103100000` (applied locally only, RLS test failed before and passes now).
New copy with an em-dash: "Check-in failed — event not found or not in your organisation." (a reshaped existing message, reported, not rewritten).

## Open, need Ivan
1. **Licence is mandatory to finish the wizard** (MAJOR): "Done" stays disabled until a licence is declared. A practitioner with no licence is locked out. Options: make it skippable, or say it is required up front.
2. **Speaker check-in has no window rule** (MAJOR, known open product call in `speakerActions.ts`): options: same window as attendees, or leave and say so.
3. **Terms of Service and Privacy Policy pages do not exist** (MAJOR): the wizard asks users to accept documents they cannot open; only unreviewed drafts sit in `docs/legal/`. Options: publish reviewed pages, or reword the sentence.

## Deferred (reason)
- DB rule that agenda blocks sit inside the event window (dev m6, backtest MINOR-1): touches `update_event_with_blocks` and existing data.
- Block ids read back by position after save (dev m4): needs an RPC return change.
- `StatusPill` still labels drafts "Drafted" on the edit and account pages (F2 did not own the file).
- Sidebar "ADMIN" label above Settings for a member (MINOR); organiser_member can publish while the stale code comment says owner-only (backtest MINOR-3); `service_role` DELETE on `participation_evidence` (backtest MINOR-4).
- Not run by any lens: `dashboard/data.ts`, export actions, account claim (dev lens gap); `markAttended` over HTTP, forced concurrency (backtest).

## Coverage gaps and honesty notes
- Organiser lens agents reported "dead" controls and a "silent Walk-in" that real clicks did not reproduce (hidden browser pane): #37, #40-#42 are retracted; only #31 (Copy link) stays unresolved.
- Screenshots: all inline only, none on disk.
- Dropdown inputs on the wizard were set with a React-safe setter (real clicks cannot drive native selects in this pane); everything else was real input.
- Fixtures left in the local DB: event 960f8842 ("ZZ-WALK Draft 1", published, now moved into its live window), registrations ZZ Walk Guest 1b / Guest 2 / Walkin 1, practitioner prac02@final.invalid and its registration, and old uxr-* / uxreview2-* fixture rows.
