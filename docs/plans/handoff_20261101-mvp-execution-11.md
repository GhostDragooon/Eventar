# Handoff, 2026-11-01: door copy built and reviewed; nothing pushed

**Date:** 2026-11-01
**Status:** Door copy DONE for the picked scope (dev and user lenses run, fixes applied). Five open questions for you in §0.
**Chain:** `mvp-execution` seq `11` · **Parent:** `handoff_20261101-mvp-execution-10.md`
Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (recommendation first)
1. **Invite page has two "Log in" controls that go to different doors** (user lens M1). The header pill goes to the attendee door; the body button "Log in to accept" goes to `/login?next=/invite/<token>`. Tapping the pill makes an attendee account and loses the invite. Recommend: on `/invite/*` point the shell pill at the same `/login?next=` href (one prop on `SiteShell`).
2. **Organiser door is not visible outside the landing** (M5). `/events` and the sign-up door show only the attendee "Log in"; the organiser door appears only after flipping the landing pill. Recommend one extra link, "Organiser log in", in the public header for signed-out visitors and under "Already have an account? Log in" on sign-up.
3. **"Sign out" vs "Log in".** The verb pair is log in / sign out. Recommend leaving "Sign out" (it is the universal pairing) and recording that as the ruling.
4. **Wrong-door message for the magic-link organiser door.** R1's text ("The email or password you entered is not correct.") assumed a password door; you withdrew that. Today the door says the response "does not reveal whether an address is on the organizer list". Recommend one line for a non-staff email that stays bland and points to the Attendee door and Sign up, with no limbo (doctrine section 1). Needs your wording.
5. **Sign-up door names:** the H1 still says "Create your Eventar record" (kept as the page's promise); tab title and buttons say "Sign up". Recommend leaving it.
6. Carried from seq 10: shared `signOutAttendee()` ruling (fail visibly vs always leave), public-page vocabulary after the shell, Attendee surfaces card, email branch merge, seq 8 items.

**Execute** (only Ivan): push `main` up to the tip SHA in my last message, if you want it. Local `main` is 11 commits ahead of `origin/main`; nothing from UX-02 or door copy is pushed.

**Queued for Claude:** wrap the pending items above once decided; fix the tip-gate script's `rg` call; update `specs/001-attendee-portal/spec.md` (hero button "Get started" is now "Sign up"; "Sign in" wording; FR-006 and SC-004) and `mvp/DOCTRINE-CONFLICT-MAP.md` / `CX-06a.md`, which still quote the old labels.

**Other sessions:** none running.

---

## What changed (picks in `docs/plans/mvp/PICKS.md`: "Door copy (words): a" and "(button): a")

- Words: **Log in** and **Sign up**, sentence case. Landing pill, `SiteShell`, `PublicShell`, both log-in doors, door switch links, `AuthBackdropCard` other-door link, invite "Log in to accept", `RegisterCard` "Log in or sign up first" and its post-registration "Sign up" button, roster stale-session "Log in", check-in confirm banner. Hero "Get started" is now "Sign up". Sign-up door eyebrow reads "Attendee · Sign up".
- Button: **Next** on both log-in doors and the sign-up door. The existing help line (now "Eventar will send a one-time log-in link.") is attached to the button with `aria-describedby`.
- Landing pill's "Practitioner" tab reads **Attendee** (doctrine section 1).
- Review-round sweep (rule: rename every string that names the action): tab titles ("Log in", "Sign up"), `auth-error-messages.ts`, `claimErrorCopy.ts`, `signedOutCopy.ts`, the check-in and walk-in signed-out messages, invite action errors, `ControlledAccessNotice`, the `/login` "Trouble logging in?" list.
- **Left on purpose:** state lines ("Signed in as …", "You're signed in as an organiser"), "Sign out", the `signInHref` / `active="signin"` identifiers, code comments, `/login` page's "organizer" spelling (the card mixes organiser and organizer; a separate sweep), the Supabase email template (outside the repo [I]).

## Checks

| Check | Result |
|---|---|
| Tip gate on `78d8dca` | tsc 0; eslint 0 errors (5 old warnings); vitest 210 files, 1877 passed, 544 skipped; `next build` 0 [X] |
| Dev lens | 0 blocker, 2 major, 6 minor, 3 nit; the diff is copy-only, no e2e specs pin the old words. Majors (check-in banner, sign-in tab title) fixed. `REVIEW-DOORCOPY-dev.md` |
| User lens | 0 blocker, 5 major, 6 minor, 3 nit. Fixed: titles, old wording around the card, Practitioner/Attendee. Open: M1 and M5 (§0 Decide 1 and 2). No overflow at 375 on six routes. `REVIEW-DOORCOPY-user.md` |
| Tests | Updated in 20 files for the new words; new: submit button described by the help line, sign-in door "Sign up" link target, sign-up eyebrow |
| Not done | A backtest agent: this card has no mutation surface (door forms send email and were not submitted). A real magic-link round trip on the local stack was not run |

## Gotchas

- Hoisted `vi.mock` factories cannot see top-level helpers (use `vi.hoisted`).
- The review-mode session blocks the door pages in the Chrome pane; the user-lens agent used a clean Playwright browser.
- `git add -A -- app components` stages peers' files too; here the tree was clean, but use pathspecs.

## Where we're going

1. You read §0 (about 4 minutes) and answer Decide 1 and 2 first (the only two that affect a user's first minute).
2. I apply them, then the Attendee surfaces card if carded.

## Files to open first

- `docs/plans/mvp/REVIEW-DOORCOPY-user.md` (the string table) and `-dev.md`.
- `components/auth/MagicLinkSignInForm.tsx`, `app/account/sign-in/page.tsx`, `app/login/page.tsx`.
