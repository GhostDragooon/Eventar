# Review DECIDE-2 (user perspective): Speakers card follows the check-in window

Reviewer: user-perspective agent, cold organiser. Date: 2026-11-04. Local stack only (:3100, local DB).
Persona: ux-admin@eventar-review.invalid (organiser_admin; identity confirmed from the sidebar footer "ux-admin ... Organiser Admin").
Event: 960f8842-f0f0-4448-9573-a2a71a68dcd2 (ZZ-WALK Draft 1). Desk has 6 speakers (Speaker A, ZZ fill 2, ZZ fill 6, Speaker B, ZZ fill 10, ZZ fill 14).

## STATUS: PARTIAL. The 40-tool-call cap was reached after the BEFORE state and half of INSIDE.

Verified: BEFORE (fully), INSIDE (load state only). NOT verified: INSIDE tick/untick/persist, INSIDE-to-AFTER stale click, AFTER state, body_admin card. The window was restored to "after" (ended 1 h ago) at the end.

## State table

| State | Speaker buttons | Reason sentence | Real click result | DB read-back |
|---|---|---|---|---|
| BEFORE (starts in 3 h) | All 6 `disabled=true` [X]. Opacity 0.5, `pointer-events:none`, 44 x 96 px [X] | "Check-in has not opened yet. It opens 60 minutes before the event starts." in `#checkin-closed-note` (`role=status`). Buttons carry `aria-describedby=checkin-closed-note` [X]. No `title`, no `aria-label` [X] | Real click at Speaker B: nothing happened. No toast, no banner, no state change (screenshot before/after identical) [X] | Only Speaker A row, unchanged (checked_in_at 2026-11-03 01:18:16.893+00) [X] |
| INSIDE (started 30 min ago) | All 6 `disabled=false`, `aria-describedby` absent [X]. Note reads "Check-in is open." [X] | n/a | NOT VERIFIED (cap) | NOT VERIFIED |
| AFTER (ended 1 h ago) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Window restored to this state at the end; DB shows Speaker A only |
| Stale INSIDE to AFTER click | NOT VERIFIED | | | |
| body_admin, INSIDE | NOT VERIFIED | | | |

## Four questions for the Speakers card, BEFORE state [X]

- Where am I: yes. Breadcrumb "Check-in", H1 event name, card headed "Speakers 1 / 6".
- Main thing: the hero says "Starts in 2h 59m" / status "Not open yet", so the desk-level state is clear.
- How do I progress: only implicitly. The card has no wording of its own. The sentence "It opens 60 minutes before the event starts." tells the organiser to come back later, but not at what clock time (the hero gives only a countdown).
- How do I get back: sidebar and breadcrumb are intact. No dead end for navigation.

## Findings

### MAJOR

1. **MAJOR [X] The reason sentence sits outside the Speakers card.** `#checkin-closed-note` is not inside the card (`section.contains(note) === false`). At 1024x768 it is about 175 px above the card; the card top is at y=687 of a 768 viewport, so the card is mostly below the fold and the sentence is a separate block above the Scan badge. A tired organiser at a door who scrolls straight to Speakers sees six greyed buttons and no words. Screen readers do get it through `aria-describedby` [X], so this is a sighted-user problem. Suggested fix: repeat a one-line caption inside the card header when `canCheckIn` is false (the existing text can be reused).

2. **MAJOR (product consequence of the ruling, not a bug) [R+X] Early speaker or post-event correction leaves the organiser with no way forward.** Outside the window every speaker button is disabled and pointer-events are off, and the server refuses with the same wording. Consequences: (a) a speaker arriving more than 60 min early cannot be ticked; (b) a wrong tick made inside the window cannot be corrected once the event ends. There is no override, no "contact an admin" path, and no wording that says this is final. The sentence for the AFTER state was not verified. Needs an explicit Ivan call: either accept (state it in copy: "ticks are locked after the event ends") or add an admin correction path.

### MINOR

3. **MINOR [X] Disabled click gives no feedback.** Clicking a disabled Speakers button does nothing and shows no toast. Because of `pointer-events:none` the click does not even focus anything. Acceptable only if the reason is visible next to the card (see finding 1). Keyboard users are fine: the button is natively disabled and described by the note.

4. **MINOR [X] Tick made before the window still shows as a normal tick.** Speaker A displays "Checked in at 03 Nov 2026, 09:18" while the event starts 04 Nov 05:06 (INSIDE state). Fixture artefact from before the ruling, but a real organiser would see a tick time that predates the event, with no flag. Under the new rule this can only happen with legacy rows; low frequency.

### NIT

5. **NIT [X] No `title` or tooltip on the disabled buttons.** The reason is reachable by `aria-describedby` only. Fine for AT, invisible to a hovering mouse user.
6. **NIT [X] The note text changes to "Check-in is open." inside the window.** It is a live `role=status` region; harmless, but it is a sentence an organiser does not need.

### Accessibility checks [X]

- Disabled button keeps a 44 px target (`min-h-11`, measured 44 x 96). Passes.
- `aria-describedby="checkin-closed-note"` is present on every disabled speaker button and the target id exists with the right text. Passes.
- Disabled state uses opacity 0.5; contrast of the label on the disabled state was not measured.

## Not verified (cap reached)

- INSIDE: tick Speaker B, "Checked in at <time>" text, untick, persistence on reload, DB read-back after each.
- Stale case (INSIDE page, window moved to AFTER by SQL, click Speaker B): the toast wording and whether the button rolls back. Source `SpeakersCard.tsx` shows optimistic update, rollback on `'error' in res` and `onError(res.error)`; not executed.
- AFTER state in full (buttons, note wording "Check-in is closed. This event has ended.", server refusal).
- body_admin (ux-body@eventar-review.invalid) card and role sentence.
- Server-side refusal wording was not read from `speakerActions.ts` or exercised.

## Environment notes

- The first sign-in state in the pane was an attendee session (zzlic1@final.invalid); I signed it out and used the magic link for ux-admin via local Mailpit (token not recorded here).
- Browser pane returned `getBoundingClientRect() = 0` on the first JS call after a navigation and `read_page`/`find` returned empty/no matches; a second call later worked. All click attempts used coordinates from a screenshot, not element refs, so "disabled click does nothing" is reported as executed observation with that caveat.
- Fixture state at end: window set to ended 1 h ago; speaker_checkins unchanged (Speaker A only).
