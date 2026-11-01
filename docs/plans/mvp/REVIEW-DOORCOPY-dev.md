# REVIEW: door copy (038fa39), dev lens

Scope: `git show 038fa39` (24 files, 97+/86-), plus repo-wide grep for leftover old door words.
Tags: [X] verified by execution or direct read of the code, [R] read of docs/inference only, [I] inferred.

## Gates (run sequentially, local only)

- `pnpm exec tsc --noEmit`: exit 0 [X]
- `pnpm exec eslint components app`: exit 0, 0 errors, 5 pre-existing `<img>` warnings in files this commit did not touch [X]
- `pnpm exec vitest run components app/account app/login app/invite`: 104 files, 728 tests passed [X]

## Check 1: is the diff copy-only? Yes [X]

Every non-test hunk was read. All are string-literal swaps in JSX text, `label:`, `submitLabel=`, and one template string. No `href`, `aria-*`, prop, handler, condition or import changed. Two structural-looking edits are still copy only:

- `app/account/sign-up/page.tsx:93-94`: eyebrow spans were `Sign up` (accent) + ` · Create your Eventar record` (muted). Now `Attendee` (accent) + ` · Sign up` (muted). Same two spans, same classes.
- `app/account/sign-in/page.tsx:71-76`: link text `Create an account` became `Sign up`. The href stays `/account/sign-up`.

Test hunks: identical assertions with new strings, plus one new test (sign-up eyebrow).

## Findings

### MAJOR

**M1. Check-in confirm banner still says "Sign in or sign up" (door label, same place the commit changed for RegisterCard).**
`app/(public)/checkin/confirm/page.tsx:554`. A signed-out attendee who has just checked in sees the link "Sign in or sign up" (to `/account/sign-in?next=/account/claim`). Seconds earlier on the event page the same intent read "Log in or sign up first". It lands on a page headed "Log in".
Fix: change the label to `Log in or sign up`. The surrounding sentence ("with the email you registered with…") reads fine. Check `app/(public)/checkin/confirm/*.test.tsx` for a pinned name. The grep found none in tests, so this is a one-line change. [X]

**M2. Browser tab title on the attendee log-in door still says "Sign in" while the page heading says "Log in".**
`app/account/sign-in/layout.tsx:4` has `title: 'Sign in'`. The `/login` layout already has `'Log in'`, so the two doors now disagree. The tab title, history entry, bookmark name and screen-reader page title on the main attendee door contradict the H1. [X]
Fix: set `title: 'Log in'`. Nothing in tests pins it (grep). Related nit in N2.

### MINOR

**m1. "Sign-in link" vs "log-in link" on the same screen (answer to check 4).** [X]
The form's help text (`components/auth/MagicLinkSignInForm.tsx:96`, shown on every door) and the success message (`:64`) now say "log-in link". Strings left as "sign-in link" can appear with them:
- `/account/sign-in?error=missing_code` and the other callback errors (`components/auth/auth-error-messages.ts:14,16,31,33`) render above the form. The user reads "This sign-in link has expired…" and, right below, "Eventar will send a one-time log-in link."
- The same screen after a failed link, then a re-request: error says "sign-in link", success says "log-in link".
- `/login` (invite mode), expanded "Trouble signing in?" list: `app/login/page.tsx:178` "Sign-in links expire…" and `:188` "the sign-in link", next to the form help "log-in link".
- `/account/sign-in` expanded details: "won't sign you in" (a running sentence).
Fix options, pick one: (a) change the four auth-error-messages strings plus `login/page.tsx:178,188` to "log-in link" and update the three pinned tests (`app/login/page.test.tsx:395,397`, `app/account/sign-in/page.test.tsx:75`, `components/auth/auth-error-messages.test.ts`, and the invite tests that say "sign-in link" in titles only); (b) revert the form's two strings to "sign-in link" and keep noun and verb split ("log in" the action, "sign-in link" the thing). Option (a) is the coherent one and about 8 strings. Ivan's pick said running sentences stay, so this is his call.

**m2. Door pair disagrees on the disclosure label.** [X]
`app/account/sign-in/page.tsx:94` was changed to "Trouble logging in?". `app/login/page.tsx:173` (organiser door) still says "Trouble signing in?". Same widget, same position, two verbs, and the commit message says only running sentences were left. The brief lists "Trouble signing in?" as intentional on `/login`, so this is a pair mismatch the commit introduced rather than preserved.
Fix: change `/login:173` to "Trouble logging in?" and `app/login/page.test.tsx` (the `Trouble signing in` describe title at ~391 is text only; check any `getByText(/trouble signing in/)`). Or revert the attendee one. Pick one verb for both.

**m3. Sign-up door has a fourth name for itself: H1 and RegisterCard button say "Create your Eventar record".** [X]
`app/account/sign-up/page.tsx:96` (H1), `components/RegisterCard.tsx:194` (button to `/account/sign-up?next=/account/claim`), tab title `Create your record` (`app/account/sign-up/layout.tsx:4`). Now the eyebrow says "Attendee · Sign up", the hero and the log-in doors' link say "Sign up", and the post-registration button says "Create your Eventar record". The old finding U-03 "one door has many names" is smaller but not closed.
Fix (for Ivan to decide, not applied): RegisterCard button -> "Sign up" (or "Sign up to keep this on your record"); the H1 can stay as the page's promise. Tab title -> "Sign up".

**m4. "Next" is a weak accessible name for a button that sends an email.** [I]
The submit now reads "Next" (mail icon is `aria-hidden`). Consent: the field is tied to `#magic-link-help` ("Eventar will send a one-time log-in link"), which covers the explanation, and Ivan picked it ("with a line saying a link is emailed"). Residual: a screen-reader user tabbing to the button hears "Next, button" with no context; the pending state changes to "Sending…", which does tell them. Not a blocker. Optional fix: `aria-describedby` on the button pointing at the same help id, or `aria-label` is NOT advised (WCAG 2.5.3, label in name).

**m5. Test gaps (answer to check 5).** [X]
Assertions kept their behaviour checks: hrefs (`toHaveAttribute('href', …)` on the pill, invite link, door-switch), roles (`link`, `heading`, `button`), absence checks, and the `?next=` forwarding on the Log in link. Nothing became a copy-only assertion. Gaps, none introduced by this commit but now relevant because their labels changed:
- `app/account/sign-in/page.test.tsx` has no test for the "Sign up" link in the intro (was "Create an account"): neither label nor href `/account/sign-up`. If someone re-points it nothing fails.
- `RosterClient` stale-session "Log in" (two places, `RosterClient.tsx:387,619`) has no test pinning the label or href.
- The new sign-up eyebrow test uses `getByText('Attendee')` and `getByText(/· Sign up/)`; it will also match any other element with that text. It passed, but it would not notice the eyebrow being moved elsewhere. Fine as a copy lock.
- Negative assertion that is now vacuous: `app/account/sign-up/page.test.tsx:50` `queryByText(/sign in to your account/i)` was already about a string not in the page. No action.
No `e2e` or Playwright specs exist under `tests/`, `scripts/` or `.github` pinning "Sign in", "Continue", "Send sign-up link", "Get started" or "Create an account" (grep, no hits) [X]. No `aria-label` elsewhere references the changed names.

**m6. Spec and map docs now contradict the code.** [R]
`specs/001-attendee-portal/spec.md:25,119,149` name the hero button "Get started"; `:112,128` say "Sign in". `docs/plans/mvp/DOCTRINE-CONFLICT-MAP.md:45-49,86`, `CX-06a.md:9` likewise. The CX-06a hero test comment already updated. Fix in the handoff: note that FR-001 wording changed per PICKS.

### NIT

- N1. Stale code comments mention the old words: `components/shell/SiteShell.tsx:24,55,63`, `components/landing/LandingNav.tsx:12,96,106`, `components/landing/LandingHero.tsx:53` ("Get started" -> sign-up; the new sentence 30 lines above is right but this older comment contradicts it), `components/shell/StaffProgrammePill.tsx:12`. Harmless; update when next touched.
- N2. Internal prop value `active="signin"` (`SiteShell.tsx:58`, used by `app/account/sign-up/page.tsx:34`) is an identifier, not copy. Leave.
- N3. `MagicLinkSignInForm` default `submitLabel = 'Send magic link'` (`:37`) is now only reached by `app/dev-preview-uiport/*` (three call sites), none of the three live doors. Dead default on live code; leave unless the dev-preview is cleaned (UI-port library is deliberate per memory).

## Check 3: every remaining "Sign in / sign in / Sign-in / Continue / Send magic link / Get started" in `app/ components/ lib/` (excluding tests, `dev-preview*`)

Classification: DOOR = door label (change), RUN = running sentence (left on purpose), ERR = error/status message, INT = identifier/href/comment, OTHER = unrelated.

| Where | Text | Class | Proposal |
|---|---|---|---|
| `app/(public)/checkin/confirm/page.tsx:554` | "Sign in or sign up" | DOOR | change (M1) |
| `app/account/sign-in/layout.tsx:4` | title "Sign in" | DOOR (metadata) | change (M2) |
| `app/login/page.tsx:173` | "Trouble signing in?" | DOOR-ish | change to match attendee (m2) |
| `components/auth/auth-error-messages.ts:14,16,31,33,50` | "sign-in link…", "Sign-in could not be completed" | ERR | change with m1 option (a) |
| `components/auth/auth-error-messages.ts:27,41` | "Sign in with your organiser email", "Sign in again to continue" | ERR/RUN | optional; verb phrase, fine either way |
| `app/account/signedOutCopy.ts:12,13` | "Please sign in again", "You're signed out. Sign in again to continue." | RUN | leave (intentional); note the nearest door says "Log in" |
| `app/events/[id]/checkin/actions.ts:96,249` | "Sign in again to continue", "Reload and sign in again" | ERR | leave |
| `app/account/claimErrorCopy.ts:27` | "You need to sign in first." | ERR | leave |
| `app/invite/[token]/actions.ts:66` | "couldn't verify your sign-in" | ERR | leave |
| `app/login/page.tsx:178,188,194,197,200` | "Sign-in links…", "sign-in link", "can sign in", "Sign in with your current one", "magic-link-only sign-in" | RUN | 178/188: see m1; the rest leave |
| `app/account/sign-in/page.tsx` details list | "won't sign you in" | RUN | leave |
| `app/account/profile/ProfileClient.tsx:402` | "(handled at sign-in)" | RUN | leave |
| `components/auth/ControlledAccessNotice.tsx:9` | "Signing in does not grant…" | RUN | leave |
| `components/auth/SignOutAction.tsx`, `app/login/page.tsx:246` | "Sign out", "Signing out…" | OTHER | leave |
| `app/account/sign-up/page.tsx:96` / `components/RegisterCard.tsx:194` | "Create your Eventar record" | DOOR (sign-up) | see m3 |
| `app/account/complete/CompleteClient.tsx:313,380,484` | "Continue" | OTHER (wizard steps, not doors) | leave |
| `components/dialogs`, `pricing`, `event-form`, `forms` "Continue" | | OTHER | leave |
| `components/landing/LandingHero.tsx:53` comment, SiteShell/LandingNav comments | old words | INT | N1 |
| `app/events/[id]/checkin/RosterClient.tsx:387,619` | "Log in" | DOOR (already changed) | done |
| hrefs `/account/sign-in`, `active="signin"`, `signInHref`, `error=`/`next=` plumbing | | INT | leave |

"Send magic link" survives only as the dead default in N3. "Get started" survives only in a comment (N1) and in a `ServiceCardCarousel` test fixture.
Email/Supabase templates: no `emails/` or `supabase/templates` file in the repo mentions sign-in or log-in (grep), and `supabase/config.toml` has no template override, so the magic-link email subject and body come from Supabase defaults or the hosted dashboard, outside this repo [I]. Whatever the email says ("Magic Link", "Log In") is not governed by this commit.

## Check 6: metadata vs headings [X]

| Route | `<title>` | H1 | Match |
|---|---|---|---|
| `/login` | "Log in" (`app/login/layout.tsx:4`, untouched) | "Log in" (invite: "Log in to accept your invite") | yes, now consistent |
| `/account/sign-in` | "Sign in" (`layout.tsx:4`) | "Log in" | NO (M2) |
| `/account/sign-up` | "Create your record" | "Create your Eventar record" | partial, pre-existing; eyebrow says "Sign up" (m3) |

## Verdict

1. No blocker. The diff is copy-only, gates are green (tsc 0, eslint 0 errors, vitest 728/728), and no test or script pins an old accessible name.
2. Two MAJOR leftovers a user hits on the door flows: the check-in banner link "Sign in or sign up" (M1) and the attendee door's tab title "Sign in" (M2). Both are one-line changes.
3. Visible wording split on one screen: "log-in link" in the form help against "sign-in link" in callback errors and the `/login` invite list (m1), and "Trouble logging in?" vs "Trouble signing in?" across the two doors (m2). Ivan should pick whether to widen the change.
4. Ship after M1 and M2; the rest can be one follow-up copy card. Add the missing Sign up link href test on the sign-in door at the same time.
