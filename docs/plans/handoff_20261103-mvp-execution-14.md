# Handoff, 2026-11-03: acceptance walk run 2 done, fix wave pushed; MVP still open on three product decisions

**Date:** 2026-11-03
**Status:** IN PROGRESS. The walk, dev-lens, backtest, fix wave and gates are done and PUSHED (`origin/main` = `db8b829`). The MVP is NOT declared done: three product decisions wait for Ivan, four checklist rows were not run, and the fixes were only partly re-walked live. This handoff file is not yet committed.
**Bead(s):** none (the repo does not use `bd`)
**Chain:** `mvp-execution` seq `14`
**Parent:** `handoff_20261101-mvp-execution-13.md`
**Prior chain:** `handoff_20261031-mvp-execution-4.md` > `-5` > `-6` > `handoff_20261101-mvp-execution-7.md` > `-8` > `-9` > `-10` > `-11` > `-12` > `-13` > this
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first; each needs the before/after shown, standing rule 2026-10-14)
1. **Mandatory licence on the practitioner wizard** (MAJOR, found by execution). On `/account/complete` step 4 the "Done" button is `disabled` until a licence is declared; only the photo says "Skippable". A practitioner with no licence in the list (student, trainee, a body that is not listed) is locked out of the portal with no way forward. Recommend: let "Done" work without a licence, with copy "You can add a licence later from your profile; credit is released only once a licence is declared." Cost: practitioners can reach the portal without a verified licence (the credit engine already needs a licence to award points, so nothing is awarded by mistake). Alternative: keep it mandatory and say so on step 1 of the wizard. The code is in `app/account/complete/CompleteClient.tsx` (Done gate). I did not touch the gate.
2. **Speaker check-in has no window rule** (MAJOR vs O7, a known open product call in the comment of `app/events/[id]/checkin/speakerActions.ts`). Executed: before the window, 31 days early, one click wrote `speaker_checkins` "Speaker A" with `updated_by` = the staff id; the buttons also stay enabled after the event ended. Recommend: use the same window as attendees (opens 60 minutes before the start, closes at the end), reusing `checkInGateMessage`. Cost: a speaker who arrives more than 60 minutes early cannot be ticked. Alternative: leave it and put one line of copy on the Speakers card ("Speakers can be ticked at any time"). I added only the draft/cancelled/deleted refusal, no window.
3. **Terms of Service and Privacy Policy pages do not exist** (MAJOR). The wizard says "By continuing, you accept the current Terms of Service and Privacy Policy." Both names are plain text; there is no `/terms`, `/privacy` or `/legal` route and nothing in `public/`. The only copies are unpublished drafts in `docs/legal/`, whose README says "None of these documents are ready to publish" (solicitor review pending). Recommend: reword the sentence now so it stops implying readable documents ("By continuing you agree to the terms we will publish before launch" is a legal choice: wording is yours), and publish the reviewed pages before Stage 8. Alternative: publish the drafts as they are (not recommended).
4. **Deferred engineering items that need a ruling on scope** (none blocks the walk): (a) a DB rule that agenda blocks sit inside the event window (dev m6, backtest MINOR-1; touches `update_event_with_blocks` and existing rows; Hard rule 8 says form, Zod and DB); (b) block ids read back by position after a save (dev m4; needs `update_event_with_blocks` to return the ids). Recommend: (a) as its own card after the three decisions; (b) fold into the same card.
5. **Carried from seq 13, still open:** the three UX-04 design items (Account tag on linked rows plus the wording of the next step; "No matches." copy and the cancelled-registrant counts that disagree across Details, Check-in and Pass delivery; the 320 px layout); role rights (the role RPCs accept only the creator or Eventar staff while contact edit is org-wide, backtest MINOR-3 also notes an `organiser_member` who is not the creator can publish and a stale comment says owner-only in `app/events/[id]/edit/actions.ts:25`); the email stub-vs-real branch `origin/claude/distracted-haibt-18a25a`; seq 8 Decide 1 and 3 and the five-ruling list in seq 12 §0.

**Execute** (only Ivan, in order)
1. Say "commit" for this handoff and the `PROJECT_STATE.md` pointer, then "push" (push go is per session). Nothing from this handoff is committed.
2. Stop the dev server I left on :3100 (review mode OFF, pid 57078 at the time): `lsof -ti :3100 | xargs kill`. Next 16 allows one server per directory, so stop it before any `next build` or before starting `scripts/demo/dev-local.sh`.
3. Hosted DB: unchanged. Migration `20261103100000_registration_roles_lock_checkin_race.sql` (new this session) and the four older ones from seq 13 are on `main` and applied to the LOCAL stack only. Seoul is not touched; Stage 8 needs your go.
4. Rule on Decide 1 to 3 (one line each is enough).

**Queued for Claude** (no ruling needed)
- Re-walk live the fixes that were only unit-tested: agenda error banner (names the block and the cause), the "Still needed to continue: ..." list on New event, the wizard "why Continue is disabled" hint and `*` marks, Sign up keeping `next`, filter-aware empty copy on Registrations, Settings Team card for a member. Details in "Where We Are".
- Run the two rows that were not walked: `ux-member` steps 2 to 4 (create draft, agenda, publish) and `ux-body` step 2.
- Run the gate chain in a clean detached worktree at the final HEAD (nothing was gated in a clean worktree; see "Evidence & Data").
- `StatusPill` still labels drafts "Drafted" (`components/lifecycle/StatusPill.tsx`, test `StatusPill.test.tsx`): fix label and test together; then delete the draft branch of `components/dashboard/StatusChip.tsx`.
- Fix the tip-gate script's `rg` call (carried from seq 12) and record the `PublishDraftButton.test.tsx` flake as one debt item (skill `eventar-static-gates`).
- After Ivan's rulings: update `PROJECT_STATE.md` with the final HEAD, the vault roadmap note and Decisions Log entries Ivan approves, then `/graphify --update` (never save the manifest if a chunk failed).
- Clean the local fixtures left by the walks (list in "Evidence & Data"), skill `eventar-fixture-leak-cleanup`.

**Other sessions:** `ListAgents` at the start showed four peers: "MVP plan [f76ed7]" idle, "Ivan rulings 2026-11-01 MVP execution [6bdd88]" idle, "MVP acceptance walk and review [b3a5c0]" idle, and "eventar-6d [98e909]" interactive, started 1s before my first call (state unknown). I did not re-check it later. Nothing in the tree or the DB showed a peer writing during the run [X: git status clean outside my paths and `.claude/skills`].

---

## Since Last Handoff

- Seq 13's plan was "restart with review mode off, run plan §8, dev-lens and backtest, fix BLOCKER/MAJOR, then the done-when list". All of it happened except the final list: the MVP is not done.
- No BLOCKER was found. MAJORs found and fixed: agenda save error that names nothing; required fields reported one at a time; silent discard on Cancel; "Drafted" chip on the Deleted tab; "14 events." above an Active tab of 8; draft Details showing "ELAPSED"; wizard dead end (Department required but unmarked, Continue silently disabled); Sign up link losing the event; member Team card leading nowhere.
- The earlier organiser lens claims of dead controls (#37 filter/search, #40 to #42 Walk-in/Enter code "silent") did not reproduce with real clicks in a fronted pane: the pane was hidden (memory `browser-pane-hidden-wake`). Retracted in the summary.
- Seq 13 said `check:ui-primitives` had 3 hits; the live count is 4 (adds `app/account/profile/ProfileClient.tsx:510`, present at HEAD).
- Seq 13's risk "the redirect chain to Registrations was proved in unit tests only" is now closed by execution: real magic link from Mailpit, wizard, landed on `/account/registrations` [X].
- Seq 13's risk "Published next-steps card was not walked live" is closed: "What to do next" card with Share link, Copy link, Open registrations, check-in time [X] (the "Copy link" click failed with "Could not copy the link. Select it above and copy it." in the pane, possibly a clipboard permission; unresolved, see Open Questions).
- Seq 13 Decide 2/3 (UX-04 items, role rights) were not ruled this session.
- Trajectory: on path; the walk converted the "ready to walk" state into a concrete fix list and three product decisions.

## Reference Documents

- `CLAUDE.md` (repo) and `AGENTS.md` (Next 16): project rules, 14-rule behaviour contract, Hard rules 1 to 11.
- `docs/plans/2026-10-11-mvp-execution-plan.md` §8 (the acceptance walk) and §1 (O1 to O9, A1 to A7).
- `docs/plans/DOCTRINE-two-persona-2026-10-30.md` (sidebars: attendee Check-in/Registrations/Events/History/Account; organiser Check-in/Events/History/Settings).
- `docs/plans/mvp/REVIEW-FINAL-summary-r2.md` (checklist table, the authority for status of each row).
- `docs/plans/mvp/REVIEW-FINAL-organiser.md`, `-practitioner.md`, `-dev-r2.md`, `-backtest-r2.md` and the three `FIX-*.md` tables.
- Skills used: `eventar-mvp-acceptance-walk`, `review-agent-budget-line`, `eventar-static-gates`, `eventar-commit-card-groups`.

## The Goal

Prove that both the Organiser and the Practitioner (attendee) side pass the intuitive test on the core paths (four questions at each step: where am I, what is the main thing, how do I progress, how do I get back), then declare the MVP complete only on Ivan's word with every "MVP is done when" row passed. Ivan's end state: no BLOCKER or MAJOR open, gates green on a clean worktree at the final HEAD, every card committed and pushed, `PROJECT_STATE.md`, vault and graph updated. Seoul and Stage 8 stay separate decisions.

## Where We Are

- Pre-flight [X]: HEAD and `origin/main` were `6e8ec7d` (contains `59ffd3d`); personas `ux-admin`, `ux-member`, `ux-body` exist in `staff` (org `00000000-0000-0000-0000-000000000001`, roles organiser_admin / organiser_member / body_admin); `prac01@final.invalid` already existed so the walk used `prac02@final.invalid`. Server started with `EVENTAR_REVIEW_MODE=false scripts/demo/dev-local.sh`; review OFF confirmed because signed-out `/dashboard` returns 307 to `/login?next=%2Fdashboard`.
- Organiser `ux-admin` steps 1 to 8: PASSED on real clicks with DB read-back (details in Evidence). Step 3 data integrity passed, error copy failed (fixed).
- `ux-member`: only sign-in, Settings and the Enter-code check-in were walked; `ux-body`: step 4 walked (reason shown instead of Publish).
- Practitioner steps 1 to 7: PASSED after real wizard completion, with the dead end now fixed in code.
- Dev-lens (`everything-claude-code:code-reviewer`): 0 BLOCKER / 1 MAJOR / 6 MINOR / 6 NIT; file `mvp/REVIEW-FINAL-dev-r2.md`. It hit 47 calls against a cap of 40 and did not reach `dashboard/data.ts`, export actions, account claim, `AccountShell`, `VenueSearchBox`.
- Backtest: 0 / 0 / 4 / 4; file `mvp/REVIEW-FINAL-backtest-r2.md`; every write path behaved as designed except one DB-layer gap (agenda window); teardown proof: all ZZ-BT counts 0, `audit_events` +9 append-only rows.
- Fix wave, three agents with disjoint files, pushed as `3c83dd9` (event form), `8dcab24` (dashboard/details/registrations/speaker/settings), `a0f5729` (account wizard, sign-in link, role-lock migration and its RLS test), `db8b829` (review docs). 39 source/test files changed, 792 insertions and 127 deletions before the docs.
- Live re-check [X]: `/dashboard` header "25 active events." equals the Active tab (25); Deleted tab chip reads "Deleted"; Drafts tab chip reads "DRAFT"; draft Details reads "STATUS Draft / PUBLISHED Not yet" with no timer; Cancel after an edit opens the dialog "Discard your changes? You have changes that are not saved. Leaving now loses them." with "Discard changes" and "Keep editing" and the URL stays on `/edit`.
- Unit-tested only (each test failed on the old code first): agenda error naming, all-missing-fields message, CPD "saves accreditation only" line, Venue `*`, wizard required marks and `ContinueWithHint`, Sign up `next`, Registrations deleted-event filter, `.range()` paging at 1000 rows, filter-aware empty copy, speaker signed-out/draft/cancelled/deleted refusal, Settings Team card.
- Gates on the fixed tree (dirty tree, before the commits) [X]: tsc exit 0; eslint 0 errors and 10 warnings; vitest `RLS_TESTS=1` 283 files, 2707 passed and 1 failed (`tests/rls/self_check_in_grant.rls.test.ts`, "Database error creating new user"), which passed 3/3 alone: a flake, so not a clean full run; `check:ui-colours` clean; `check:ui-primitives` exit 1 with 4 hits all pre-existing; `next build` exit 0; `pnpm test:rls` two-stage 43 files / 453 tests + 4 files / 55 tests, exit 0.
- Server left running on :3100 (review mode OFF). Fixture event `960f8842-f0f0-4448-9573-a2a71a68dcd2` was last set to state `inside` (live) with `walk-window.sh`.
- Em-dash scan on added copy: one new-copy hit, `'Check-in failed — event not found or not in your organisation.'` in `speakerActions.ts` (a reshaped existing message that had an em-dash). Reported, not rewritten (Decisions Log Q41 says no em-dashes in new copy; the old copy had it).

## What We Tried (Chronological)

1. **Four organiser lens dispatches to walk steps 1 to 3 (agent, 40-call cap each).** Hypothesis: an agent can walk create/agenda. Result: A1 skipped the venue picker because my brief said to skip the slow geocoder; Nominatim is reachable (HTTP 200), so my instruction was wrong. Resume 2 used the picker (results about 4.5 s after the last keystroke, only "Searching…" while waiting). Lesson: do not tell a lens to skip a widget that the happy path needs; the venue is required and there is no manual entry fallback.
2. **Agents drove the pane with synthetic events.** `read_page` and `find` returned empty because the pane was hidden (`tabs_context` said "The Browser pane is currently hidden"). Consequence: three false "dead control" MAJORs (#37, #41, #42) and a false "silent Walk-in" (#40). Fix attempted: `tabs_select` plus `mcp__ccd_view__show_pane preview`; the status stayed "hidden" but reads worked from my own context. The briefs then said "tabs_context, tabs_select, one screenshot, real clicks only". Result: lens 4 got real trees, but still ran out of calls.
3. **Orchestrator takes over the critical steps.** After six agent dispatches (about 240 calls) steps 6 to 8 were still unwalked, so I walked steps 6, 7, 8 and the member/body/practitioner checks myself with `browser_batch`-style real clicks, `get_page_text` and `javascript_tool` reads, and psql. This is what produced the verified evidence below. Agents are good for reading, bad for dropdowns and for staying inside a 40-call cap.
4. **Fixture window script.** Needed three time states without waiting: `walk-window.sh before|inside|after` updates `events.start_time/end_time` and `event_occurrences.starts_at/ends_at` in one transaction for fixture event `960f8842-…` (the `event_occurrences` exclusion constraint requires both). Worked on the first try.
5. **Closed-desk speaker write found by SQL, not by the lens.** The lens could not confirm any write (its psql read-back was lost in a combined shell call). I ran `select count(*) from speaker_checkins where event_id = …`: 1 row, "Speaker A", `checked_in_at 2026-11-03 01:18:16+00`. Then read `speakerActions.ts` and found the author's comment that the missing window rule is "an open product call, not an oversight". So it is a decision, not a bug I should silently fix.
6. **Walk-in "silent" claim refuted.** Clicking "+ Walk-in" while the check-in is closed opens a panel under the control row with the red text "Check-in has not opened yet. It opens 60 minutes before the event starts." plus a "Register & check in" button. The lens saw nothing because the pane was hidden.
7. **Practitioner wizard.** Agent 1 reported a silent dead end at Professional. I checked the DOM: "Continue" is `disabled=true`, Department is `required: true` but unmarked; typing "Cardiology" with real keys enabled it (`dis=false`). Real bug, MAJOR S2-5. Then the Licence step: "Done" disabled until a licence is declared (S2-9, decision). Native `<select>` dropdowns could not be driven by real click or keyboard in this pane, so Profession/Specialty/Position/Accrediting body were set with the React-safe native setter (`Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set` then a bubbling `change`). Everything else was real input.
8. **Member create/publish attempt.** On `/events/new` as `ux-member` the pane rendered a blank white band after scrolling and `find` returned nothing for the venue results; I stopped (budget) and recorded steps 2 to 4 as NOT RUN for the member rather than faking a pass.
9. **Backtest design.** The backtest agent POSTed real Server Actions with real cookies for walk-in, speaker, registration, publish, `updateEvent`, `createEvent`, and called `mark_attended`, `set_registration_role`, `update_registration_contact`, `update_event_with_blocks` as SQL under JWT claims (the email claim is required). Server-action Zod, rate-limit and credit-award layers were read, not executed.
10. **Fix wave split by file ownership.** Three agents, disjoint files, no git, no browser, only touched-file vitest and tsc. Each was told to quote the old copy, add a test that fails on the old code, and write a before/after table (`FIX-*.md`). All three reported failing-first checks (F1 reverted each fix in place and counted failures: forced-visible blocks 1, old agenda message 5, one-at-a-time 3, Cancel 3, Venue marker 1, server `block N` 5, CPD helper 2).
11. **F1 timezone line left alone.** I suggested changing "Times are in your local timezone" before a venue is picked; F1 read `DateTimeSection` and found typed times really are read in the browser zone (`new Date(\`${date}T${hh:mm}:00\`)`), so my wording would be false. Making typed times follow the venue zone is a product decision, not copy. Left unchanged.
12. **Gates.** Stopped my :3100 server first (it shares `.next` with `next build`), ran tsc, eslint, vitest, the two `check:ui-*` and `next build` in one background script with a sentinel, then `pnpm test:rls` separately (never with the build). Isolated the vitest flake by rerunning that one file.
13. **Commit and push.** Four pathspec commits (counts 13, 16, 7, 5 matched the staged lists), `.claude/skills` peer files left out; `git fetch` showed `origin/main` still `6e8ec7d`; `git push origin db8b829:main` fast-forwarded. Not run: `tsc` per commit (the three code commits touch disjoint files, but each SHA was not compiled alone).

## Key Decisions

- **"Fix" was Ivan's word; "commit" and "push" were separate words.** His mid-turn message ("leave no stones unturned, check every button, every tab, walk through it as a user not as a dev. fix all the issue found") released fixes into the working tree. I committed only on "Commit fixes" and pushed only on "Push".
- **Design-choice items and product calls were not applied.** Licence gate, speaker window, Terms pages stay Ivan's. Frontend changes applied were mechanical (copy, state, behaviour using existing components); each has a before/after row in a `FIX-*.md`. Rejected: hiding the "ADMIN" sidebar label, changing `StatusPill` (not owned by the fixing agent), changing the timezone line.
- **Speaker action: refuse draft/cancelled/deleted, add no window.** Reason: the author flagged the window as an open product call; adding it would be me deciding it.
- **Team card for members: replace with a sentence, no link.** Copy: "Only organiser admins can invite teammates. Ask an admin of your organisation." The destination `/settings/team` shows a member only their own row.
- **Role-lock race fixed in the DB, not the UI** (rule 14: a control one layer above the write is the recorded failure class). Migration reads the registration `for no key update of r`, refuses when `status = attended` or a `registration_checkins` row exists (22023 `role_locked_attended`), keeps SECURITY DEFINER, `search_path`, grants and the audit insert last, has a self-assert and is replay-safe. Residual gap recorded by the agent: a check-in inserting its row after the read and commit is not blocked, because the FK takes only KEY SHARE on `registrations`; `update_registration_contact` has the same limit.
- **Review file names.** The first walk's `REVIEW-FINAL-dev.md`, `-backtest.md`, `-organiser-user.md`, `-practitioner-user.md`, `-summary.md` are committed history, so run 2 wrote `-dev-r2`, `-backtest-r2`, `-summary-r2` and new `REVIEW-FINAL-organiser.md` / `-practitioner.md` instead of overwriting.
- **Where an agent's claim and my execution disagreed, execution won and the file says so.** The organiser file keeps the agents' original text and my "ORCHESTRATOR WALK" sections on top; the retracted items are listed in the summary.
- **Handoff location and format follow the Eventar rule, not the generic handoff skill:** `docs/plans/handoff_YYYYMMDD-<slug>.md`, §0 first, linked from `PROJECT_STATE.md`.
- **Not done on purpose: `PROJECT_STATE.md`, vault, graph rows** (checklist "NOT RUN") until Ivan rules on the findings, per the acceptance-walk skill. Only a pointer line is added for this handoff.

## Evidence & Data

### Walk results by step (admin = `ux-admin`)

| Step | Result | Evidence |
|---|---|---|
| O1 sign-in | PASS | `/dashboard` signed out gives 307 to `/login?next=%2Fdashboard`; magic link lands on `/dashboard`; sidebar Check-in / Events / History / Settings plus Sign out |
| O2 create + Save draft | PASS | "Draft saved. Review and publish when you are ready."; row: status draft, 2026-12-04 01:00Z to 04:00Z (09:00 to 12:00 HKT), Asia/Hong_Kong, Hong Kong Convention and Exhibition Centre |
| O3 agenda | data PASS, copy FAIL (fixed) | `agenda_blocks`: 3 rows (Lecture 09:00-09:45 order 0, Keynote 10:00-10:30 order 1, Panel 11:00-11:45 order 2), no dups; after removing Panel 2 rows order 0 and 1, no gap; out-of-window and end-before-start blocks refused, nothing written |
| O4 publish | PASS | only Publish is the "Ready to publish?" block at the bottom of Edit; confirm names registration page live, "Registration opens now", check-in time; "Keep editing" left status draft and `updated_at` unchanged; confirm gave status published; Details "What to do next" card |
| O6 split | PASS | Events row to `/events/<id>/details`; "Registrations" to `/events/<id>/registrations`; "Check-in →" to `/events/<id>/checkin`; neither lands on the other |
| O7 window | PASS (attendees) | before: "NOT OPEN YET · Starts in 2h 57m", Scan/Enter code/row Check in disabled, Walk-in refuses, 0 checkins; inside: wrong code "Code not recognised.", `MG6GNG` "Checked in" + toast, repeat "Already attended at 03 Nov 2026, 09:24."; after: "CLOSED · Ended 1h ago · Check-in is closed. This event has ended." all disabled |
| O8 walk-in | PASS | row `zzwalkin1@final.invalid`: source `walk_in`, status attended, `check_in_method manual`, `user_id` NULL, `profile_snapshot` NULL; staff id `484c8efb-14e2-4940-a40d-289ba3b75edd` and auth id `dcabf588-bc58-4e1b-b6a0-1315fe1b2c3d` appear nowhere |
| O9 post-event | PASS (MINOR) | History (`/analytics`) to event Analytics "2 of 3 registered attended · 0 of 2 responded (0%)" + Export CSV (1 click); "Back to Event" to Details with "Export evidence (JSON + CSV)", "Export College package (CSV)", "Export attendance evidence (CSV)" (College needs posted credit) |
| ux-member | PARTIAL | check-in by code `ZZWK22` as a member worked ("Checked in · ZZ Walk Guest 2 is checked in.", toast "Marked ZZ Walk Guest 2 attended (ZZ-WALK Draft 1)."); Registrations Edit opens, no role chips; steps 2 to 4 NOT RUN |
| ux-body | PARTIAL | Events home shows "New event" and Edit on events they did not create; Edit page: "Publishing needs an organiser admin / Your role can't publish events. / Save your changes, then ask an organiser admin to publish."; CPD: "Your role can't set accreditation. An organiser admin can add or change it from this page." |

### Practitioner (`prac02@final.invalid`, auth id `dbf5b630-f903-459d-8f27-4e0701c30d27`)

| Step | Result | Evidence |
|---|---|---|
| A1 doors | PASS (agent-run only) | landing to Upcoming events to "ZZ-FINAL member c1" (`/events/ee926641-01e0-494d-b261-20b70918e787`) to "Log in or sign up first" to sign-in to "Sign up"; landing has "Log in", "Sign up", "Start an Event", "For organisers" |
| A2 sign-up to home | PASS after wizard | link opened in the same tab, wizard, Done to `/account/registrations`, sidebar five links plus Sign out, no Organiser/Programme/Manage/Roster/Participants/Start an Event text; empty state "Nothing here yet · You are not registered for any upcoming events. Past events are in History." + "Find events" |
| A3 browse | PASS | `/events` keeps the portal sidebar with "Events" lit; the event page itself drops the sidebar for a top bar ("Upcoming events", "Account") with "← Back to my registrations" |
| A4 register | PASS | "YOU'RE REGISTERED · See you on the day"; "You are registered. It is under Registrations." + link; DB: one row, status registered, source self_registration, `user_id` = dbf5b630-… |
| A5 record | PASS | card "Upcoming · ZZ-FINAL member c1 · 04 Dec 2026, 09:00 (GMT+8) · Check-in opens at 04 Dec 2026, 08:00 (GMT+8)" + "Find more events" |
| A6 organiser CTA | PASS | "Start an Event" to `/login?next=/events/new` shows "You're signed in as prac02@final.invalid. Organiser log in is for organiser emails only. Attending events? Your account is below. Invited as an organiser? Open the invite link your admin sent you." with "Back to my registrations" and "Sign out and use another email" |
| A7 staff on public page | PASS | public page says "You're signed in as an organiser. This creates a guest registration."; guest `zzwalk1@final.invalid` and `zzwalk2@final.invalid`, walk-in `zzwalkin1`: `user_id` NULL; no `professional_profiles` row and no registration under ux-admin, ux-member or ux-body |

### Findings by lens (counts after retractions)

| Lens | BLOCKER | MAJOR | MINOR | NIT | File |
|---|---:|---:|---:|---:|---|
| Organiser (agents, incl. conditional) | 0 | 14 listed, 4 retracted by execution | 21 | 9 | `mvp/REVIEW-FINAL-organiser.md` |
| Organiser orchestrator (steps 6 to 9, member, body) | 0 | 2 (speaker window; member Team card) | 4 | 1 | same file |
| Practitioner (agents + orchestrator) | 0 | 4 (S1-2, S2-1, S2-5, S2-9) | 8+ | 4 | `mvp/REVIEW-FINAL-practitioner.md` |
| Dev-lens | 0 | 1 (agenda error, M1) | 6 | 6 | `mvp/REVIEW-FINAL-dev-r2.md` |
| Backtest | 0 | 0 | 4 | 4 | `mvp/REVIEW-FINAL-backtest-r2.md` |

### The four sample MAJORs that were fixed (before to after)

| Finding | BEFORE | AFTER |
|---|---|---|
| Agenda error | "Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title)." for every cause, sometimes with no highlighted block | message built from the first failing block, naming it (title and times) with one sentence per cause (end after start, inside the window, title, topic needs a title and a speaker); every block's errors forced visible after a refused save |
| New event required fields | "Add the event basics (name) to continue." then "Pick a venue from the dropdown to continue." one at a time | "Still needed to continue: event name, venue, date, start time, end time." (lists only what is missing); "The end time must be after the start time." |
| Events header | "14 events." above Active tab 8; footer "Showing the 300 events…" | "N active events."; footer "Only the 300 events with the latest dates are loaded, so older ones may be missing here." (shown only at 300 or more) |
| Wizard Professional | pale "Continue", no message, Department required but unmarked | `*` on required labels (`aria-label="required"`), "Add your department to continue." beside the button; Licence step "Choose an accrediting body and add your licence number to declare." and "Declare a licence to finish." (gate itself unchanged) |

### Gates (fixed tree, dirty checkout, before commit)

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm exec eslint .` | 0 errors, 10 warnings (0 errors; 5 warnings fixable) |
| `RLS_TESTS=1 pnpm exec vitest run` | 283 files; 2707 passed, 1 failed (flake, 3/3 alone) of 2708 |
| `pnpm test:rls` | 43 files / 453 tests, then 4 files / 55 tests; exit 0 |
| `pnpm check:ui-colours` | exit 0 |
| `pnpm check:ui-primitives` | exit 1, 4 hits: `app/account/profile/ProfileClient.tsx:510` (also at HEAD:510), `app/settings/OrgOnboardingClient.tsx:120` and `:142`, `components/details/MultiBodyAccreditationWizard.tsx:245`; none in a file I changed |
| `pnpm exec next build` | exit 0 |
| Baseline for comparison | seq 13: vitest 218 files, 1948 passed, 545 skipped (unflagged); RLS 47 files, 502 passed; this run's counts differ because the tree grew since and the run was RLS-flagged |

### Commits pushed (`6e8ec7d..db8b829`)

| SHA | Group | Files |
|---|---|---:|
| `3c83dd9` | event form | 13 |
| `8dcab24` | dashboard, details, registrations, speaker, settings | 16 |
| `a0f5729` | account wizard, sign-in link, role-lock migration + RLS test | 7 |
| `db8b829` | review docs | 5 |

### Agent calls and caps (judge by the notification, not the agent's tally)

| Dispatch | Cap | `tool_uses` | Outcome |
|---|---:|---:|---|
| Organiser 1 to 3 | 40 | 25 | partial (stopped in step 2) |
| Organiser resume 2 | 40 | 24 | step 2 PASS; step 3 not walked |
| Organiser step 3 | 40 | 38 | PASS data, FAIL copy; not signed out |
| Organiser 4 to 5 | 40 | 42 | step 4 PASS, step 5 incomplete |
| Organiser step 5 rest + 6 | 40 | 42 | inconclusive (hidden pane) |
| ux-member | 40 | 42 | only step A |
| Practitioner 1 to 4 | 40 | 40 | A1 PASS, A2 incomplete |
| Practitioner resume | 40 | 82 total in that agent | wizard stuck (synthetic selects) |
| Dev-lens | 40 | 47 | 0/1/6/6 |
| Backtest | 40 | 39 | 0/0/4/4 |
| Fix F1, F2, F3 | 60 | 39, 45, 28 | all done |

### Fixtures left in the LOCAL DB (clean with `eventar-fixture-leak-cleanup`)

- Event `960f8842-f0f0-4448-9573-a2a71a68dcd2` "ZZ-WALK Draft 1" (published; times moved by `walk-window.sh`, last state `inside`), 2 agenda blocks, `speaker_checkins` "Speaker A", registrations ZZ Walk Guest 1b (`MG6GNG`, attended), ZZ Walk Guest 2 (`ZZWK22`, seeded by SQL, attended by the member check-in), ZZ Walk Walkin 1 (`BX2RUH`), checkin and evidence rows (hash-chained `participation_evidence` has an FK from registrations: delete the evidence tail as superuser in a transaction first).
- `prac02@final.invalid` auth user, its `users` and `professional_profiles` rows, VSB licence `M00002`, registration to "ZZ-FINAL member c1" (`ee926641-…`).
- Older review fixtures that pre-date this run: `uxr-guest2@eventar-review.invalid` (has a `professional_profiles` row though it is in `staff`), `uxreview2-nobody@eventar-review.invalid` (owns one registration), `prac01@final.invalid`. Not produced by this walk; they are why "no practitioner data under a staff UUID" needs the per-persona query, not a global one.
- The RLS suite itself leaks "… DELETE ME …" and "Eligibility Fixture" events into History; the History list showed 100 fixture events with the real event first (newest).
- Scratchpad helpers (session-scoped, will not exist next session): `walk-window.sh`, `maglink.sh`, `gate.sh`, `rls.sh` under `/private/tmp/claude-501/-Users-ivan-Eventar/dfc95f9e-1b26-4369-948d-00ed32cdc109/scratchpad/`. Recipes in the Quick Start.

## Code Analysis

- `components/event-form/AgendaSection.tsx`: new `agendaProblem(...)` builds the sentence for the first failing block in start order; `showAllErrors` prop forces red on every block after a refused save (before: `touched` started empty at line ~184 so untouched blocks showed nothing).
- `app/events/new/NewEventForm.tsx` and `app/events/[id]/edit/page.tsx`: Cancel confirms through the shared `Dialog` (same component as the Publish confirm); no dialog when nothing changed or the change was typed back. The shared `Dialog` focuses its close X on open, not "Keep editing" (not changed).
- `app/events/new/schema.ts`: `blockZodErrors`; `app/events/new/actions.ts` and `app/events/[id]/edit/updateAction.ts`: server messages now `Agenda block "Late talk" (end_time): Block end must be after start` instead of "block N" (N was the position in the start-sorted list, which the two-list screen does not show). DB error mapping untouched.
- `app/events/[id]/checkin/speakerActions.ts`: `toggleSpeakerCheckin` now uses the signed-out sentence shared with `markAttended` (duplicated: `checkin/actions.ts` keeps its copy private; move both into `lib/` when one person owns both files); refuses draft, cancelled or deleted events before any speaker read or write using `checkInGateMessage`; RLS-hidden event returns the same "Check-in failed — event not found or not in your organisation."; policies are organisation-member, not owner-only (stale comment fixed).
- `app/events/[id]/registrations/page.tsx`: `.is('deleted_at', null)` on the event query; roster and roles read page through `.range()` in pages of 1000 with a stable name-then-id order; page size assumes `supabase/config.toml` `max_rows = 1000` and must follow it.
- `components/dashboard/EventsHome.tsx`: `counts.active` replaces `total` in the header; `FETCH_CAP = 300` footer condition is `events.length >= FETCH_CAP`; new `components/dashboard/StatusChip.tsx` wraps `StatusPill` (not owned) to print "Deleted" and "Draft".
- `components/details/LiveScoreboard.tsx`: a draft prints `STATUS Draft` / `PUBLISHED Not yet`, no bar, no ticking; the survey cell reads "Not armed / after you publish"; `FeedbackSection` is not rendered for a draft.
- `app/account/complete/CompleteClient.tsx`: `FieldGroup` takes `required`; `ContinueWithHint` prints the missing-field reason; Declare/Done hints. The Done gate (`disabled` until a licence is declared) is unchanged.
- `app/account/sign-in/page.tsx:69`: "Sign up" link is `/account/sign-up?next=<encoded>`, value from `attendeeNextPath` (`safeNextPath` plus `classifyPath === 'attendee'`); a hostile `next` yields the bare `/account/sign-up`.
- `supabase/migrations/20261103100000_registration_roles_lock_checkin_race.sql`: redefines `set_registration_role` and `remove_registration_role`; grants after apply: postgres, authenticated, service_role (as before). `service_role` cannot insert into `registration_checkins`, so the RLS race test inserts the row with `sqlSuperuserQuery`.
- Dev-lens facts worth keeping [R unless marked]: Hard rule 11 holds for the audited tables across the four roles [X, read-only SQL]; publish is atomic and saves and publishes serialise by row lock; double check-in is stopped by a unique constraint; the check-in window uses absolute times; times typed in forms are read in the browser zone on purpose; capacity counts cancelled registrations and the capacity check precedes the insert so two desks can both pass (pre-existing, not counted); the audit rows of the role functions record the acting staff member's organisation, not the event's (wrong only when Eventar staff act across organisations).
- Backtest facts [X]: `mark_attended` before the window returns `not_open_yet`, after `closed`, inside `ok`, second call `already`, body_admin gets 42501, another organisation's staff gets `not_recognised`; walk-in refused before and after the window with no `registrations` insert (count stayed 4); duplicate email refused; staff-session and body_admin registration leave `user_id` NULL and create no `professional_profiles` row; a failing agenda payload rolls back completely; edits to a published event's agenda are refused by the trigger; two concurrent organiser_admin publishes gave one `event_published` audit row; contact edit by a non-creator organiser_member succeeds and the audit payload holds sha256 hashes only; role set by a non-creator gives `not_owner`; role after attendance gives 22023 `role_locked_attended`.

## Files Changed

### Source code
- `components/event-form/AgendaSection.tsx`, `components/event-form/VenueSection.tsx`, `app/events/new/{NewEventForm.tsx,actions.ts,schema.ts}`, `app/events/[id]/edit/{page.tsx,updateAction.ts}`: event form fixes.
- `components/dashboard/EventsHome.tsx`, `components/dashboard/StatusChip.tsx` (new), `components/details/LiveScoreboard.tsx`, `app/events/[id]/details/page.tsx`: chips, header, draft Details.
- `app/events/[id]/registrations/{page.tsx,RegistrationsClient.tsx}`, `app/events/[id]/checkin/speakerActions.ts`, `app/settings/page.tsx`: registrations, speaker action, Team card.
- `app/account/complete/CompleteClient.tsx`, `app/account/sign-in/page.tsx`: wizard and sign-in link.
- `supabase/migrations/20261103100000_registration_roles_lock_checkin_race.sql` (new, local only).

### Tests
- New: `components/details/LiveScoreboard.test.tsx`, `app/settings/page.test.tsx`.
- Extended: `NewEventForm.test.tsx`, `schema.test.ts`, `createEvent.test.ts`, `updateAction.test.ts`, edit `page.test.tsx`, `EventsHome.test.tsx`, details `page.test.ts`, registrations `page.test.tsx` and `RegistrationsClient.test.tsx`, `speakerActions.test.ts`, `CompleteClient.test.tsx`, sign-in `page.test.tsx`, `tests/rls/multi_body_accreditation_crud.rls.test.ts` (race case: a check-in row exists but status still `registered`; it failed before the migration, 16/16 after).

### Data & results
- `docs/plans/mvp/REVIEW-FINAL-{organiser,practitioner,dev-r2,backtest-r2,summary-r2}.md`, `docs/plans/mvp/FIX-{event-form,dashboard-details,account-wizard}.md`.

### Config
- None changed. Dev server env: `EVENTAR_REVIEW_MODE=false` for the run.

## User Feedback & Preferences (Ivan, this session)

- Kickoff brief (verbatim intent): local stack only on :3100; never `.env.local`, never Supabase/Vercel MCP, never Seoul; review mode OFF; never git commit/push/stage/db push without his word; one browser agent at a time (tabs share cookies); separate user-lens agents per persona with a budget; findings only in `docs/plans/mvp/REVIEW-FINAL-*.md` ranked BLOCKER/MAJOR/MINOR/NIT; "Do not declare the MVP complete yourself" and give the "MVP is done when" checklist marked passed / failed / not-run; stop after the checklist.
- Mid-turn: "leave no stones unturned, check every button, every tab, walk through it as a user not as a dev. fix all the issue found." Read as: widen the click coverage and release fixes into the tree; it did not release commit or push.
- "Commit fixes" then "Push": each is its own word; I asked before each.
- Standing rules that applied: frontend review findings show the difference and Ivan decides; when skills or agents disagree give at least 3 options; investigate before escalating (rule 14): the speaker window was investigated to its source comment before being presented; surface conflicts, do not average them: the agents' "dead control" claims versus my executed result are stated side by side in the file.
- Output style carried from earlier sessions: caveman, ADHD mode (lead with the next action, one next step), ponytail (smallest change at the root).
- Process preference restated by the skills: the Budget line on every review dispatch (cap at 40 or less, scope, screenshots clause, partial findings at the cap).

## Where We're Going

1. Ivan rules on Decide 1 to 3 (licence, speaker window, Terms), then Claude applies the chosen version as a card (licence gate in `CompleteClient.tsx`; speaker window in `speakerActions.ts` plus `SpeakersCard`; Terms copy or pages).
2. Re-walk live the unit-tested-only fixes and walk the not-run rows (`ux-member` steps 2 to 4, `ux-body` step 2), with the fronted pane and real input, ideally the orchestrator driving.
3. Gate chain in a clean detached worktree at the final HEAD (tsc, eslint, `RLS_TESTS=1 vitest`, `next build`, `check:ui-*`, two-stage `test:rls`), following `eventar-static-gates` (take `scratch-demo/locks/test-rls.lock`, clone `node_modules` with `cp -Rc`, trap-clean).
4. After rulings: `PROJECT_STATE.md` final HEAD, vault roadmap note and Decisions Log entries, `/graphify --update`; then produce the final "MVP is done when" list. Seoul and Stage 8 stay separate decisions.

## Risks & Blockers

- Agents cannot reliably drive native `<select>` or run long form flows in the pane; plan for the orchestrator to drive dropdown-heavy steps (wizard, New event) or for a human to finish them.
- Browser pane "hidden" state: `read_page` is empty for 3 to 4 s after every navigation in dev (compile), and empty permanently when the pane is hidden. Wake with `tabs_select` and one screenshot; wait 3 s after navigation.
- Local DB is crowded with fixtures; History caps at 100 and Events home loads 300 rows, so a real event can be hidden by fixtures if it is old. Clean before the next walk.
- The role-lock migration is applied locally only; `supabase migration up --local` applies every pending local migration. The hosted apply is Stage 8 (`supabase db push --linked`, with Ivan's go).
- The gate counts above come from a dirty tree before the commits; the clean-worktree run is still owed.
- Concurrent agents on one DB: never run `test:rls` while a browser or backtest agent is writing; the full-run flake in `self_check_in_grant.rls.test.ts` ("Database error creating new user") appears under load.

## Open Questions

- "Copy link" on the Published next-steps card failed with "Could not copy the link. Select it above and copy it." in the pane (finding #31). Is that clipboard permission in the pane only? Unresolved: needs a real browser.
- Should the landing header show the signed-in account (it shows "Log in" and "Sign up" while signed in as a practitioner)? MINOR; not ruled.
- Should a signed-in practitioner be able to cancel a registration? The success card says "Need to cancel? See event staff at check-in — this browser tab is your proof of registration." (MINOR).
- `service_role` keeps DELETE on `participation_evidence` and full DML on `speaker_checkins` (RLS-gated); the backtest asks whether that is intended and whether speaker toggles leave an audit row (not verified).
- `/events` as an honoured `next` (carried from seq 13).

## Quick Start for Next Session

```bash
cd /Users/ivan/Eventar
git status -sb && git log --oneline -8
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '      # a review-OFF server may still be on :3100
sed -n 1,80p docs/plans/mvp/REVIEW-FINAL-summary-r2.md           # the checklist and the open items
supabase status | head -5                                        # local stack up?

# start the walk server (review OFF) only after stopping any server on :3100
EVENTAR_REVIEW_MODE=false scripts/demo/dev-local.sh

# magic link for a persona (local Mailpit on :54324)
curl -s http://127.0.0.1:54324/api/v1/messages | python3 -c "import json,sys; d=json.load(sys.stdin); print([m['ID'] for m in d['messages'] if any('ux-admin@' in t['Address'] for t in m['To'])][0])"
# then GET /api/v1/message/<id> and open the verify link in the SAME browser tab (PKCE)

# local DB read-back
/opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

# gates (env from `supabase status -o env`: API_URL, ANON_KEY, SERVICE_ROLE_KEY as NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY; refuse unless 127.0.0.1)
pnpm exec tsc --noEmit && pnpm exec eslint . && RLS_TESTS=1 pnpm exec vitest run && pnpm exec next build
pnpm test:rls                                                    # never together with next build
```

Key files to read first: `docs/plans/mvp/REVIEW-FINAL-summary-r2.md`, `app/account/complete/CompleteClient.tsx` (licence gate), `app/events/[id]/checkin/speakerActions.ts` (window rule), `docs/legal/README.md` (Terms drafts), `docs/plans/mvp/FIX-*.md`.
Evidence: `docs/plans/mvp/REVIEW-FINAL-organiser.md` (agent text plus "ORCHESTRATOR WALK" sections), `-practitioner.md`, `-dev-r2.md`, `-backtest-r2.md`.
Window fixture helper (recreate if the scratchpad is gone): update `events.start_time/end_time` and `event_occurrences.starts_at/ends_at` for event `960f8842-f0f0-4448-9573-a2a71a68dcd2` in one transaction (before: start now()+3h; inside: start now()-30m, end now()+3h; after: start now()-5h, end now()-1h).
Next action: ask Ivan for a one-line ruling on Decide 1 to 3, then run the "Re-walk live" item from §0.

## Gotchas

- A busy-looking `Compiling…` pill in the pane means dev compile; wait 3 s before reading.
- `find` returns the visible label only, so a button whose accessible name is its reason ("Check-in has not opened yet…") can look different from its text; read `disabled` with `javascript_tool`.
- Sidebar "Sign out" is a button with no accessible name (ref-clicks by `find` return a generic element): click it through `javascript_tool` (`[...document.querySelectorAll('aside button')].find(x=>/sign out/i.test(x.textContent)).click()`), then confirm by loading `/login`.
- `speaker_checkins` rows survive a window change; speaker toggling writes `updated_by = staff.id`.
- zsh: `GIT_LITERAL_PATHSPECS=1`, quoted bracket paths, arrays not word-split variables; no `timeout`; `grep` not `rg`.
- The review Budget gate rejects a review Agent call without `Budget: max N tool calls; scope = ...; prefer read_page/get_page_text over screenshots; report partial findings at the cap.` Build agents were accepted at 60.

## MINOR and NIT findings NOT fixed (so the next session does not re-derive them)

Organiser (agents, plus mine):
- Events footer note and History: History caps at 100 ("Older ones are not listed here yet.") with no search or paging; every History row shows "0 responses".
- Venue is a hard dependency on a public geocoder (Nominatim): the picker shows only "Searching…" for about 4.5 s; zero-result and geocoder-down behaviour were NOT tested, so "no manual entry fallback" is unverified.
- End picker lists times earlier than the start, so "End must be after Start." appears only on Save.
- "Draft saved. Review and publish when you are ready." appears twice in the page text.
- Sidebar identity block differs between pages ("UX" initials on Events home, "ux-admin" on `/events/new`); a dev banner "Email delivery: development stub (no inbox)." shows on organiser and practitioner pages; fixture CPD bodies (RLS-*) appear in dropdowns (local data).
- The Check-in sidebar list showed 7 desk links for 8 events.
- Publish confirm does not list venue or agenda, and does not say unsaved edits are excluded; Publish is a one-way door ("Details cannot be edited after publishing yet").
- Public event page as staff: only way back is the header "Events" link; no explicit "back to event manager".
- Registrations: "No matches." for both a filter and a search (fixed: now filter-aware); no export button on the page.
- Closed desk: the disabled "Scan badge" looks like a pale primary button while "Enter code" is grey; the per-row muted "Check in →" does not say when check-in opens; Walk-in panel opens under the control row and is easy to miss on a short screen.
- Details: "survey Armed · fires 10 min after end" still shows an hour after the end with "Survey invite 0 sent" (cron is Stage 8); History to College export is 2 clicks but the Analytics page does not link to it.
- Settings: sidebar label "ADMIN" above Settings for a member; `/settings` has no tabs.
- Edit page: Block REMOVE deletes instantly (permanent only after Save); the tab-close `beforeunload` warning was not tested; hero image, category, hosted/organised by, max attendees, registration open/close pickers, CPD Save, Save & Preview, breadcrumb, "Configure multiple accrediting bodies →", Break blocks were NOT clicked by any lens (coverage gap).

Practitioner:
- Landing: "Start an Event" is the most prominent button (organiser language at the practitioner's first door); second hero tab has no accessible name; public Events list has no "Sign up" link, only "Log in" and "Organiser log in".
- Event page "Log in or sign up first" goes to Log in only (needs a second click; `components/RegisterCard.tsx:301` `signInHref`, not changed: Sign in now carries `next`).
- Wizard: only exit is "Sign out" (no link back to the site or the event); two controls labelled "Specialty" before a profession is chosen (dropdown and free text); "Position / rank" lists only medical ranks for every profession; Salutation and Phone do not say if required; "Saving…" lasted several seconds on the first Continue (probably dev compile); step list not checked with a screen reader.
- "← Back to my registrations" on the event page even when the user came from Events; the portal sidebar disappears on the event page.
- Registrations has no cancel control and no hint that the pass appears at check-in time.
- Sidebar logo "Eventar" links to `/events`, not to Registrations; the landing header does not show the signed-in account.
- Organiser door while signed in as a practitioner: "Your account is below" points at nothing; no organiser Sign Up link although the Doctrine says to point to it.

Dev-lens MINOR/NIT (file: `mvp/REVIEW-FINAL-dev-r2.md`): m4 block-id mismatch under two tabs; m6 no DB layer for the agenda window; n2 `eventLifecycle.ts:61` comment says the SQL end is exclusive but for single-occurrence events it is inclusive (`now() > end_time`); n3 server messages used list position "block N" (fixed in text); n4 agenda draft-only trigger reads event status without a lock (`20261024110000:233`); n5 role functions audit the acting staff organisation not the event's; n6 a failed walk-in `email_log` insert is only logged to the console (`checkin/actions.ts:380-387`).
Backtest MINOR/NIT (file: `mvp/REVIEW-FINAL-backtest-r2.md`): `email_log` stays `queued` while the email stub is on (deliberate); a save that omits block ids recreates blocks with new ids; an invalid role code reaches the raw DB check as 23514 (action-level message not exercised); body_admin can save a draft it cannot publish; `markAttended` over HTTP, real forced concurrency, public registration capacity and email-send paths, `self_check_in`, and the audit row for a name-only edit on an attended registration were NOT run.
