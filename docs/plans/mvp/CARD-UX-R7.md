# CARD UX-R7 — read-only roles at the check-in desk (from UX-R hand-back F3)

Card type: design (step 1) plus mechanical (step 2). Raised 2026-11-22 by Ivan ("F3 as a card"). Source: `docs/plans/mvp/UX-R.md` Findings F3. Status: PARTIAL (step 1 option B and step 2 shipped, phone-width fix shipped; held copy calls waiting on Ivan; handoff closing steps not run). Commits: 2a7a496 (code), 0ce19bd (phone width).

## Goal

A `body_admin` or `auditor` is never pointed at a desk that cannot do what its label says, and is told once, not twice, why the desk is read-only.

## Evidence (what was checked on 2026-11-22)

1. **Blue "Check-in" button on the dashboard for a role that cannot check in.** `components/dashboard/EventsHome.tsx:558-560` renders the Check-in link for every non-draft, non-cancelled event and makes it the primary variant when `doorNow`. It is not gated on role. `canCheckIn` (`lib/auth.ts:84`) names organiser_admin, organiser_member and eventar_staff only, so the link opens a desk the role can only read. [X] seen live in the wave-1 user-lens walk (Body Admin, blue button). [I] the code path.
2. **The desk says the role sentence twice.** `app/events/[id]/checkin/page.tsx:156-160` prints "Live capture only: this desk is read-only for your role." under the title. `RosterClient.tsx:140` and `ScanAndManual.tsx:52-56` then print `CHECKIN_ROLE_MESSAGE` ("Your role cannot check people in. Ask an organiser admin or member.", `lib/lifecycle/eventLifecycle.ts:70`) in the status line above the Scan and Enter-code buttons. [X] user-lens walk. [I] the two source sites.
3. **Download QR and Export CSV stay enabled.** Checked and judged NOT a defect: they read data the role may already see. `DownloadQrButton` sits on the edit page (`app/events/[id]/edit/page.tsx:457`), which a read-only role opens as "View". The bulk Export CSV was kept on purpose in UX-R1 option B. This item is dropped from the card unless Ivan says a read-only role must not export (open question 1).

## Start condition

UX-R hand-back (`docs/plans/mvp/UX-R.md`) is on origin main. No `LOCK-*` file names `EventsHome.tsx`, `checkin/page.tsx`, `RosterClient.tsx` or `ScanAndManual.tsx`. Check `ListAgents` and `git status` first.

## Step 1 — dashboard Check-in link (DESIGN, needs Ivan's pick)

Run the locked frontend pipeline, then publish one interactive Artifact with real before and after (width slider, theme toggle) and give Ivan at least three options. Do not edit until Ivan picks. Candidate options, with their cost:

- **A. Hide the link for read-only roles.** Matches the New event button logic in reverse; the role loses a path to the read-only desk. Cheapest.
- **B. Keep the link, never primary, labelled "View desk".** Matches the Edit→View rule (Q51): the label says what opens. Shipped by reusing `ProgrammeEvent.writable` (false for body_admin, auditor and a non-owner organiser_member), so no new prop. One label branch, `doorNow` colour skipped when `writable === false`.
- **C. Keep today's link, add the reason under the card.** Keeps the blue call to action that goes nowhere. Weakest; listed so the pick is real.

Needs a role signal in `EventsHome`: it already receives `canCreate` (same three roles today), and the UX-R1 note records that `canCreateEvents` and `canChangeEventStatus` coincide. Use a separate prop only if Ivan wants the roles decoupled.

## Step 2 — say it once on the desk (MECHANICAL once step 1 is picked)

Keep one sentence. Candidates: drop the page one-liner's role branch, or suppress `closedMessage` for the role case because the one-liner already says it. The one-line contract at `page.tsx:153-160` and the status line must not both name the role. Whichever is kept must keep `role="status"` and the `aria-describedby="checkin-closed-note"` target that the disabled buttons point at. Update the tests that pin either string and show before and after frames.

## May edit

- `components/dashboard/EventsHome.tsx` and `components/dashboard/EventsHome.test.tsx`
- `app/events/[id]/checkin/page.tsx`, `app/events/[id]/checkin/RosterClient.tsx`, `app/events/[id]/checkin/ScanAndManual.tsx`, and their `*.test.tsx`
- `app/dashboard/page.tsx` only if a new role prop is chosen in step 1

## Do not touch

`lib/auth.ts`, any migration or grant, `mark_attended`, `lib/lifecycle/eventLifecycle.ts` copy (shared with the server refusal), consent or legal surfaces, deploy.

## Definition of done

- A read-only role no longer sees a primary Check-in call to action that leads to a desk it cannot use (per the picked option).
- The desk names the role limit once.
- An organiser sees no change on either surface (test asserts it).
- New tests fail on the old code first.
- Gates green on the touched surface; no new BLOCKER or MAJOR.
- Frames before and after sent for both surfaces, as `body_admin` and as an organiser.

## Stop conditions

Write `STATUS: BLOCKED` and stop if a file outside "May edit" is needed, a kernel or role-model question appears (for example Ivan wants `canCheckIn` changed), or consent or legal copy would change. Do not start step 1 edits before Ivan picks.

## Open questions for Ivan

1. Should a read-only role be able to Export CSV and Download QR? Default in this card: yes (read access), item 3 dropped.
2. Prefer option A, B or C for step 1? Executor proposes B.

## Review

Ivan's 2026-11-22 ruling stands: run the dev-lens and user-lens agents (separate, each with a Budget line) before presenting, with a backtest as `body_admin` and as an organiser on the local stack.

## Outcome (2026-11-22)

Ivan picked option B ("View desk, never blue") and kept Export CSV and QR allowed.

- Step 1: `EventsHome.tsx` row link reads "View desk" and stays outline for `writable === false`. Organiser keeps the blue "Check-in".
- Step 2: `checkin/page.tsx` one-liner is now "Live capture only." The role limit is said in the status line above the buttons.
- Gates on 2a7a496 and 0ce19bd: tsc, eslint (0 errors), full vitest 2306 pass, next build, check:ui-colours pass. check:ui-units fails on `components/shell/SiteNav.tsx` (5 px vs baseline 2), not in this card. test:rls not run (no DB change).
- Dev lens: approve, 0 BLOCKER, 0 MAJOR.
- User lens: 1 MAJOR, closed in 0ce19bd. At 375px "View desk" ran past its pill. Padding alone did not fix it (the three equal grid columns were the limit). Row buttons now use two columns below 24rem, with the third button full width, and three columns from 24rem. Bin Restore uses `col-span-full`. Measured: no overflow at 375px; one row of three at 430px.

### Held for Ivan (copy or design calls, not applied)

1. Speakers card on the desk repeats the role sentence (user-lens MINOR 2).
2. "Live capture only." under the title reads generic for a read-only user (MINOR 3).
3. Third desk branch says "You can view this desk but not check people in." with no "Live capture only" (dev-lens NIT 3).
4. Make `ProgrammeEvent.writable` required, not optional (fail-open today). Separate card.
5. `[checkin] eligibility read failed {code: 42501}` is logged twice per desk load for body_admin. Needs its own look.
6. Disabled Scan badge keeps its pale-blue fill (MINOR 4); "View" and "View desk" sit side by side (MINOR 5); a read-only user does not see the "opens 60 minutes before" note (MINOR 6).

Not walked: door-open state, organiser_member on a colleague's event, phone width on the desk itself.

Teardown: fixtures `ZZ-R7 Open desk`, the staff row and auth user `zz-r7-ro@example.test` deleted, counts read back 0/0/0. :3300 server stopped.
