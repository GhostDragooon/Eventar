# Ivan rulings 2026-11-01: hand-back

STATUS: DONE locally, NOT pushed. Reviews: `REVIEW-ivan-rulings-1101-dev.md`, `REVIEW-ivan-rulings-1101-user.md`.
Evidence tags: [X] executed, [R] read, [I] inferred.

## Commits (local, on top of `65fa5ff`)
| SHA | What |
|---|---|
| `9054e6f` `e3d0917` `9f586f8` | Email stub-vs-real switch cherry-picked from `claude/distracted-haibt-18a25a` (both fixes + handoff). Branch itself untouched. |
| `4260d35` | Shared `signOutAndLeave()`; AccountShell, AccountMenu, SignOutAction (account Session card, organiser Settings); menu items Account, Profile, Record |
| `db29673` | Signed-in attendee brand -> `/events` (SiteShell, PublicShell) |
| `0af07d7` | One wrong-door line for the organiser door, no password or staff-list language |
| `6c733b8` | AuthBackdropCard gradient from `--primary` (check:ui-colours clean) |
| `c3172b9` | spec 001, CX-06a, conflict map labels |
| `7ec0f09` | Review round 1: menu stays open while signing out, alert outside `role=menu`, SignOutAction test |
| (this commit) | One sign-out failure string everywhere; panel pointer text; review files; this file |

## Tests
Tip gate on the final tree: tsc 0; eslint 0 errors; vitest 214 files, 1899 passed, 544 skipped; `next build` 0; `check:ui-colours` clean [X].
Backtest on local GoTrue [X]: logout blocked -> `signOut` returns `AuthRetryableFetchError`, local session kept, server still accepts the token (200); retry clears it; the old token then gets 403.
Browser (user lens) [X]: failure and success in the Session card, both rails, the public menu, `/account/complete` and organiser Settings, at 1280 and 375.
Mutations (dev lens) [X]: removing `if (error)` fails 3 tests; reverting the brand href fails 2.

## Open risks (Ivan decides; frontend items need before/after first)
1. U-01 Back after Sign out restores `/account` with name and email from bfcache (Chrome); reload redirects. Shared-device privacy. Fix needs `no-store` on authed pages or a `pageshow` re-check. Not in these rulings.
2. U-02 vocabulary: menu says Record, rail says History (Soon), `/account/record` highlights Account. Pick one noun.
3. U-05 the wrong-door line names "Attendee log in" and "Sign up" but they are not links in the message; the real links are small, one at the top, one in the footer (below the fold at 375).
4. F5/U-04 `/login` help text still says "organizer list", "Contact an admin to be added", "Organizer access only"; US/UK spelling mixed.
5. F12 backdrop uses the named colour `black` inside `color-mix` (not caught by the check) and looks different light vs dark; no before/after shown yet.
6. U-06/F11 focus drops to body while a Sign out button is disabled; U-07 two identical alerts if both buttons fail; U-09 no "signed out" confirmation on landing.
7. U-12 staff email at the attendee door lands on `/dashboard`, and the public page has no Sign out for staff; confirm intent.
8. Not checked: review mode was ON on :3100 (staff routes, staff Back test), production build in a browser, Safari/Firefox, keyboard/screen reader, expired-session sign-out, second-tab sign-out.
9. CLAUDE.md Hard Rule 7 still says sends are stubbed regardless of stage. False for production builds; replacement text is in `EMAIL-SWITCH-HANDOVER.md` section 0 item 5. Not edited.
10. `.claude/skills/eventar-static-gates/SKILL.md` has the `rg` -> `grep -E` fix on disk, uncommitted, inside the autoharness-owned dirty tree.
11. Cancelled-event roster renders read-only but is reachable only by URL (Details hides the Roster link). UX-04 owns it.
12. Local stack leftovers: append-only `audit_events` rows and Mailpit mail for `zz-userlens-1101-*`.
13. Phone Settings clip not touched (navigation design round).
