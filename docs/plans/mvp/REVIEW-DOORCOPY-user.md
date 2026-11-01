# Review: door copy (user lens)

Commit 038fa39 on main. Picks: "Log in" + "Sign up" (sentence case), every door button "Next" with the help line "Eventar will send a one-time log-in link.", sign-up eyebrow "Attendee · Sign up".

Method: cold-start walk as first-time visitor, returning practitioner, organiser. Signed-out context in Playwright (the Chrome pane carries a review-mode session and bounces the door pages; its sign-in page stayed on the loading skeleton, so I cleared storage in a clean browser). :3100 only; no forms submitted; no users created.
Tags: [X] seen live, [R] read from code only.
Viewports: 1280 and 375. Page width check at 375: `scrollWidth` = `innerWidth` (375) on `/`, `/events`, `/account/sign-in`, `/account/sign-up`, `/login?next=/invite/x`, `/invite/x` [X]. 1280: sign-in and `/login` 1280 = 1280 [X]. No overflow, no bad wraps except H1 height (see MINOR 3). Plain `/login` at 375 not measured; same component as the invite variant [R].

Counts: BLOCKER 0, MAJOR 4, MINOR 6, NIT 3.

## Verdict

The picks landed on the door pages themselves. Action words are now consistent inside each door card. The remaining mismatch is around the cards: page titles, the disclosure under the card, error and notice strings, the invite page header, and the side name (Practitioner vs Attendee). One name per action is not yet true across the journey.

## MAJOR

### M1. Invite page carries two "Log in" controls that go to different doors  [X]
Route `/invite/x`, 375 (same markup at 1280 [R]). Header pill "Log in" (y19) goes to `/account/sign-in` (attendee door). Body button "Log in to accept" (y330) goes to `/login?next=%2Finvite%2Fx` (organiser door). An invitee who taps the pill, the first and most familiar "Log in", lands on the attendee door with no invite carried, and gets an attendee account. The code comment at `app/invite/[token]/page.tsx:39` already knows this. After the door-copy pick both now read identically, so the trap is sharper.
Fix: on `/invite/*` hide or relabel the shell pill (or point it to the same `/login?next=` href). Minimum: header pill reads "Attendee log in" on this page.

### M2. The side is named Practitioner on the landing and Attendee on the doors  [X]
Landing pill (both widths): `Practitioner | Organiser`; doctrine section 1 says `Attendee | Organiser`. A practitioner taps hero "Sign up" and lands on eyebrow "Attendee · Sign up" (and "Attendee door" in the aside, "Attendee log in" on the other-door links). Same person, three words in one click: Practitioner, practitioner (running copy), Attendee. The sign-up H1 then says neither.
Fix (pick one, Ivan): (a) rename pill tab to "Attendee"; (b) rename door eyebrow/links to "Practitioner"; (c) keep both and add "practitioner" to the eyebrow: "Attendee (practitioner) · Sign up". Doctrine text points to (a).

### M3. Page titles and sign-up H1 do not use the picked words  [X]
| Route | document.title | H1 |
|---|---|---|
| `/account/sign-in` | "Sign in · Eventar" | "Log in" |
| `/account/sign-up` | "Create your record · Eventar" | "Create your Eventar record" |
| `/login` | "Log in · Eventar" | "Log in" (invite: "Log in to accept your invite") |
| `/invite/x` | "Join your team · Eventar" | "Join your team" |
Tab title, history entry and the screen-reader page announcement still say Sign in. A practitioner who clicked "Sign up" is told "Create your record" in the tab and "Create your Eventar record" in the heading; only the small eyebrow says Sign up. Sign-in title is the only place the pick was missed on a door.
Fix: sign-in title "Log in · Eventar" (source: `app/account/sign-in` metadata/layout). Sign-up title "Sign up · Eventar"; H1 can keep "Create your Eventar record" if the eyebrow and title say Sign up, or become "Sign up".

### M4. Old vocabulary still sits directly under or around the Log in card  [X] unless marked
Same screen as the new words, so it jars:
- `/login` and `/login?next=/invite/x` disclosure: "Trouble signing in?" under H1 "Log in". The attendee door's disclosure was changed to "Trouble logging in?" so the two doors now disagree. In the list: "Sign in with your current one", "Only organizer emails can sign in", "won't sign you in"; invite variant: "Sign-in links expire after 15 minutes".
- `/login` Organizer card (ControlledAccessNotice): "Signing in does not grant a new role" [R, rendered text seen].
- Error text shown above the form via `?error=`: "This sign-in link has expired or was already used" (and a second "sign-in link" string), "Sign-in could not be completed", "Sign in again to continue" (`components/auth/auth-error-messages.ts`) [R]. The success message says "log-in link". So the same emailed thing is "log-in link" on success and "sign-in link" on failure.
- Related doors outside the five routes: `/checkin/confirm` button "Sign in or sign up" (QR arrivals, signed out) [R `app/(public)/checkin/confirm/page.tsx:554`]; claim error "You need to sign in first." [R]; invite action error "You must be signed in to accept an invite." [R].
- "Sign out" (PractitionerPanel "Sign out and use another email", account menu) against "Log in": verb pair log in / sign out. Decide whether it is "Log out" (Ivan's call; handoff said running sentences untouched).
Fix: one sweep over `auth-error-messages.ts`, `app/login/page.tsx` disclosure, ControlledAccessNotice, claimErrorCopy, checkin confirm; keep the string "sign-in link" out of anything a user reads.

### M5. An organiser on `/events` or the invite page has no visible organiser door  [X]
Doctrine: landing pill picks the door. `/events` has no pill: header shows "Events" and one "Log in" → `/account/sign-in` (attendee door only). The landing nav has "Start an Event" and "Log in" but "Log in" is the attendee door too; the organiser pair ("Start an Event", "Organiser log in") only shows after flipping the pill. On the attendee door at 375 the only organiser route is "Organiser log in" at y813, one pixel below an 812 px fold; the sign-up door has no other-door link at all (SiteShell, no aside). Organiser from `/events`: Log in, scroll, tiny link, then another page = three hops.
Fix: on `/events`, add the same two-side choice (or one extra link "Organiser log in" in the header); on sign-up add "Organiser log in" under "Already have an account? Log in".
(Not a regression of this card; it is the part of doctrine "both doors label their side" that is not yet true outside the door pages.)

## MINOR

1. Spelling on one card. `/login` [X]: eyebrow "Organiser", card heading "Organizer access only", help line "organizer list", disclosure "organizer emails". Two spellings in one 400 px card.
2. Help line has developer wording. `/account/sign-in`, `/account/sign-up` [X]: "Eventar will send a one-time log-in link. The response does not reveal whether an account already exists." The second sentence is a security note that a user cannot act on, and it makes the line three rows tall (67 px). `/login`: "The response does not reveal whether an address is on the organizer list." Suggest dropping it from the help line (keep behaviour). The expectation sentence for "Next" is the first sentence and is fine.
3. H1 height at 375. Sign-up "Create your Eventar record" is 146 px (3 lines at w277); "Log in to accept your invite" is 146 px. On sign-up this pushes the help line to y648 and "Next" to y732-776. In an 812 px window the button is visible (the review-mode banner overlays it only in review mode). On a 667 px phone the help line straddles the fold and "Next" is below it. Suggest tightening the two intro paragraphs on sign-up (the third paragraph about guest registration is below the fold of the first screen anyway) or shorter H1.
4. Three statements of "one-time link" per door screen: body ("We'll email a one-time link — no password"), help line ("Eventar will send a one-time log-in link"), small print ("The link expires after 15 minutes and works once."). On sign-up the body says it again. After "Next" the success says "Check your inbox ... for a log-in link."; invite says "one-tap link". Use one noun phrase: "log-in link".
5. Sign-up shell differs from sign-in/login: sign-up is the white SiteShell with nav; sign-in and login are the blue backdrop card with an aside. Same flow, different frame; the "Log in" pill in the sign-up header is the second Log in on a screen whose body also says "Already have an account? Log in" (same destination, fine, but doubled).
6. Organiser door asks a new organiser to "Log in" but they cannot sign up: "Staff emails only. Need an account as a practitioner? Attendee sign up", plus the notice "Contact an admin to be added". Doctrine row CX-06a says both doors "Log in | Sign Up"; the organiser door has Log in only. Invite page "Log in to accept your invite" is used by people who have no account yet ("Use the address you want for your organiser account"). Decide whether the invitee word is "Sign up" or "Log in"; today a first-time invitee is told to log in.

## NIT

1. `MagicLinkSignInForm` default `submitLabel` is still "Send magic link" [R]; both callers override it. Remove the default to avoid a third word returning.
2. Eyebrow "Attendee · Log in" and H1 "Log in" say the same thing twice; fine as a side label, only note that the H1 could carry the side ("Attendee log in") and drop the eyebrow if space is needed at 375.
3. Email field placeholder "you@example.com" on attendee doors vs the form default "you@company.com" (organiser doors use the default). Fine; listed for the table.

## Four questions per page

| Page | What is this | Where am I | What can I do | What happens next |
|---|---|---|---|---|
| `/` pill + hero | Yes: "Your CME/CPD log should keep itself." | Side is Practitioner; organiser flips with pill | Sign up / Log in (Start an Event / Organiser log in) | "Sign up" lands on a page titled "Create your record": partial |
| `/events` | Yes | No side shown | "Log in" only | Unclear which door: attendee only (M5) |
| `/account/sign-in` | Yes ("Attendee · Log in") | Side labelled, aside "Attendee door" at 1280 | Email + Next, Sign up link, Organiser log in | Help line and small print answer: link emailed, expires in 15 min |
| `/account/sign-up` | Eyebrow "Attendee · Sign up", H1 "Create your Eventar record" | Side labelled | Email + Next, Log in link | First paragraph and help line answer it |
| `/login` | "Organiser · Log in" | Side labelled | Email + Next, Attendee log in, Attendee sign up | Answered; "Next" plus help line above it |
| `/login?next=/invite/x` | "Log in to accept your invite" | Side labelled | Email + Next | "We'll email a one-tap link, then return you to your invite" answers it well |
| `/invite/x` | "Join your team" | No side label | "Log in to accept" | M1: pill sends elsewhere |

"Next" expectation: help line is directly above the button (about 20 px gap at 1280, 17 px at 375) on every door; on `/account/sign-in` at 375 the help line is y486-553 and "Next" y569-613, both inside the first 812 px; sign-up at 375 as above. After submit the button reads "Sending…" and the success line names the address. I judge the pair clear enough; the weak point is that "Next" with a mail icon does not itself say "email"; the help line carries the load, which breaks when the line is dropped (see MINOR 2: do not drop the first sentence).

## Every door-related string

| String | Route / component | Tag | Matches picks |
|---|---|---|---|
| Log in (nav pill) | `/`, `/events`, `/invite/*`, `/account/sign-up` header (to `/account/sign-in`) | X | yes |
| Start an Event | `/` nav, hero organiser (to `/login?next=/events/new`) | X | n/a (not a door word) |
| Practitioner / Organiser (pill tabs) | `/` | X | side name differs from Attendee (M2) |
| Sign up, Log in (hero CTAs, practitioner) | `/` | X | yes |
| Start an Event, Organiser log in (hero CTAs, organiser) | `/` | X | yes |
| Attendee · Log in (eyebrow) | `/account/sign-in` | X | yes |
| Log in (H1) | `/account/sign-in`, `/login` | X | yes |
| Sign in · Eventar (title) | `/account/sign-in` | X | NO (M3) |
| New user? Sign up. We'll email a one-time link — no password. | `/account/sign-in` | X | yes |
| Eventar will send a one-time log-in link. The response does not reveal ... | all door forms | X | yes + dev wording (MINOR 2) |
| Next (submit) | `/account/sign-in`, `/account/sign-up`, `/login` | X | yes |
| Sending… | submit pending, all doors | R | n/a |
| Check your inbox (...) for a log-in link. | success, all doors | R | yes |
| The link expires after 15 minutes and works once. | all doors | X | yes |
| Trouble logging in? | `/account/sign-in` | X | yes |
| Trouble signing in? | `/login`, `/login?next=` | X | NO (M4) |
| Attendee log in / Organiser log in / Home / Back to home | other-door links, `/account/sign-in`, `/login` | X | yes |
| Attendee · Sign up (eyebrow) | `/account/sign-up` | X | yes |
| Create your Eventar record (H1), Create your record · Eventar (title) | `/account/sign-up` | X | NO (M3) |
| Already have an account? Log in | `/account/sign-up` | X | yes |
| Organiser · Log in (eyebrow) | `/login` | X | yes |
| Staff emails only. Need an account as a practitioner? Attendee sign up. | `/login` | X | yes (lower-case "sign up" in running text) |
| Organizer access only / organizer list / organizer emails | `/login` | X | spelling (MINOR 1) |
| Log in to accept your invite (H1), Log in to accept (button) | `/login?next=/invite/*`, `/invite/*` | X | yes |
| Sign-in links expire ... | `/login?next=/invite/*` disclosure | X | NO (M4) |
| This sign-in link has expired / couldn't be completed / Sign-in could not be completed / Sign in again | `?error=` notices | R | NO (M4) |
| Sign in or sign up | `/checkin/confirm` signed-out button | R | NO (M4) |
| You need to sign in first. | claim error | R | NO (M4) |
| You must be signed in to accept an invite. | invite action | R | NO (M4) |
| Log in or sign up first | `RegisterCard` | R | yes |
| Log in | check-in `RosterClient` | R | yes |
| Sign out and use another email | `/login` when signed in | R | verb pair (M4) |
| Send magic link | `MagicLinkSignInForm` default prop | R | unused default (NIT 1) |

Screenshot saved: `.playwright-mcp/doorcopy-signin-375.png` (sign-in door at 375). Stack state: I only read, no code changed.
