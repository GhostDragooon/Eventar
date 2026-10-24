# CX-06a The practitioner funnel: door, success prompt, empty record, `next` (A1, A2, A4, A5)
STATUS: DONE
Changed [R]: `components/landing/LandingHero.tsx` (+test), `components/RegisterCard.tsx` (+test), `app/account/record/RecordClient.tsx` (+test), `app/account/complete/page.tsx`, `CompleteClient.tsx`, `app/account/sign-in/{actions.ts,page.tsx,page.test.tsx}`, `app/account/sign-up/{page.tsx,page.test.tsx}`. New: `app/account/sign-in/{attendeeNext.ts,attendeeNext.test.ts,actions.test.ts,nextGate.test.tsx}`, `app/account/complete/{page.test.tsx,CompleteClient.test.tsx}`. LOCK `updated:` line kept current, LOCK left in place.

Behaviour [X, vitest]:
1. Hero, practitioner: "Get started" -> /account/sign-up, "Log in" -> /account/sign-in; organiser pair untouched; comment updated.
2. Success card, copy as given: signed out -> "Create your Eventar record" -> `/account/sign-up?next=/account/claim`; signed in -> "This is now on your record." + "My record" -> /account/record; staff -> nothing. Outline link-button, 44 px, same slot as the staff "Register another guest".
3. Empty attendance: "No linked events yet. Browse events to register, or link past registrations from Account." ("Browse events" -> /events; Account link kept).
4. `next`: one gate `attendeeNextPath` (safeNextPath + classifyPath === 'attendee') applied at all four sinks: `sendAttendeeMagicLink`, sign-in page, sign-up page, `/account/complete`. Sign-up routes the emailed link through `/account/complete?next=<dest>` (only when a destination exists); the page hands `<dest>` to the wizard ("Done" -> dest, default /account/record) or passes an already-complete account straight to it; `next` also survives the page's own sign-in redirects. Hostile `//evil.example`, `/\evil`, `/dashboard` (also `/login`, `/settings`, `/account/../dashboard`) -> /account/record.

Tests added or changed, and the mutation run for each guard (all restored byte-identical, `cmp` clean) [X]:
- LandingHero: pair + "never /login or /dashboard" (changed the 2026-09-25 single-CTA lock). Mutation: Log in href -> /login: both fail.
- RegisterCard (5 new): href without `?next` -> fails; drop `!isStaff` on record block -> staff test fails (test passes a matching session email so the guard is what stops it); drop `!signedIn` on create block -> 2 fail; drop email-match -> "registering someone else" fails; drop `toLowerCase` on session email -> case test fails; My record href -> /account fails.
- RecordClient (3 new): link href -> / fails; old copy fails 2; link inserted in non-empty branch fails.
- attendeeNext (25): classify raw instead of resolved path -> dot-segment tests fail; safeNextPath only -> 8 fail; allow wizard -> fails; drop safeNextPath -> absolute URL fails.
- sendAttendeeMagicLink (12, new file): back to safeNextPath -> 4 fail (HEAD honoured /dashboard); default -> /account -> 9 fail.
- Sign-in/sign-up pages + nextGate (hidden field, wrap, encode, no-wrap on wizard/no destination, already-signed-in redirect): ungated `next` on either page -> fails (hostile hidden-field, already-signed-in and nextRedirect cases); no wrap -> 2 fail; wrap wizard -> 1; unencoded -> 2; always-wrap -> 6.
- /account/complete page (20) + client (3): passthrough ignores dest -> 1; ungated -> 12 fail; not passed to client -> 2; sign-in redirects drop dest -> 2; client pushes record -> 1; wizard self allowed -> 2; client default -> 1.

Gates (sequential) [X]: tsc 0 errors · eslint on changed files 0 errors, 0 warnings · vitest touched dirs 16 files / 244 passed · full `vitest run` 202 files passed, 48 skipped, 1773 tests passed, 453 skipped · `check:ui-colours` and `check:ui-primitives` list only the known files (DashboardWorkstation, ProfileClient, RosterClient, OrgOnboardingClient, MultiBodyAccreditationWizard); none of mine · build, test:rls: not run (forbidden by the brief).
Live check: not run (brief forbids browsers and servers); sign-up -> email -> callback -> wizard -> destination is proved per hop in unit tests, not end to end [I]. The coordinator's walk should do it.

Deviations and why:
- "This is now on your record." shows only when the registered email equals the session email (mirrors `registerForEvent`'s emailMatchesSession). Otherwise a signed-in visitor registering a colleague would be told something false (rule 12); they get nothing. One condition to delete if you disagree.
- `next` is carried by the sign-up hop above, not by fixing the guard redirects (`/account/claim`, `/account`, `/account/record`, `/account/profile` -> `/account/complete`, all drop `next`): those files are outside the card. A plain sign-in that hits the wizard still lands on /account/record (spec US2 scenario 4 allows it).
- Gate lives in a new `app/account/sign-in/attendeeNext.ts`, not `lib/authDoor.ts` (outside the card). It classifies the resolved path: `classifyPath('/account/../dashboard')` returns 'attendee' [X, mutation] while the browser loads /dashboard.
- Existing sign-up test `forwards ?next=` used `/events/abc123`, not an attendee path (event ids are UUIDs); now a UUID.
- New test files in `app/account/complete/` were not named by the card; needed for "behavioural tests for each item".

Needs Ivan: nothing (no design decision; no new layout, colour or motion). Wording is mine where the card gave none: the empty-state sentence above.
Open questions:
1. `lib/authDoor.ts` `classifyPath`/`isOrganiserWorkspacePath` classify the raw string, so dot-segments mislabel (affects `/auth/callback`'s `errorBase`, not just this card). Fix there, then move `attendeeNextPath` in? Needs a card.
2. Make the four guard redirects pass `?next=<own path>` so a plain sign-in resumes too? Needs a card (files outside CX-06a).
3. `isStaffSession` fails open (page.tsx): if the staff read errors, an organiser could see the "My record" prompt when their email matches. Pre-existing posture; not changed.
Executor: Claude Sonnet 5.5, Claude Code executor agent. Committed: (blank). Fixtures created: none.
Suggested commit message: `feat(funnel): practitioner hero pair, registration success prompt, empty-record link, attendee-only next carried through sign-up and the wizard (CX-06a)`

## Review round (coordinator, 2026-10-24): dev, backtest, user lenses
Files: `REVIEW-CX06A-dev.md` (0 BLOCKER / 2 MAJOR / 3 minor / 6 nit), `REVIEW-CX06A-backtest.md` (0/0/2/2, live with curl, real magic links, PKCE cookie jar), `REVIEW-CX06A-user.md` (0/1/5/5, partial: the lens hit its call cap at the wizard's Professional step).
- Gate (`next`): ~80 hostile inputs run through `attendeeNextPath` by the dev lens and 31 values by the backtest on the real pages, action, emailed link, callback and wizard: no hostile or organiser value reached a redirect, hidden field, `redirect_to` or the wizard's destination [X both]. Backtest NIT: `/events` (the listing) is not honoured (falls back to /account/record); nothing produces `next=/events`.
- Fixed in this round, each with a test that fails without it (mutation-run, restored):
  - D-01 MAJOR: the poster page (`/events/<id>/poster`) rendered the card without `signedIn`/`isStaff`, so a signed-in practitioner and an organiser were offered "Create your Eventar record". `signedIn` is now tri-state: `undefined` (host does not know) shows no account prompt; only an explicit `false` offers the create link. Staff guard on the create block now tested (D-07).
  - D-02 MAJOR: "This is now on your record." was a guess from the email; a failed staff read at submit time registers a plain guest row and the card still claimed it. `registerForEvent` now returns `linked` (user_id actually written) and the sentence keys on it. This touches `app/(public)/events/[id]/actions.ts` and `schema.ts`, outside the card's May-edit list; done because the lie was the card's own, and the change is one field with its tests.
  - D-03: a signed-in practitioner who registered someone else still gets the "My record" link (spec FR-003 scenario 5); only the sentence depends on `linked`.
  - U-01 MAJOR (user lens): the sign-up page reached from the card said nothing about using the same email; one sentence now shows only when `next` is `/account/claim`.
- Left for Ivan or a card, none blocking:
  - D-04/BT-1: FR-005 holds only through the sign-up door; sign-in does not carry `next`, and the four guard redirects into `/account/complete` (outside the card) drop it, so a returning-but-incomplete practitioner who signs in lands on /account/record. Product call: wrap in `sendAttendeeMagicLink` (one extra hop for every sign-in) or pass `?next=<own path>` from the four guards.
  - D-05/BT-2: `classifyPath` (`lib/authDoor.ts`) reads the raw string, so dot-segments mislabel; only the failed-link bounce door is affected. Fix in `lib/authDoor.ts`, then `attendeeNextPath` shrinks.
  - Front-end copy and naming for Ivan: U-03 one door has six names (Get started, Log in, Sign in, "Sign in or sign up first", "Create your Eventar record", "Send sign-up link"); U-02 the create button sits under cancellation boilerplate with no sentence saying why; U-04 the wizard's Identity step greys Continue with no message and marks no required field (outside the card); U-05 the magic-link email never names Eventar; U-06 "The response does not reveal whether an account already exists." is developer language; U-10 button says "sign-up link", confirmation says "sign-in link". The user lens did not reach the wizard's later steps, the signed-in card states, the record page, the staff card, keyboard, 375 px and dark: those are unwalked.
  - D-10: the hero CTA pills are about 38 px tall (existing shared class on the organiser pair).
Gates [X]: tsc clean; eslint clean on the touched files; vitest `components` + `app/account` + the registration action 259 passed after the fixes; full run and the tip gate before the push.
