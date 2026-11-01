# Handoff, 2026-11-01: UX-02 built, reviewed three ways and backtested; nothing pushed

**Date:** 2026-11-01
**Status:** UX-02 DONE (built, dev, user and backtest lenses run, fixes applied). Door copy is next.
**Chain:** `mvp-execution` seq `10` · **Parent:** `handoff_20261101-mvp-execution-9.md`
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Sign-out failure behaviour (two reviewers disagree).** `signOut()` in `components/shell/AccountShell.tsx`, `AccountMenu.tsx` and `AccountClient.tsx` redirects to `/` only after the call resolves and ignores `{ error }`. Dev lens: on a network failure the cookie session survives and a stalled promise leaves the button dead (Hard Rule 12). Backtest: make the user always leave. These contradict. Recommend one shared `signOutAttendee()` that reads `error`, keeps the page and says "Could not sign out. Try again." on failure. One small card.
2. **Public pages after the shell** (review M2, deliberate under pick 3b, now a vocabulary mismatch). Event detail, guest registration and confirmation use the public pill with "My record / Profile & memberships / Account settings", and the signed-in brand goes to `/`. Recommend: rename those menu items to the doctrine labels and point the signed-in brand at `/events` (small, mechanical); wrapping event detail in the shell stays a later decision.
3. **Three of five attendee nav rows are Soon** (Check-in, Registrations, History). Their pages are the Attendee surfaces card, not carded (your 2026-10-31 order). Recommend leaving the order (door copy next), then carding it: the portal is thin until it lands.
4. Carried from seq 9: merge the email stub-vs-real branch (`origin/claude/distracted-haibt-18a25a`), worktree clean-up, seq 8 Decide 1 and 3.

**Execute** (only Ivan): push `main` up to the tip SHA in my last message, if you want it. Local `main` is ahead of `origin/main`; nothing from UX-02 is pushed. Hosted migrations: unchanged.

**Queued for Claude:** door copy (CX-06a and CX-06b merged scope); fix the tip-gate script's `rg` call; update spec 001 FR-006 and SC-004 (they still say every destination is one action); `/events` card overflows 15 px at a real 320 px with a long unbroken title (listing, not the shell).

**Other sessions:** none running; the idle "Doctrine consolidation" peer is unchanged.

---

## What shipped

Picks (all in `docs/plans/mvp/PICKS.md`): phone nav 1b, sign out 2a, Events 3b, onboarding bar 4a, unbuilt destinations 5a, rail 6a, row shape 7a; review follow-ups: tiny "Soon" under each unbuilt phone tab, 2 px top rule on the current phone tab.

| Where | Change |
|---|---|
| `components/shell/AccountShell.tsx` (new) | Rail on desktop, five tabs sized to their labels on phones, onboarding variant. Events and Account are links; Check-in, Registrations, History are inert rows (title, sr-only "coming soon", visible "Soon"). Brand links to `/events`. |
| `components/shell/BrandMark.tsx` | `href={null}` draws the mark with no link (used on the onboarding bar so the wizard's `?next=` is not dropped). |
| `/account`, `/account/record`, `/account/profile`, `/account/claim` | Wrapped in `AccountShell`. Dead `getUnlinkedRegistrationCount` reads removed from record and profile. |
| `/account/complete` | Onboarding bar: brand (not a link), email (under the bar on phones), Sign out. |
| `/events` | `AccountShell` only for a signed-in attendee with a complete account; visitors, organisers and incomplete accounts keep the public pill. |

## Checks

| Check | Result |
|---|---|
| tip gate on `04042d9`, final | tsc 0; eslint 0; vitest 210 files, 1874 passed, 544 skipped (stack-dependent files); `next build` 0 [X] |
| New tests | `AccountShell.test.tsx` (order, links vs inert, current place incl. `/eventsfoo`, `/accounts`, `/events/abc`, phone bar, Soon text, current rule, sign out); `app/account/portalShell.test.tsx` (four pages render in `AccountShell`, incomplete accounts redirect); `/events` shell by audience; `/account/complete` variant |
| Mutation checks | Staff clause on `/events` removed: 1 test failed. `claim` page back to `SiteShell`: 1 test failed. Both restored [X] |
| Dev lens | 0 blocker, 1 major, 8 minor, 5 nit. Fixed: M1, m1, m2, m3, m6, n1. `docs/plans/mvp/REVIEW-UX02-dev.md` |
| User lens (partial, hit its cap) | 0 blocker, 2 major, 6 minor, 4 nit. M1 fixed (Soon cue); M2 is Decide 2. `REVIEW-UX02-user.md` |
| Backtest | 0 blocker, 1 major (phone "Soon" contrast 2.1:1, fixed to full colour in `04042d9`, not re-measured), 3 minor, 2 nit. 28 pass, 3 fail (the contrast), 3 not verified. `REVIEW-UX02-backtest.md` |
| Not verified | The real Sign out click in a browser (the pane never hydrated `/account/complete` for the backtest; the user lens did run the onboarding Sign out earlier). Server side proven: logout 204, old token 403, fresh GET redirects to sign-in. Phone dark theme after the final contrast fix. A 320 px pane (measured in a 320 px iframe because the pane clamps to 335) |

## Gotchas

- The pane clamps emulation to 335 px; measure 320 in an iframe.
- The dev "Review mode" pill and Next indicator cover the bottom 66 px at phone width and sit over the tab bar.
- Hoisted vitest mocks cannot see top-level helpers: put `ok`, `chain` etc. in `vi.hoisted` (cost me one failed run).
- A polymorphic `const Mark = cond ? 'div' : Link` fails typecheck; use explicit branches.
- `getAccountMenuState` still computes an unlinked count on every signed-in `/events` load that the portal branch ignores (harmless, one read).

## Where we're going

1. Ivan reads §0 (about 3 minutes), answers any of Decide 1 to 3.
2. Door copy: landing pill, both doors, R1 copy, side labels (`mvp/DOCTRINE-CONFLICT-MAP.md` section 8). Claim it first (`parallel-session-card-claim`).
3. Then the Attendee surfaces card, if carded.

## Files to open first

- `components/shell/AccountShell.tsx` and its test.
- `docs/plans/mvp/REVIEW-UX02-{dev,user,backtest}.md`.
- `docs/plans/mvp/PICKS.md` (bottom): every UX-02 ruling.
