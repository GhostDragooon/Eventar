# Handoff, 2026-11-01: the MVP build order is done and pushed; five rulings wait for Ivan

**Date:** 2026-11-01
**Status:** DONE and PUSHED. `origin/main` = `35affc8`. The build order CX-04R, UX-02 re-cut, door copy is complete; nothing else is queued without a ruling.
**Chain:** `mvp-execution` seq `12` · **Parent:** `handoff_20261101-mvp-execution-11.md` (read it for the door copy detail and the review tables)
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Shared sign-out failure behaviour** (two reviewers disagree). `signOut()` is copied in `AccountShell.tsx`, `AccountMenu.tsx` and `AccountClient.tsx`; it redirects to `/` after the call resolves and ignores `{ error }`. Recommend one `signOutAttendee()` that reads `error`, stays on the page and says "Could not sign out. Try again." on failure. Small card.
2. **Wrong-door message wording for the magic-link organiser door.** R1's password text was withdrawn. Needs one bland line for a non-staff email that points to the Attendee door and Sign up, with no limbo (Doctrine section 1). Your wording.
3. **Attendee surfaces card** (Registrations, History, attendee Check-in pages). Three of five attendee nav rows are inert "Soon" rows until it lands. Recommend carding it next: the portal is thin without it.
4. **Public pages after the shell:** event detail and the guest registration flow still use the public pill with "My record / Profile & memberships / Account settings", and the signed-in brand goes to `/`. Recommend renaming those menu items to the doctrine labels and pointing the signed-in brand at `/events` (small), wrapping event detail in the shell later.
5. **Email stub-vs-real branch** (`origin/claude/distracted-haibt-18a25a`, pushed 2026-10-31, unmerged) and seq 8 Decide 1 and 3: unchanged, see seq 9 and seq 8.

**Execute** (only Ivan): nothing is waiting to be pushed except this handoff commit. Hosted migrations: unchanged.

**Queued for Claude** (no ruling needed): fix the tip-gate script's `rg` call; update `specs/001-attendee-portal/spec.md` (hero button, "Sign in" wording, FR-006, SC-004), `mvp/DOCTRINE-CONFLICT-MAP.md` and `mvp/CX-06a.md`, which still quote the old labels; sweep the organizer/organiser spelling on `/login`.

**Other sessions:** none running. The idle "Doctrine consolidation and validation" peer is unchanged [X, `ListAgents`].

---

## What is pushed (`3e0c208..35affc8`, 15 commits)

- UX-02: re-cut specimens, picks recorded, `AccountShell` (rail, five tabs sized to labels, onboarding bar), mounted on the account pages and on `/events` for a signed-in attendee with a complete account; three review rounds and fixes.
- Door copy: "Log in" and "Sign up", "Next" on every door, side label on sign-up, "Attendee" on the landing pill, titles and error copy swept; the invite header pill goes to the organiser door; "Organiser log in" on public pages.
- Docs: seq 9, 10 and 11 handoffs, all rulings in `docs/plans/mvp/PICKS.md`, six review files in `docs/plans/mvp/`.

## Checks

| Check | Result |
|---|---|
| Tip gate on `1bab723` (code identical to the pushed tip; later commits are docs) | tsc 0; eslint 0 errors; `next build` 0; vitest 210 files, 1883 passed, 544 skipped on the second full run [X] |
| First full run | One failure, `PublishDraftButton.test.tsx`, a known load flake (10-23 and 10-24 handoffs); 3/3 alone [X] |
| Push | Pinned SHA, `origin/main` verified ancestor first; after the push `origin/main...main` = `0 0` [X] |
| Not run | A real magic-link round trip on the local stack; the Sign out click in a hydrated browser (server side proven in the backtest); a 320 px pane (measured in a 320 px iframe) |

## Gotchas

- The pane clamps emulation to 335 px: measure 320 in an iframe.
- Review mode shows an organiser header in the Chrome pane: use a clean Playwright browser for signed-out pages.
- Hoisted `vi.mock` factories cannot see top-level helpers (use `vi.hoisted`).
- `git add -A -- app components` stages a peer's files too; use pathspecs.
- A parked `.claude/skills/` tree in `git status` is the autoharness run's; nothing here staged it.

## Where we're going

1. Ivan reads §0 (about 3 minutes) and rules on any of 1 to 4.
2. If carded: Attendee surfaces card, then the sign-out and public-vocabulary small cards.

## Files to open first

- `docs/plans/handoff_20261101-mvp-execution-11.md` (door copy review tables).
- `docs/plans/mvp/PICKS.md` (bottom): every ruling in order.
- `components/shell/AccountShell.tsx` and its test.
