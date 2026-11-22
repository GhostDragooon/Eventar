# UX-R — MVP close pass, cards UX-R1 to UX-R6 (2026-11-22)

STATUS: DONE for code, gates, live check and the dev and user lenses. The backtest lens was run inline by the coordinator, not by a third agent (Deviation 3). Ivan's ruling 2026-11-22 asked for a dual-lens review before presenting. No LOCK file was needed: no `docs/plans/mvp/LOCK-*` existed at the start.

## Card status

| Card | Result | Commits |
|---|---|---|
| UX-R1 role leaks | Done. Option B picked by Ivan ("1b") | ec4f976, 3a6d246, 267cca1, 2d632a7 |
| UX-R2 CSV zone label | Already shipped before this pass (3b59597, cbd30b1). Verified, not changed [I] | none |
| UX-R3 greyed Register reason | Already shipped before this pass (3c83e84). Verified, not changed [I] | none |
| UX-R4 stale "Name required" | Done. The surface is the check-in Walk-in dialog, not RegisterCard | 8669a92, 3a6d246, 0975e9b |
| UX-R5 at capacity | Done. Option C picked by Ivan ("2c") | b6dbafa, 0975e9b, 267cca1, 2d632a7 |
| UX-R6 copy and wiring nits | Done, 6 of 6 (a to f) | b6dbafa, 3a6d246 |

## Changed

- `components/dashboard/EventsHome.tsx:92` `readOnly = !canCreate`. Delete, Cancel and Restore in the bulk bar are disabled and carry `aria-describedby="bulk-why"` (lines 396, 401, 405). The reason line is `:414` in the bar, `:423` above the list in the Deleted tab. The row Restore is disabled too (`:549`). The refusal-dialog branch for read-only roles was deleted as dead code.
- `app/events/[id]/edit/page.tsx:203` breadcrumb says "View" with an eye icon when the role cannot change the event.
- `app/events/[id]/checkin/RosterClient.tsx:466` the walk-in submit is disabled with a reason line (`:537`, `aria-describedby` at `:544`), and the error clears when a field changes.
- Full event, everywhere it was said wrong: `components/lifecycle/StatusPill.tsx:32` and `StatusChip` ("At capacity"), the public list (`app/(public)/events/page.tsx`, `EventsListClient.tsx`), the edit-page Public page card, the `/details` Registered tile (`LiveScoreboard.tsx`: "full" or "open").
- Next step for a full event: `components/RegisterCard.tsx:262` "This event is full. N other events are open for registration." and the "Browse N open events" link to `/events` (`:266`); count hidden at 0. `app/(public)/events/[id]/page.tsx:120-135` reads the count only when the event is full and still registering.
- New `lib/events/fullEventIds.ts:9`, shared by the public list and the event page so both decide "full" the same way.
- `app/(public)/events/[id]/page.tsx:113` a failed registration count now throws (rule 12).
- R6: one invalid-email string, `Please enter a valid email address.`, at 9 sites (schema.ts, checkin and registrations actions, AccountClient, SettingsClient, NotificationSignupButton, SubscriptionDialog, orgActions twice). `LandingHero.tsx:92` signed-in practitioner sees "Find events". `app/pricing/page.tsx:5` title "Pricing". `CpdAccreditationSection.tsx:198` prints the role refusal once, with `aria-describedby` on the three disabled controls (`:228`, `:257`). Footer on the dashboard names the tab counts.

## Tests added or changed

All new tests were run against the old code and failed first [X] for R1 bulk, R5 RegisterCard, and the walk-in form.
- `EventsHome.test.tsx`: read-only role gets disabled Delete and Cancel with the reason and a live Export CSV; in Deleted every Restore (row and bar) is disabled and the reason shows before anything is ticked; a writing role sees live buttons and no reason line. Removed the old "Delete is refused with the role reason" dialog test (its branch is deleted).
- `RosterClient.test.tsx`: walk-in disabled with a reason, `aria-describedby` is `walkin-why`, error clears on change.
- `walkIn.test.ts`: `bad@` returns the shared email message.
- `StatusPill.test.tsx`: "At capacity" only while registering and full.
- `RegisterCard.test.tsx`: count plural and singular, hidden at 0, link target `/events`, text when the count is not passed.
- `app/(public)/events/[id]/page.test.tsx`: counts registering events with seats (skips upcoming and full); filters `neq id` and `is deleted_at null`; no read when seats remain; no read when full but closed; a failed read throws.
- `app/(public)/events/page.test.ts`: an event at its cap is flagged full.
- `LiveScoreboard.test.tsx`: tile sub is "full" or "open".
- `LandingHero.test.tsx`, `CpdAccreditationSection.test.tsx`, `MultiBodyAccreditationWizard.test.tsx`, `edit/page.test.tsx` (breadcrumb), `EventsHome` footer and CSV status, `registrations/actions.test.ts` (regex).

## Gates (on tip 2d632a7)

- `tsc --noEmit` exit 0 [X]
- `eslint` on touched paths: 0 errors [X]. One old warning in `app/events/[id]/checkin/page.test.tsx:43` (`EDIT_DETAILS` unused), not in my diff.
- `vitest run`: 238 files and 2304 tests pass, 62 files skipped [X]. Run four times. The first run of the last gate had 2 failures, one later run had 1. See Findings F1.
- `next build` OK [X]. `check:ui-colours` passes [X].
- `check:ui-units` FAILS on `components/shell/SiteNav.tsx` (5 px, baseline 2, from 95f7913) [X]. `check:ui-primitives` FAILS on 4 old hits (`OrgOnboardingClient.tsx:120,142`, wizard `:243`, one more) [X]. Neither is in this diff.
- `test:rls`: NOT RUN. The guard refuses a non-local URL and I never point it at Seoul. No SQL, grant or migration changed, so the matrix is untouched [I].

## Live check

On the local stack (:3300 worktree and main-tree servers, never :3000), with real before and after frames sent to Ivan [X]:
- Public event page for a full fixture: before "1/1 registered." only; after the full line and "Browse 8 open events". The 8 matches the 9 cards on `/events` minus the full one.
- `/events` list: REGISTERING → AT CAPACITY. `/edit` Public page card and `/details` tile: text changed as listed above.
- Walk-in dialog: stale error before; grey with a reason and then enabled after.
- Body Admin dashboard with a draft ticked: live Delete before; disabled with the reason after. Deleted tab: row Restore live before; disabled with one reason line after.
- An organiser (review mode) still sees live Delete and no reason line [X].

## CI assertion

`vitest` covers each changed string and disabled state by name (list above). No CI file changed.

## Evidence tags

[X] gates, test fail-first, all frames, the user-lens walk on :3300, DB counts. [I] R2 and R3 already shipped (code read, not re-run); `test:rls` untouched; the server refusal path (`app/dashboard/actions.ts`, `canChangeEventStatus`) was read by the dev lens and hit once live by the user lens (toast seen).

## Backtest

`ZZ-R5 Full event` has cap 1 and 1 registration in the local DB; the public list showed "At capacity" [X]. Walk-in rows were read back from the DB in the earlier user-lens run [X]. All `ZZ-R*` rows, the read-only staff user and its auth user were deleted with counts (events 0, users 0, staff 0, registrations 0) [X]. One `ZZ-WALK Cardiology update` event dated 2026-11-15 is not mine and was left.

## Findings

Review counts: dev lens 0 BLOCKER, 1 MAJOR, 4 MINOR, 3 NIT. User lens 0 BLOCKER, 1 MAJOR (same as dev), 4 MINOR, 3 NIT. Earlier round (wave 1): dev lens 0 BLOCKER or MAJOR; user lens 3 MAJOR.

Fixed (before → after):
- Row Restore live for read-only roles: `onClick={onRestore} disabled={pending}` → `disabled={pending || readOnly}` plus `aria-describedby="bulk-why"` and a reason line above the Deleted list (`EventsHome.tsx:549`, `:423`). Closes dev M1 and user MAJOR 1.
- "Ask an organiser admin." → "Ask an organiser admin or member." on the bulk reason lines. Closes dev n2 and user MINOR 2 for the bar. The server toast still says "cannot" (F6).
- Other-events query had no order → `.order('start_time').order('id')`; gate `thisIsFull` → `thisIsFull && lifecycle === 'registering'`; `registrationCount` error now thrown (`page.tsx:113,120`). Closes dev m1, m2, m3.
- Page test checks filters, the no-read cases and the error. Closes dev m4.
- Stale comments in `EventsHome.tsx` and a `ponytail:` note that `canCreateEvents` and `canChangeEventStatus` name the same roles today. Closes dev n1 and n3.
- Public list, `/edit` card and `/details` tile said open for a full event (user-lens wave 1 MAJOR 1 and 2): now say full.
- Walk-in submit had no `aria-describedby` (wave 1 MINOR 5): added.

Not fixed, for Ivan:
- F1. `app/events/[id]/edit/PublishDraftButton.test.tsx` "shows a refusal inside the confirm…" is flaky: failed 1 of 6 solo runs [X], and caused the one failing full run in that gate. I did not touch it or its component. It needs its own card.
- F2. Roster did not update after a walk-in on the local stack (wave 1 user-lens MAJOR 3). Likely Supabase realtime on the local stack. Cause not established. Pre-existing.
- F3. `body_admin` still sees a blue Check-in button on the dashboard; the refusal sentence prints twice on the desk; Download QR and Export CSV stay enabled (wave 1 MINOR 6). Needs a card.
- F4. Duplicate-email walk-in message says "Use code entry" for someone already checked in. Pre-existing.
- F5. `/details` title column collapses at 1024 px. Pre-existing.
- F6. Server refusal text says "cannot" and the bulk line says "can’t"; New event says "or member". The toast is only reachable on a stale page now. Cosmetic.
- F7. Disabled buttons are not focusable, so `bulk-why` is not announced to a keyboard user. The New event button has the same limit. A fix is a `role="status"` line or enabled-but-inert buttons; both change the pattern, so it is Ivan's call.
- F8. Phone width: the sticky bulk bar with its reason line takes about a quarter of an 812 px screen.
- F9. The full-event page says "At capacity" three times (chip, heading, "This event is full."). This is the copy Ivan picked in the artifact.
- F10. Edit-page `metadata.title` stays "Edit event" for read-only roles (static metadata). Signed-in user who already registered sees the empty form again (m5, needs a new lookup).

## Deviations from the card and why

1. R4 landed in `RosterClient.tsx`, not `RegisterCard.tsx`. The stale "Name required" lives in the walk-in dialog.
2. R2, R3 and most of R1 had shipped before this pass; I verified them and did not redo them.
3. Backtest lens: run inline by the coordinator, not a separate agent. The brief said "do not ask other agents"; Ivan then overrode it for the review step with a dual-lens ask. Drop or add: say the word and a fresh backtest agent runs the same DB checks.
4. Added beyond the card, each with a way to drop it: the shared `lib/events/fullEventIds.ts` (revert 0975e9b's list change to inline it); the `StatusPill`/`StatusChip` `full` prop (revert b6dbafa); the other-events count read (revert 267cca1 for the page, keep the rest).
5. I committed and pushed (push on Ivan's explicit "Push main"). The brief did not say commit.

## Open questions for Ivan

1. Do you want F3 (body_admin dashboard Check-in, double refusal, QR and CSV) as a new card?
2. F7: keep the sibling pattern (disabled buttons, no focus), or change both bars to announce the reason?
3. F1: assign the flaky `PublishDraftButton` test to a card?
4. Run a separate backtest agent for this pass (Deviation 3)?

## Needs from other cards

None.

## Executor

Claude Sonnet 5.5 (coordinator session). Reviews by two fresh agents (dev lens `everything-claude-code:code-reviewer`, user lens `general-purpose`), reports in this session, not written to `REVIEW-*.md` files.

## Committed

Pushed to origin main 2026-11-22: ec4f976, 8669a92, b6dbafa, 3a6d246, 0975e9b, 267cca1, 2d632a7 (`c17d6b9..2d632a7`).

## Suggested commit message

docs(mvp): UX-R close-pass hand-back (cards UX-R1 to UX-R6)
