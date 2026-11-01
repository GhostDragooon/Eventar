# Attendee surfaces: hand-back

STATUS: DONE locally, NOT committed, NOT pushed. Evidence tags: [X] executed, [R] read.
Executor: Claude Sonnet 5.5, Claude Code. Committed:

## What shipped
- **`/account/registrations`**: Live ("Check-in is open") and Upcoming sign-ups, soonest first; "Show my pass" on open events; empty state "not registered for any upcoming events" with one "Find events" action; a failed read says so, never "nothing". `app/account/registrations/{page.tsx,RegistrationRows.tsx}`.
- **`/account/check-in`**: pass and status only (Doctrine section 2). Open now + opening within 24 h, each with the existing public pass (`/checkin/confirm?code=`), "Check-in opens at ..." or "You are checked in". Empty state points to Registrations. No capture, no BLE, no offline. `app/account/check-in/page.tsx`.
- **History = `/account/record`**, retitled "History" and filtered to the past bucket (ended, cancelled registration, event cancelled/unpublished/deleted). Menu label "Record" untouched (ruled).
- **`AccountShell`**: all five nav rows are real links; Soon branches deleted; current place is the longest matching prefix (so `/account/registrations` lights Registrations, not Account). Brand stays `/events`.
- Shared: `app/account/myRegistrations.ts` (bucket rules = the DB's 60-minute window), `loadMyRegistrations.ts` (auth, completeness and read guard, same as `/account/record` had). `listMyAttendanceRecords` now also returns `event_end`, `registration_code`, `event_published` (the caller's own rows only).

## Checks
| Check | Result |
|---|---|
| tsc | 0 [X] |
| eslint | 0 errors, 10 warnings (all pre-existing, none in these files) [X] |
| vitest | 217 files, 1943 passed, 544 skipped, 0 failed [X] |
| `next build` | OK, both routes present [X] |
| `check:ui-colours` | clean [X]; `check:ui-primitives` 3 hits, none mine (OrgOnboardingClient x2, MultiBodyAccreditationWizard) [X] |
| Tests added | bucket rules and boundaries, shell mounting on all portal pages incl. incomplete-account redirect, nav current-place per route, empty/populated/failed states, no cross-persona links |

## Reviews
- **Dev lens** (separate agent): `REVIEW-ATTENDEE-SURFACES-dev.md`. 1 MAJOR (cancelled/unpublished future event shown as Upcoming, Show-pass offered) FIXED and live-verified; MINORs: leak-test regex fixed; 100-row read cap, `?next=` dropped on the incomplete-account redirect (pre-existing), no loader test, no time-display test: carried. The fix was not re-reviewed by an agent.
- **User lens and backtest: I walked it myself, not a separate agent** [X] on :3100, real magic-link round trip as a disposable complete attendee with 6 fixture events: sign-in `?next=` landed on Registrations; Registrations, Check-in and History showed exactly the expected rows (past, cancelled registration and far-future correctly absent from Check-in); cancelling the event in the DB removed it from both pages; all events cancelled gave both empty states; 375 px: scrollWidth 375, five tabs, no Soon, current tab marked. Fixtures, user and magic-link file deleted, leftovers 0 [X].

## Open risks
1. Not run: Show-my-pass click-through, dark theme, 320 px, keyboard/screen reader, Safari/Firefox, a staff session hitting the new routes live (covered only by the existing `/account` layout test [R]).
2. Registrations is not the post-sign-up landing (Doctrine says it should be; sign-in default is still `/account/record`, now History). CX-06a leftover.
3. Vocabulary: public menu "Record" and rail "History" both go to `/account/record` (known, ruled).
4. "Show my pass" leaves the shell for the public pass page (PublicShell). Wrapping it is a later card.
5. 100-row cap in `listMyAttendanceRecords`; no pagination.
6. UX-04 changes (organiser Registrations page and Roster split) are also unstaged in the tree and are PARTIAL, see `UX-04.md`; the gates above ran over both.
7. Layout is the Record page's list style copied, not a new design (MECHANICAL under the frontend threshold): flag for the design review.

## Pathspec for this card (stage only these)
`components/shell/AccountShell.tsx components/shell/AccountShell.test.tsx app/account/schema.ts app/account/actions.ts app/account/myRegistrations.ts app/account/myRegistrations.test.ts app/account/loadMyRegistrations.ts app/account/attendeePages.test.tsx app/account/portalShell.test.tsx app/account/registrations app/account/check-in app/account/record docs/plans/mvp/ATTENDEE-SURFACES.md docs/plans/mvp/REVIEW-ATTENDEE-SURFACES-dev.md`
Suggested message: `feat(attendee): Registrations, Check-in and History pages in the portal shell; Soon rows removed`

## Recommended next card
CX-06a leftovers (registration success to record; make Registrations the landing), then finish UX-04 (live walk and reviews).
