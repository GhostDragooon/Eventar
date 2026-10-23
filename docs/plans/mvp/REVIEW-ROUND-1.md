# Review round 1: disposition (2026-10-23)

Run at Ivan's instruction ("implement the review protocol after each task") over the six finished cards: CX-01, DB-01, UX-01, CX-03, CX-05, UX-03. Three separate lenses per scope, as the phase-completion protocol asks. UX-01 is specimens that Ivan decided from renders: no lens applies. Reviewers wrote only their REVIEW file; I verified claims before acting (Rule 14) and applied the fixes that sit inside the reviewed cards' own files, each with a test that fails without it (mutation-checked, restored with `cmp`). Evidence: [X] executed, [R] read.

| File | Lens | B / M / m / n |
|---|---|---|
| REVIEW-UX03-CX05-dev.md | dev | 0 / 2 / 10 / 6 |
| REVIEW-UX03-CX05-user.md | user | 0 / 1 / 10 / 3 |
| REVIEW-UX03-CX05-backtest.md | backtest (real sessions, real RPCs, local DB) | 0 / 2 / 1 / 2 |
| REVIEW-CX01-DB01-CX03-dev.md | dev | 0 / 1 / 4 / 5 |
| REVIEW-CX01-DB01-CX03-backtest.md | backtest | 0 / 0 / 6 / 4 |
| REVIEW-CX03-user.md | user | 0 / 4 / 7 / 3 |

No BLOCKER anywhere. Gates after the fixes: tsc clean, eslint 0 errors / 11 warnings, vitest 195 files / 1632 tests (405 skipped), `next build` compiles, check:ui-colours and check:ui-primitives report the same files as HEAD, and the backtest ran `pnpm test:rls` on the fixed tree: 43 files, 362 tests, three formerly failing files green twice back to back [X].

## Fixed in this round (inside the reviewed cards' files)

- **UX-03 dev M1:** `components/ui/Dialog.tsx` re-ran its focus and animation effect whenever the parent re-rendered with a new callback, pulling focus off the pressed button and replaying the open animation. Root cause fixed in the shared primitive (latest callback in a ref, effect depends on `open`). Two Dialog tests added.
- **UX-03/CX-05 dev M2:** the generic 42501 text sent an organiser admin who is not the creator to "ask an organiser admin". Added a `not_owner` branch ("Only the person who created this event, or Eventar staff, can make this change.") and made the generic refusal neutral (it also serves registration roles). The backtest confirmed this is the message that actually reaches the caller [X].
- UX-03 dev: unsaved-notice no longer returns on a later edit (m3); "Registered count above" wrong direction (m4); `?saved=1` and `?published=1` now drop out of Next's own URL as well as the address bar (m1, m5; user lens F5); "Check-in is open now" instead of "opens at" a past time (m6); dialog `aria-describedby` (m7); copy-link confirmation in a live region (m9); share link uses the canonical origin the QR uses (m10); a scheduled registration with an unknown zone no longer says "opens now" (n1); store `subscribe` hoisted (n3); the "Saved." line under the buttons retires when the form changes again (m2).
- **User lens F8:** the dialog shows the event timezone beside the check-in time, in the same `(Asia/Hong_Kong)` form the details header uses.
- **CX-03 dev:** the token list is now checked against `app/globals.css` by a test (MINOR-2); the `leading-*` interaction is pinned by a test (MINOR-3).
- **CX-01 dev:** `deleteTestUser` no longer swallows a failed delete (logs id and message) (MINOR-4); the leftover lookup is case-insensitive (NIT-5).
- **DB-01 dev:** the CI step now covers views and names every offending role, privilege and table (NIT-1); proven by injecting a grant: it names `anon TRUNCATE events` [X]; the seed header no longer names three tables as the revoke list (NIT-3).

## Needs Ivan (each is a decision, not mine to take)

1. **`updateEvent` has no status or creator gate** [X, backtest F1]. Any same-organisation colleague, including a member who did not create it, can edit a PUBLISHED event, and an update writes no audit row. The new dialog says "Details cannot be edited after publishing yet", which is true of the screens, not of the server. DB-04's lifecycle locks (content editable until completed) would not make it true either. Options: (a) gate `updateEvent` on `status = draft` until P9b, (b) leave it and reword the copy, (c) fold it into DB-04 and decide the rule there.
2. **UI says role, database says creator** [X, backtest F2; dev M2]. The wizard and the single-body field unlock for any organiser admin, but all accreditation and registration-role RPCs also require the creator (or Eventar staff). A same-organisation admin who did not create the event sees an enabled wizard and every write fails with the `not_owner` message. Publishing is organisation-wide, so the model is inconsistent. Several comments (`edit/actions.ts:25`, `updateAction.ts:74`, `edit/page.tsx:61`) say "owner-only", and my CX-05 hand-back said registration roles are limited "to the owning organisation": the live RPC is creator-only. Options: (a) gate the UI on creator too (small), (b) relax the RPC owner check to the organisation (SQL card, touches hosted), (c) leave. It needs one ruling on who may do what.
3. **`invite_tokens` keeps `service_role` INSERT/UPDATE/DELETE** [X, dev MAJOR-1]. It is a definer-only, audited table (`accept_invite_token` writes `invite_accepted`), so Hard Rule 11 says revoke it from `service_role` too. Not a regression (hosted is the same) and my DB-01 matrix pins the current grants as expected. A new `sql` card: migration revoke, seed line, a row in `audited_table_writes`. Touches hosted, so your go.
4. **`anon` holds DML at the grant layer on 11 never-narrowed tables**, including `registrations`, `users`, `consent_records`, and on `staff` (INSERT, DELETE) [X, backtest MINOR-4; dev "out of scope"]. RLS blocked a delete as anon on all 11, but 3 are empty so that proves nothing. Predates these cards; hosted is probably the same [I]. Rule 11 grant-layer work.
5. **Frontend findings from the user lens: show-and-decide.** I did not apply these. Each needs a before and after from you:
   - F1 [X] while editing, the unsaved banner is off screen and the sticky Publish card still reads "Ready to publish?"; only pressing it explains. Proposal: reflect the dirty state on the card (heading and button) as soon as the form changes.
   - F2 [X] the CX-05 lock sentence shows twice, 160 px apart, and the greyed 22-body select still invites a try. Proposal: one note, locked select shown as plain text.
   - F3 [X] the "Draft saved" banner sits one card below the fold and does not take focus (the Published banner does). Proposal: directly under the title, same focus treatment.
   - F4 / dev m2 [X] two live "saved" messages after Save changes (partly retired now: the bottom one goes on the next keystroke, but both show right after a save).
   - F6 [X] after publishing, Edit and padlocks are offered with no explanation of what is locked.
   - F7 [X] "What to do next" could start with "View your registration page" (same target as Public); the Registrations link waits for UX-04.
   - F9 [X] an incomplete Publish reports one missing field at a time. Proposal: one message listing everything missing.
   - F10 [X] a body administrator can save but has no in-product route to an organiser admin. Proposal: a link to the team list or "Copy link to this draft".
   - F11 [X] on a phone the Publish card is at the bottom of a long form.
   - F12 three names for one action: banner "Review and publish", card "Ready to publish?" and "Publish event", dialog "Publish this event?".
   - F14 the card's "Save" under CPD accreditation covers accreditation only; rename "Save accreditation" (in `CpdAccreditationSection`, not in my files).
   - m8 the banner may not be announced on first paint (a11y; my fix would be to focus it like the Published banner, which also moves keyboard focus on the edit page).
6. **CX-03 visual review (user lens), all [X] unless marked.**
   - M1: the Check-in button on each Manage row is STILL clipped for an admin ("Check" cut off): Edit and Check-in need more than the fixed 116 px column. CX-03 made the type smaller but did not fix it; my CX-03 hand-back said it no longer clipped, which was measured as ux-member and is wrong for admins. Corrected there. The fix is in `ManageWorkstation.tsx` (not in CX-04's list).
   - M2: bulk Cancel is red on pale red at 3.74:1 light and 3.79:1 dark, under 4.5:1 for 12px text. CX-03 restored the red ink that used to be evicted (dark text on pink read better), so the merger fix is right and the destructive token pair under it is too weak. Token decision.
   - M3: the selected roster filter chip "All (15)" is 2.37:1 light and 2.14:1 dark; `--secondary` against `--secondary-foreground` mismatch, very likely pre-existing [I]. Token decision.
   - M4: dark /pricing "Choose Essential" and "Choose Enterprise" are dark text on a translucent grey. I checked with the old `cn()` restored: identical colours, so this is pre-existing and not CX-03's [X]. The pricing page seems to scope some tokens as light inside dark mode.
   - Worked well: every blue primary label passes (white on `#0070f3` 4.55:1 light, navy on `#7fb0f4` 7.59:1 dark); the 12px badge reads as a badge; the roster "Check in →" is 44 px and 9.11:1. `/login` was not reachable signed in; "Send magic link" rests on the same token pair [I].
   - Still unchecked by anyone: `/login` signed out.

## Deferred, with an owner

- `tests/rls/controlled_lists.rls.test.ts` titles now say "RLS blocks" while the grant layer blocks first (dev MINOR-1): retitle or add a rolled-back test that grants UPDATE and asserts RLS still blocks. A `sql`-card test change (outside DB-01's files).
- A stale static-name staff row (e.g. `markattended-owner@...`) from a crashed run still breaks the next run's `beforeAll`; CX-01 healed auth users only (backtest MINOR-1, already an open question in CX-01.md). Suggested: a small harness card that clears leftover staff rows by email prefix before insert.
- Residue from a full `test:rls` run: 9 auth users, 2 staff, 2 events, 11 registrations, attributed to `tests/cpd/roster_eligibility` and `award_f1_f5_gate` (backtest MINOR-3). Old residue untouched: 3 orphan `checkin-throughput-staff-*` rows, the 200 `WK-BUR` burst registrations, 2 "DELETE ME" events.
- Comments that still say `text-on-primary!` exists because of the merge bug (dev NIT-2): retire in the next card that touches each file; drop the `!` only with Ivan's say-so.
- `text-title-md`, `text-title-sm` and `text-label-lg` are used in code with no `--text-*` token (backtest NIT-4).
- Dev n5: dirty-tracking tests edit only the title; a mutant dropping another field from the snapshot would survive (every submitted field is in the array [R]); a table-driven test would close it.
- Dev n4: if `router.push` never completes after a successful publish the dialog stays undismissable until a reload. Rare.
- `?saved=1` live behaviour after the fix was not re-walked in a browser (unit test only).

## Process notes

- Two reviewers hit the account session limit mid-run; both were resumed from their saved work, not re-dispatched, and wrote their files.
- A reviewer reported a block in a tool result that looked like a coordinator message; it was my own resume message misattributed. No instruction was followed from it.
- One backtest finding corrects my brief: a second publish of an already published event is idempotent (`{ok:true}`, no second audit row), not a refusal [X].
