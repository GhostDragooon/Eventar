# Handoff, 2026-11-01: every MVP card is built, reviewed and pushed; the acceptance walk is next

**Date:** 2026-11-01
**Status:** DONE and PUSHED. `origin/main` = `59ffd3d`. Nothing else is queued before the dual-persona acceptance walk (plan section 8). This handoff is not yet committed.
**Chain:** `mvp-execution` seq `13` · **Parent:** `handoff_20261101-mvp-execution-12.md` (door copy, CX-04R, UX-02 detail and the six review tables)
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Start the acceptance walk.** Recommend: open a new session and paste the kickoff comment at the bottom of this file. The walk needs review mode OFF (see Execute 1). About 45 to 60 minutes of agent time for the two persona walks, then the dev-lens and backtest.
2. **UX-04 design items held for your pick** (each needs the before/after shown, standing rule 2026-10-14; full text in `mvp/UX-04.md`, "Held for Ivan"):
   - a. **Account-linked rows look like any other.** Recommend an "Account" tag on the row plus a next step in the Edit dialog note. The next-step wording is yours (what does the registrant do to change their email?).
   - b. **Copy and counts.** "No matches." ignores the active filter; "Check-in" names two destinations (sidebar vs the event desk); the counts for a cancelled registrant differ between Details (Registered 4), Check-in (Pending 3) and Pass delivery ("0 of 2 delivered", "4 outstanding").
   - c. **Small screens.** At 320 px the first row sits below the fold; inputs are 14 px (iOS zooms on focus); the dialog does not lock background scroll.
3. **Role rights.** The role RPCs accept only the event's creator or Eventar staff, but the contact edit is organisation-wide. I made the chips creator-only in the UI. If you want any organiser admin of the organisation to set roles, that is an RPC change (kernel-adjacent authority), not a UI one.
4. **Carried from seq 12, still open:** email stub-vs-real branch (`origin/claude/distracted-haibt-18a25a`, unmerged), seq 8 Decide 1 and 3, the five-ruling list in seq 12 section 0 items 2 and 4 (wrong-door wording was done in `0af07d7`; sign-out in `4260d35`; public-menu vocabulary partly in `db29673`).

**Execute** (only Ivan, in order)
1. Restart the app with review mode off before the walk: `EVENTAR_REVIEW_MODE=false scripts/demo/dev-local.sh` (the script defaults it to true at line 90). Check `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '` first: a server is on :3100 now (pid 24879) with review mode ON; Next 16 allows one server per directory, so stop that one first.
2. Hosted DB: unchanged. Migration `20261101100000` (role lock) and `20261024110000`, `20261024120000`, `20261025100000` are on `main` and applied to the LOCAL stack only. Seoul is not touched. Stage 8 needs your go.
3. Push this handoff commit once committed (Ivan's go, per session).

**Queued for Claude** (no ruling needed)
- Run the acceptance walk (section 8 of the plan) when you say go.
- Fix the tip-gate script's `rg` call (carried from seq 12).
- Update `PROJECT_STATE.md` with the final HEAD after the walk; vault roadmap note and Decisions Log entries Ivan approves; `/graphify --update` (never save the manifest if a chunk failed).

**Other sessions:** `ListAgents` at the start of this turn showed three idle peers: "Handoff consolidation and MVP continuation", "Ivan rulings 2026-11-01 MVP execution", "Doctrine consolidation and validation". None was running work [X].

---

## What shipped this session (`81947d4..59ffd3d`, 5 code commits + this handoff)

| SHA | What |
|---|---|
| `a46a0a7` | Attendee surfaces: `/account/registrations`, `/account/check-in`, History = retitled `/account/record` (past only). `AccountShell` nav is five real links, the "Soon" rows are gone. 17 files. |
| `3fa0314` | UX-04 first cut: `/events/[id]/registrations` (list, filter, search, role chips, edit dialog); role chips and roles read removed from the check-in desk; toolbar says Registrations and Check-in; `proxy.ts` and `lib/authDoor.ts` know the route. 17 files. |
| `7e4479d` | Skill-curator leftovers in `.claude/skills` (47 files, no app code). |
| `7b0570a` | CX-06a leftovers: registration success link is "Registrations" to `/account/registrations`; default landing after sign-in, sign-up and the wizard, and the fallback for a hostile `next`, is `/account/registrations`. 13 files. |
| `59ffd3d` | UX-04 review round: role lock migration, creator-only chips, cancelled rows lock, focus and live region, "Open registrations" on the Published card, Roster copy gone. 16 files. |

UX-03 was already committed before this session (hand-back `mvp/UX-03.md`, commits `b35f1e6` and later); I had wrongly listed it as pending in my own summary.

## Where we are

- Attendee portal: five nav rows, all real. Registrations buckets live / upcoming / past with `bucketOf` in `app/account/myRegistrations.ts`: past if cancelled, unpublished or unresolved; live from 60 minutes before the start (`CHECKIN_OPEN_MINUTES`) to the end; otherwise upcoming. [X, unit tests + live walk]
- `listMyAttendanceRecords` (`app/account/actions.ts`) now also returns `event_end`, `registration_code`, `event_published` (event `status = 'published'` and `deleted_at is null`). Capped at 100 rows. [R]
- Check-in page for attendees is pass and status only; "Show my pass" opens the public `/checkin/confirm?code=` page, which leaves the portal shell. [X]
- Organiser Registrations page: owner-gated by `canManageEvent`; `canEditRegistrations(role)` shows Edit; `canEditRoles` (creator or `eventar_staff`) shows live chips. [R, X backtest]
- `set_registration_role` / `remove_registration_role` raise `22023` detail `role_locked_attended` when the registration has attended; `translateCpdRpcError` says "already checked in". [X, RLS test]
- Gates on the final tree [X]: tsc 0; eslint 0 errors on touched paths (10 pre-existing warnings elsewhere); vitest 218 files, 1948 passed, 545 skipped, 0 failed; `next build` OK (routes `/account/registrations`, `/account/check-in`, `/events/[id]/registrations`); full `pnpm test:rls` 47 files, 502 passed on the local stack; `check:ui-colours` clean; `check:ui-primitives` 3 pre-existing hits (OrgOnboardingClient x2, MultiBodyAccreditationWizard).
- Not run: `check:ui-*` on the very last tree after the UX-04 review fixes (last run was before them; the changes added no colours or raw buttons beyond the already-allowed chip); a clean-worktree run of the tip gate.

## What we tried (chronological)

1. **Attendee card, History placement.** Considered a new `/account/history` page. Rejected: it would duplicate `/account/record`. Chose to retitle `/account/record` and filter it to past events. [X]
2. **Bucket rule.** First version trusted the dates only. The dev-lens found a MAJOR: an organiser-cancelled or unpublished future event showed as Upcoming with a "Show my pass" button. Added `event_published` to the view and the rule; verified live by cancelling a fixture event in the DB. [X]
3. **Live backtest of the attendee card.** Disposable complete attendee with 6 fixture events and a real magic link; `?next=` landed on Registrations; cancelling an event in the DB removed it from both pages; fixtures and the auth user deleted (events 0, registrations 0, auth 0). [X]
4. **UX-04 review (three separate agents).** Dev-lens 0/1/5/7, backtest 0/1/2/2, user-lens 0/2/9/4 (BLOCKER/MAJOR/MINOR/NIT). Files: `mvp/REVIEW-UX04-dev.md`, `-backtest.md`, `-user.md`.
5. **Role lock: UI or DB.** First thought: add a status check in the server action. Dropped it: that is a control one layer above the write (the exact class CLAUDE.md rule 14 records six times). Wrote the guard in both definer functions instead, with a self-assert in the migration. [X]
6. **Chips that always fail.** The backtest showed an organiser member who did not create the event sees enabled chips that fail with "Only the person who created this event...". Chose creator-only chips in the UI over widening the RPC (that is Ivan's call, Decide 3).
7. **Focus loss.** The user-lens found a pending chip is `disabled`, so keyboard focus drops to `<body>`. Switched to `aria-disabled` while pending (locked chips stay `disabled`), ignore clicks while pending, add a polite status line. Test fails without it. [X]
8. **RLS run.** First `pnpm test:rls` failed all 47 files at the env guard: the suite refuses a non-local `NEXT_PUBLIC_SUPABASE_URL`. Re-ran with the three vars taken from `supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`). 502 passed. [X]
9. **Roster guard test.** `noRosterLabel.test.ts` scans `.tsx` under `app/` and `components/` (skipping `dev-preview-uiport`) for a JSX label or aria-label reading Roster. Mutation: appended `<a href="/events/1/checkin">Roster</a>` to `StickyLiveBar.tsx`, test failed, file restored with `git checkout` (it was committed). [X]

## Key decisions

- History is `/account/record` retitled; no new page. The public menu label "Record" and the wrong-door link "Back to my record" were left alone on purpose (public chrome and door copy are closed rulings).
- The default landing moved from `/account/record` to `/account/registrations` at five places; `/account/record` is still an honoured `next`.
- The role lock lives in the database (22023 `role_locked_attended`). Cancelled rows are locked in the UI only (a cancelled registration earns nothing; the DB does not refuse it).
- Review findings that change what the user sees (Account tag, copy, mobile layout) are NOT applied: standing rule 2026-10-14, Ivan decides after seeing the difference. Only code-level a11y (focus, live region, field errors) and mechanical copy were applied.
- Commits are by pathspec with `GIT_LITERAL_PATHSPECS=1`; the skills leftovers got their own commit (rule 10 of the commit skill).
- I committed and pushed only on Ivan's explicit words ("Commit", "Push"). "Keep pushing to complete the MVP" was read as "keep building", not as a push go.

## Evidence & data

| Item | Value |
|---|---|
| Pushed range | `81947d4..7e4479d` (first push, 3 commits), `7e4479d..59ffd3d` (second, 2 commits) |
| Reviews (UX-04) | dev 0/1/5/7 · backtest 0/1/2/2 · user 0/2/9/4 |
| vitest, before UX-04 fixes | 217 files, 1943 passed, 544 skipped |
| vitest, final | 218 files, 1948 passed, 545 skipped |
| RLS | 47 files, 502 passed (multi_body_accreditation_crud alone: 15) |
| Local migrations applied this session | 4: `20261024110000`, `20261024120000`, `20261025100000`, `20261101100000` |
| Backtest fixtures | events 440 to 440, registrations 887 to 887, audit_events +13 (append-only residue) |
| User-lens fixtures | "UXLENS Walk Event" removed; audit_events 43057 to 43074 includes concurrent activity |
| Backtest teardown gotcha | A check-in round trip writes hash-chained `participation_evidence`; an FK from `registrations` blocks deleting the registration. The agent deleted the tail rows as superuser in a transaction. Expect it in any later check-in backtest. |

Auth trace for `/events/[id]/registrations` [X, backtest + dev-lens probe]: `proxy.ts` and `lib/authDoor.ts` agree (sync test); `requireStaff()` then `canManageEvent`; another organisation's staff is redirected to `/details` (no names, no event title in the HTML); a PostgREST read as that user returns `[]`; `update_registration_contact` as that user returns `42501`.

## Code analysis

- `app/account/myRegistrations.ts`: `bucketOf(r, nowMs)`, `splitRegistrations`, `opensWithinADay` (24 h). Pure, tested at the 60-minute boundary.
- `app/account/loadMyRegistrations.ts` (`server-only`): auth to `/account/sign-in?next=`, incomplete account to `/account/complete`, then the read; returns `{ items, failed }` so a failed read is not shown as "nothing" (rule 12).
- `components/shell/AccountShell.tsx`: `currentLabel(pathname)` picks the longest matching nav prefix, so `/account/registrations` lights Registrations, not Account.
- `app/events/[id]/registrations/RegistrationsClient.tsx`: `canEdit` (Edit button), `canEditRoles` (live chips); `locked = attended || cancelled`; chip uses `disabled={locked}` and `aria-disabled` while pending.
- `app/account/sign-in/attendeeNext.ts`: the one gate (`safeNextPath` + `classifyPath === 'attendee'`) for all four `next` sinks.
- The role RPCs check `events.created_by = actor` (or `eventar_staff`); `update_registration_contact` checks the organisation. That mismatch is Decide 3.
- Grants: `authenticated` can EXECUTE `set_registration_role`; the actor is resolved inside by `app_private.resolve_actor`, so a plain session is refused. Pre-existing, not changed. [X, dev-lens probe]

## Files changed

### Source
- `components/shell/AccountShell.tsx`, `app/account/{schema,actions}.ts`, `app/account/{myRegistrations,loadMyRegistrations}.ts`, `app/account/{registrations,check-in,record}/`.
- `app/account/{complete,sign-in,sign-up}/`, `components/RegisterCard.tsx` (landing and success link).
- `app/events/[id]/registrations/{page,RegistrationsClient}.tsx`, `checkin/{page,RosterClient}.tsx`, `details/{page,multiBodyActions}.ts`, `components/details/{StickyLiveBar,PassDeliveryPanel,PublishedNextSteps}.tsx`.
- `lib/{auth,authDoor,emailSendSummary}.ts`, `lib/cpd/rpcErrors.ts`, `proxy.ts`.
- `supabase/migrations/20261101100000_registration_roles_locked_after_attendance.sql`.

### Tests
- New: `app/account/{attendeePages,myRegistrations}.test.*`, `app/events/[id]/registrations/{RegistrationsClient,noRosterLabel}.test.*`. Extended: `AccountShell`, `portalShell`, `RecordClient`, `RegisterCard`, `PublishedNextSteps`, `PassDeliveryPanel`, `rpcErrors`, the sign-in/sign-up/complete `next` tests, `multi_body_accreditation_crud.rls.test.ts`.

### Docs
- `docs/plans/mvp/{ATTENDEE-SURFACES,UX-04,CX-06a}.md`, `REVIEW-ATTENDEE-SURFACES-dev.md`, `REVIEW-UX04-{dev,user,backtest}.md`.

## User feedback & preferences (Ivan, this session)

- "stop stopping keep pushing to complete the MVP": do not end a turn after each card when the plan names the next one; stop only where the plan says to (the acceptance walk) or a ruling is needed.
- Earlier, in the pasted card: one card at a time; pathspec commits only; never stage, commit or push without his word; do not self-declare the MVP complete; hand-back format STATUS / What shipped / Tests + tip gate / Open risks only / Recommended next card.
- Standing rules from CLAUDE.md that bit this session: frontend review findings show the difference and Ivan decides; three separate agents for dev, user and backtest; investigate before escalating (rule 14); surface conflicts, do not average them.
- Output style: caveman, ADHD mode (lead with the next action, one next step), ponytail (smallest change at the root).

## Where we're going

1. Ivan restarts the app with review mode off (Execute 1) and pastes the kickoff comment below into a new session.
2. Run plan section 8: two fresh user-lens agents (organiser steps 1 to 8, practitioner steps 1 to 7), one browser agent at a time (subagent browser tabs share cookies); then a dev-lens over the whole MVP diff; then a backtest of every write.
3. Fix BLOCKER and MAJOR findings by the next eligible card; show Ivan the difference for any visual one.
4. Then the "MVP is done when" list: gates on a clean worktree at the final HEAD, `PROJECT_STATE.md`, the vault, the graph. Seoul and Stage 8 stay separate decisions.

## Risks & blockers

- The walk needs personas `ux-admin`, `ux-member`, `ux-body` and a fresh `@final.invalid` practitioner. Confirm they exist in the local `staff` table before starting (find them via `mvp/CX-05.md` or psql). Review mode borrows one fixed staff row (`eventar_staff`), which is why the user-lens could not exercise `organiser_admin` or the read-only roles.
- Practitioner walk step 2 says "land on Registrations": that is now true; verify with a real magic link from Mailpit (:54324). The redirect chain was proved in unit tests only [I].
- The Published next-steps card with the new "Open registrations" link was not walked live.
- The attendee list reads at most 100 rows; the organiser list at most 1000, with no paging.
- Dark mode and pressed-chip colours were not verified (the pane's animation timeline is frozen, see memory `browser-pane-frozen-animation-timeline`).
- Concurrent agents on one DB: never run `test:rls` while a browser or backtest agent is writing.

## Open questions

- Decide 2 and 3 above.
- `isStaffSession` fails open (carried from CX-06a): a staff read error could show an organiser the "Registrations" prompt on the success card. Unchanged posture.
- Should `/events` (the public list) be an honoured `next`? Today it falls back to Registrations; nothing produces it.

## Gotchas

- zsh: `GIT_LITERAL_PATHSPECS=1` plus quoted bracket paths (`'app/events/[id]/...'`); arrays, not word-split variables; no `timeout` command.
- `supabase migration up --local` applies every pending local migration, not only yours.
- The harness blocks an Agent dispatch for a review without a `Budget:` line in the prompt (max tool calls, scope, read_page over screenshots, report partial at the cap).
- `pnpm test:rls` needs the three Supabase vars exported from `supabase status -o env`; without them it fails every file at the local-URL guard (a good failure).
- The `.next` build and the dev server share a directory: do not run `next build` while a browser agent is using :3100.

## Quick start for next session

```bash
cd /Users/ivan/Eventar
git status -sb && git log --oneline -8
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '
sed -n 430,466p docs/plans/2026-10-11-mvp-execution-plan.md     # section 8, the walk
sed -n 1,60p docs/plans/mvp/UX-04.md                            # held design items
```

Read first: this file section 0, `docs/plans/mvp/UX-04.md`, `docs/plans/mvp/ATTENDEE-SURFACES.md`, `docs/plans/mvp/PICKS.md` (bottom).

## Kickoff comment (paste into the next session)

```
Read docs/plans/handoff_20261101-mvp-execution-13.md (seq 13, chain mvp-execution) section 0 and the "Where we're going" list, then run the MVP acceptance walk from docs/plans/2026-10-11-mvp-execution-plan.md section 8.

State: origin/main = 59ffd3d; every card (CX-01..07, DB-01..05, UX-01..04, Attendee surfaces, CX-06a leftovers) is built, reviewed and pushed. Do not re-open sign-out, wrong-door, door copy, public chrome labels, CX-04R or the UX-02 shell. Review mode must be OFF on :3100 (EVENTAR_REVIEW_MODE=false scripts/demo/dev-local.sh), local stack only: never .env.local, never the Supabase/Vercel MCP tools, never git commit/push/db push without my word.

Do: (1) check ListAgents and git status, confirm personas ux-admin, ux-member, ux-body exist locally; (2) run the organiser walk then the practitioner walk as two SEPARATE user-lens agents, one browser agent at a time, each with a Budget line, recording the four questions (where am I, what is the main thing, how do I progress, how do I get back) and a screenshot per step; (3) then a dev-lens over the whole MVP diff and a backtest of every write, as separate agents; (4) write findings to docs/plans/mvp/REVIEW-FINAL-*.md ranked BLOCKER/MAJOR/MINOR/NIT; fix BLOCKER and MAJOR by pathspec commits only after I say commit; show me the before/after for any visual change and let me decide. Do not declare the MVP complete; give me the "MVP is done when" checklist with each line marked passed, failed or not run.
```
