# Consolidated handoff, 2026-11-06: what is open after MVP execution seq 4–15

**This is the entry point.** It replaces, as the place to start, the §0 action lists of `handoff_20261031-mvp-execution-4.md` through `handoff_20261105-mvp-execution-15.md` and `handoff_20261031-email-switch-landing.md`. Those files stay as evidence records. Every open item in them is listed below once, or marked resolved with where. The previous consolidation was `handoff_20261011-consolidated.md`; everything before it is history.

Evidence tags: **[X]** executed this session, **[R]** read in code or a handoff, **[I]** inferred.

## 0. Ivan's action list

**Decide** (recommendation first; frontend items need the before/after shown, standing rule 2026-10-14)

1. **Security card (Q48 priority 2).** From `security-audit-20261104.md` "Still open":
   - M3 clickjacking: `frame-ancestors` sits only in the report-only CSP (`next.config.ts`), so nothing enforces it; no `X-Frame-Options` [R, seq 15].
   - M2: `consent_records` writable and forgeable by any signed-in user.
   - `zod` 4.4.3 → 4.6.6+ (last direct high advisory).
   **Recommend:** these three as one card now. H1 SQL layer (`app_private.auth_email()` confirmed-email check) is a kernel change: its own card after your sign-off. Hosted Auth is already confirmed (Confirm email ON, password signup OFF, `290adbc`), so H1 is not live on Seoul.
2. **Role rights: RULED, BUILT, COMMITTED (`b95a987`), PUSHED and APPLIED TO SEOUL (Q51, 2026-11-07).** Admin any org event, member own, body_admin and auditor read-only, eventar all; mixed bulk refused whole; hero images same rule. Card: `docs/plans/2026-11-06-role-rights-card.md`; migration `20261107100000`; Decisions Log Q51. Gates: tsc 0, eslint 0 errors, vitest 2222, build OK, test:rls 457 + 57 with one known flake (`award_f1_f5_gate`, 7/7 alone ×3). Dev-lens (4 MAJOR, 3 MINOR) fixed and test-proven. User-lens frontend findings ruled by Ivan 2026-11-07 and built: the confirm refuses a selection holding a colleague's event (button disabled, focus on Keep events); "Edit" reads "View" (Events row and Details header) and opens the read-only view with the reason; one read-only line on Details with the close date disabled; desk line "You can view this desk but not check people in." and the reason once; the published-edit note no longer tells a member it can change accreditation; the bulk bar is sticky (`sticky top-0`, solid `bg-primary-container`, mechanical: sticky already used in `app/page.tsx`). After screenshots inspected live [X]; none on disk. Last full chain: tsc 0, eslint 0 errors, vitest 2229, build OK, test:rls stage 1 457 + one known flake (7/7 alone), stage 2 57. Left for the design review: the Check-in button stays primary blue on a colleague's event (opens the read-only desk); the read-only view keeps the "Edit" breadcrumb and tab title; the accreditation role sentence shows twice on the view (pre-existing); eventar_staff of another org cannot edit details via PostgREST (pre-existing RLS). Seoul verified read-only 2026-11-07: 9 guard triggers, anon cannot create, 3 hero policies.
3. **Agenda blocks.** (a) A DB rule that blocks sit inside the event window (Hard rule 8). (b) Return block ids from `update_event_with_blocks` instead of reading back by position. **Recommend:** one card for both, after 1 and 2. Cost: a migration that checks existing rows first.
4. **Email stub-vs-real branch** `origin/claude/distracted-haibt-18a25a` (`04fdc9c` + `fb49ac1`, unmerged [X]). Five calls in `handoff_20261031-email-switch-landing.md` §0. **Recommend:** merge both commits; leave the "development stub" copy (option c) and the `NODE_ENV` signal question to Stage 8.
5. **Frontend design items** (each runs the locked pipeline and needs before/after):
   - UX-04: Account tag on linked rows + next-step wording; "No matches." copy and cancelled-registrant counts that disagree across Details, Check-in and Pass delivery; the 320 px layout.
   - Seq 8 Decide 1: `AuthBackdropCard` hex gradient (`components/auth/AuthBackdropCard.tsx`, the last `check:ui-colours` hits) and em-dash door copy (`:34-35`); desktop card position; "Admin" caption above Settings; phone navigation (strip clips Settings at 375 px); seq 5 Decide 3, 4 and 6.
   - Seq 12 Decide 4 remainder: public menu vocabulary is partly done (`db29673`); event detail is not yet in the shell.
   - Security audit frontend proposals: hide or disable bulk controls for body_admin and auditor; the false "Moved to the Cancelled tab" title during the 10-second countdown; the 4.5-second error toast.
   **Recommend:** phone navigation first (the only one with a visible defect).
6. **CLAUDE.md wording.** Hard rule 1 says sign-in is "OTP/password+MFA, not magic link"; the code sends an emailed link and has no password or MFA path. Hard rule 7 says sends are stubbed "regardless of stage"; false for a production build once the email branch merges. **Recommend:** let Claude correct both sentences (rules unchanged).
7. **Seq 8 Decide 3, events fetch cap.** **Recommend:** leave it until an organisation nears 300 events.
8. **DB tidy rulings** in `2026-11-05-db-cleanup-dependency-map.md` §0 (peer doc): hash chains vs session time zone, legacy accreditation columns, squash timing. Read it when you reach DB tidy.

**Execute** (only Ivan, in order)
1. Say "commit" and "push" for this session's changes (list in §2). Push go is per session.
2. Legal is parked (`docs/DEFERRED.md` TODO row). After the MVP closes, send the solicitor list in `docs/legal/README.md`.

**Queued for Claude** (no ruling needed)
- After the email merge: caller-level tests for the production branch and the stale-text list (email-switch handoff "Queued").
- Before the done-when declaration: one more clean-worktree gate run at the final HEAD, aiming for a run with no flake.
- Local DB drift, not deleted (older than the cleanup cutoff, so out of the skill's scope): events `ZZ-FINAL admin before-window`, `ZZ-FINAL member c1`; user `prac01@final.invalid`; about 300 leftover RLS test accrediting bodies (`A2-*`, `MB-*`, `RLS-*`) that show in the practitioner licence picker; 63 auth users created after 2026-11-02 14:30 UTC, mostly RLS test users. Clean only on Ivan's go.
- Then the MVP done-when declaration against `mvp/REVIEW-FINAL-summary-r2.md`, `PROJECT_STATE.md`, vault, `/graphify --update`.

**Other sessions:** `ListAgents` at start: one peer, "Event accreditation product review [fa4aff]", interactive, idle [X].

## 1. Resolved since the lists were written

| Item | Where |
|---|---|
| Seq 14 Decide 1–3 (licence on wizard, speaker window, consent wording) | `6799639`, `a93d25d` |
| Hosted Auth confirm-email / password signup | `290adbc`, `6249b27` |
| H1 app layer, M1, H2 `next` 16.4.5, M8 `shadcn` | `0ed292c`, `4396d28`, `73361e3` |
| Seq 12 Decide 1 sign-out, Decide 2 wrong-door wording, Decide 3 Attendee surfaces card | `4260d35`, `0af07d7`, seq 13 |
| `StatusPill` "Drafted" → "Draft"; `StatusChip` draft branch removed | this session [X] |
| Organizer → organiser spelling on `/login` copy | this session [X] |
| Tip-gate em-dash scan used `rg` (exit 127) | already fixed in skill `eventar-static-gates` (uses `grep`) [R] |
| Seq 8 Decide 2, cancelled-event roster | Not orphaned: the desk renders it read-only (controls disabled with `checkInGateMessage`), and `/events/[id]/registrations` has no cancelled gate, so the same people are one link from Details [R] |
| Seq 12 doc staleness | `specs/001-attendee-portal/spec.md` FR-006, SC-001, SC-004 updated this session [X]; `DOCTRINE-CONFLICT-MAP.md` (line 16) and `CX-06a.md` (line 9) already carry "labels as built" notes [R] |
| Clean-worktree gate chain at `5e36388` (2026-11-06) | tsc 0; eslint 0 errors, 10 warnings; `check:ui-colours` clean; `check:ui-primitives` exit 1 with the same 4 hits as seq 14 (`ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120,142`, `MultiBodyAccreditationWizard.tsx:245`), none from this session; vitest 2202 passed, 1 failed (`PublishDraftButton.test.tsx` flake; 12/12 alone three times), so NOT CLEAN; `next build` 0; `pnpm test:rls` 461 + 57 passed, exit 0. Peer "Database organization review" was busy on the shared stack during the run [X] |
| Walk fixtures after 2026-11-02 14:30 UTC | deleted after a counted dry run: events `ZZ-R3b open window`, `ZZ-WALK Draft 1`, 7 registrations, users `zzlic1@`, `prac02@final.invalid`; 0 `credit_ledger` references [X] |
| Re-walk of seq 14 unit-tested fixes, `6799639`, `a93d25d`; `ux-member` 2–4 and `ux-body` 2 | all PASS live, §2 [X] |
| `PublishDraftButton.test.tsx` flake, recorded in four handoffs | now one debt row in `docs/DEFERRED.md` [X] |

## 2. Re-walk 2026-11-06 (live, :3100, review mode OFF, local stack)

Verdict: **no BLOCKER, no MAJOR.** Every re-walked fix and both never-walked rows pass. Four MINOR findings. Real clicks and real typing throughout, except the wizard's native `<select>` fields (profession, specialty, position), which were set with `form_input` as setup. Sign-ins used real magic links from Mailpit; no link was printed. Screenshots were inspected inline; none are on disk.

| Row | Result | Evidence |
|---|---|---|
| `ux-member` 1, sign-in | PASS [X] | magic link → `/dashboard` "Events" |
| `ux-member` 2, create draft | PASS [X] | empty Save draft → "Still needed to continue: event name, venue, date, start time, end time."; saved row `status=draft`, 09:00–12:00 HKT, `timezone=Asia/Hong_Kong`, `created_by` = member; edit header chip "DRAFT" (the new `StatusPill` label) |
| `ux-member` 3, agenda | PASS [X] | empty block save → "The untitled Keynote block needs a start time and an end time."; 3 blocks saved; reorder by time saved; Lecture removed → `agenda_blocks` = 2 rows, original ids kept, order Workshop 09:00, Keynote 11:00 |
| `ux-member` 4, publish | PASS [X] | confirm dialog names what goes public and the check-in time; after confirm: "Published. Your registration page is live." + "What to do next"; DB `status=published`. The member is the creator, so this does not test Decide 2 (non-creator member) |
| `ux-member` 5, Registrations vs Check-in | PASS [X: hrefs read from Details] | `/registrations` and `/checkin`, distinct |
| `ux-member` 6, speaker before window | PASS [X] | stale open page, window moved to before, real click → "Check-in has not opened yet. It opens 60 minutes before the event starts."; `speaker_checkins` = 0; on reload both buttons disabled with `aria-describedby=checkin-closed-note` |
| `ux-body` 2, create | PASS [X] | form opens with Save draft only, plus "Your role can't publish events. Save a draft and ask an organiser admin to publish it." Whether body_admin should create drafts at all belongs to Decide 2 |
| Settings Team card, member | PASS [X] | "Only organiser admins can invite teammates. Ask an admin of your organisation.", no link |
| Registrations empty copy | PASS [X] | "No registrations are cancelled." then "No registrations are cancelled and match "nobodymatches"." |
| Sign up keeps `next` | PASS [X] | event → "Log in or sign up first" → Sign up `?next=…` → wizard `?next=…` → Done lands on the event |
| Wizard `*` marks + hints | PASS [X] | "Add your first name, last name and phone to continue."; Professional hint narrows live to "Add your department to continue." |
| Done without licence + banner | PASS [X] | Done enabled with no licence; Registrations shows "Account setup is not finished: no current licence is declared. Credit is released only for events you check in to after you declare one." + "Add a licence" |
| Consent wording | PASS [X] | "By continuing you agree to the terms and privacy policy we will publish before launch." |
| `/login` organiser spelling (this session's change) | PASS [X] | "Only organiser emails can log in…", "Organiser access only" |

MINOR findings (none blocks the MVP). Status after the same-day fix pass: 1 retracted, 2–4 fixed in the working tree and kept as written (Ivan, 2026-11-06), uncommitted; each test failed first.

| # | Before | After | Where |
|---|---|---|---|
| 1 | footer at 16 visible events | RETRACTED: the local org holds 464 events, so the 300 cap really was hit (`events.length >= FETCH_CAP`) | no change |
| 2 | "Please enter a valid start time and end time and title and topic 1 (title + speaker) to continue." | "Still needed to continue: start time, end time, title and topic 1 (title + speaker)." (same wording as the New event list) | `components/event-form/AgendaSection.tsx` |
| 3 | Consent Continue disabled, no reason | "Tick the box above to continue." beside the button until ticked | `app/account/complete/CompleteClient.tsx` |
| 4 | "Phone (optional)" on Account | "Phone", input `required` (browser refuses an empty save), matching `isAccountComplete` | `app/account/AccountClient.tsx` |

Original findings:
1. Events home footer "Only the 300 events with the latest dates are loaded, so older ones may be missing here." shows with 16 events loaded. It should appear only at the cap (ties to seq 8 Decide 3).
2. The agenda's second error line reads "Please enter a valid start time and end time and title and topic 1 (title + speaker) to continue." The first line already names the block and cause; this one repeats it as a chain of "and".
3. Wizard step 1 (Consent): Continue is disabled with no hint. Steps 2 and 3 now have one.
4. Account page labels "Phone (optional)" while the wizard requires phone (`lib/accountCompleteness.ts`). One of the two is wrong.

Local-only notes: the licence picker lists about 300 leftover RLS test bodies (`A2-*`, `MB-*`, `RLS-*`); that is fixture leak in the local DB, not product (skill `eventar-fixture-leak-cleanup`). The one hydration warning seen came from a test marker attribute the walk added, not from the app.

Cleanup [X]: event `4d1b6f20…` and its blocks and occurrence deleted; test practitioner deleted through the admin API; ZZ-RW events 0, `rewalk.invalid` auth users 0, orphan consent/profile rows 0. Audit rows the walk wrote stay (append-only). The :3100 server was stopped by its own task and the lock removed.

## 3. This session's changes (uncommitted)

- `components/lifecycle/StatusPill.tsx`, `StatusPill.test.tsx` (test failed first, then passed), `components/dashboard/StatusChip.tsx`.
- `app/login/page.tsx`, `components/auth/ControlledAccessNotice.tsx`, `MagicLinkSignInForm.tsx`, `AuthShell.tsx` + three test files (regexes now accept either spelling, so negative assertions stay meaningful).
- MINOR 2–4 fixes: `AgendaSection.tsx`, `CompleteClient.tsx`, `AccountClient.tsx` + one new test each (failed first). Gates: tsc 0; eslint clean on the three files; full vitest 2202 passed, 1 failed (`NewEventForm.test.tsx`, timeout at load 17.5; 70/70 alone three times), so NOT CLEAN by the flake rule; RLS skipped (no DB change). Not live-verified on :3100.
- `.claude/skills/eventar-mvp-acceptance-walk/scripts/walk-window.sh` (window-state helper the skill asks to keep; refuses non-`ZZ-` events).
- `specs/001-attendee-portal/spec.md`, `docs/DEFERRED.md` (flake row), this file, `PROJECT_STATE.md` pointer.
- Peer `.claude/skills/` changes in the tree are not this session's; do not stage them.
