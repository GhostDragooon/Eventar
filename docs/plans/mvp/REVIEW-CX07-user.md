# REVIEW CX-07 (user lens): a two-organisation staff member is told why

Reviewer: Claude Sonnet 5.5 (user-lens, cold start). Date 2026-10-23. Server :3100, review mode off, local Supabase, Browser pane tab "seed".
Walked as ONE role: organiser `cx07u-twoorg@cx07u.invalid` (two ACTIVE `organiser_member` staff rows: org `default` and org `cx07u-probe-org`). Evidence tags: [X] executed, [R] read, [I] inferred.

Budget note: the brief capped this at 50 tool calls. I overran it (about 75 counting waits and shell calls) before I noticed. Because of that I stopped walking, did the required sign-out and cleanup, and did NOT walk the one-org control (see "Not reached"). Every finding below is from the two-org walk only.

## Verdict

The redirect itself works and the new sentence is the right idea. The person lands on the right words on `/dashboard`, `/events/new` and `/settings`. But the fix covers one door only. Two ordinary ways back to the login page (the header "Log in" route / a typed `/login`, and the public "Start an Event" button) still say "We could not check your organizer access just now ... please try again in a moment", which is the exact false message the card set out to remove. The new message names a support channel that does not exist anywhere on the page, and the page around it looks signed-out and invites a retry that cannot work.

## Findings

| ID | Sev | Route | What I saw / read as a person | Ev | Suggested fix |
|----|-----|-------|-------------------------------|----|---------------|
| U1 | MAJOR | `/login` (no `?error=`), signed in as the two-org person | Typed the URL while signed in. The page says: "We could not check your organizer access just now. This is on our side — please try again in a moment." This is the old outage message, shown with no end. I just read the correct explanation on the same page a minute earlier, so now I do not know which to believe. Trying again will never work. (Card's own "Known limit", but it is the same bug the card is named for.) | X | Give `getStaffSessionState` / the login page's re-check a distinct result for the two-row case (PGRST116) and render the `multiple_organisations` text for it, so every path to `/login` agrees. At minimum never print "try again" for PGRST116. |
| U2 | MAJOR | Home `/` "Start an Event" -> `/login?next=/events/new` | The public site's main organiser button is `/login?next=/events/new`. Signed in as the two-org person, it shows the same "try again in a moment" message (not the new one). This is the most natural thing an organiser clicks, so most two-org people will meet the false message, not the true one. | X | Same root cause and fix as U1 (the no-`?error=` / `?next=` branch of `/login`). Add a test that `/login?next=...` for a signed-in two-org person shows the new copy. |
| U3 | MAJOR | `/login?error=multiple_organisations` | "Ask Eventar support" has no destination. The page has no email address, no mailto, no link, no support page (searched the whole DOM: `mailto:` 0 hits; the only "support" text is the sentence itself). The panel just above says "Contact an admin to be added", which is plain text, not a link. The footer has How it works / Platform / Upcoming events only. I know what to do but not where to go. | X | Put a real contact in the message (mailto or support URL), or say what to do instead, for example "ask an admin of one of your organisations to remove your email from the other". If neither exists yet, name that gap as an open decision. |
| U4 | MAJOR | `/login?error=multiple_organisations`, resubmit the form | The obvious wrong move: type my email again and press the button. The red message disappears and the page says "Check your inbox (cx07u-twoorg@cx07u.invalid) for a sign-in link." (URL still has `?error=multiple_organisations`.) A new email is sent (Mailpit shows two messages for this address). Reading this I would reasonably think the problem is gone. The first link I used took me straight back to the same error, so a second link will too (second link not opened: [I]). A loop that reads as success. | X (form clears the alert and shows success), I (second link lands on the same error) | In the error state, do not offer a fresh send for the same address, or keep the alert visible next to the success text. Better: replace the form (see U5). |
| U5 | MINOR | `/login?error=multiple_organisations` | I am signed in (auth cookie present, `/events` header shows an "Account" button) but this page shows "Welcome back", an email box and "Send magic link", and the header says "Sign in" (link to `/account/sign-in`, the practitioner door). Nothing says I am signed in as someone, and there is no "Sign out" on this page. The only sign-out I found was Account menu -> "Sign out" on public `/events`, which I only reached by leaving the page. It worked: it returned me to `/`, `/dashboard` then went to `/login?next=%2Fdashboard` with no alert and no auth cookie. | X | On this error state show "Signed in as <email>", the explanation, a Sign out button and the contact, and hide the send-link form. Use the same session-aware header as `/events`. |
| U6 | MINOR | `/login?error=multiple_organisations` | Two conflicting instructions on one screen: the panel above says "Organizer access only ... Contact an admin to be added", and "Trouble signing in?" says "If yours isn't on the list, ask an admin to add you." I AM on the list, twice. The alert below says "Ask Eventar support". Three different next steps, none with a contact. | X, R | In this state hide or replace the generic panel and the troubleshooting list. |
| U7 | MINOR | `/account` (signed in, two-org) | Went to the Account menu's "Account settings". It redirects to `/account/complete`: "Complete your account ... Your CPD/CME records aren't accessible until this is done" with a Terms of Service consent box. Nothing mentions the organisation problem, so I am treated as a new practitioner. I did not tick the box or submit. Control (one-org) not walked, so this may be normal for every organiser with no practitioner profile ([I]); noted because the brief asked about practitioner-looking screens. | X (redirect and copy), I (same for control) | If the control behaves the same, no action. Otherwise or in addition, mention the organisation problem on account screens for this role. |
| U8 | NIT | `/login?error=multiple_organisations` | The alert is `role="alert"` (read from the DOM) but it is part of the server-rendered page. After arrival `document.activeElement` was BODY and my first Tab went to the "Eventar" logo link, not to the message or the email box. (One screenshot showed a blue outline on the email box, so evidence on autofocus is mixed.) Many screen readers do not announce a role=alert that is already present at load. | X (role, focus read), I (announcement) | Move focus to the alert (or `tabindex=-1` and focus it) on arrival, or keep the heading as the first focus stop. |
| U9 | NIT | same | Spelling mixes on one screen: "Organizer access only", "organizer list" vs "organisation" in the new sentence. | X | Pick one spelling for the page (the repo's UI copy rule decides which). |
| U10 | NIT | magic-link email | The email is the plain "Your sign-in link" template with "Follow the link below". A two-org person spends a full email round trip, then is told no. Not fixable without leaking whether an address is on a list (the form promises it does not). Recorded for completeness only. | X | None needed. |

## Worked well

- Sign-in itself: keyboard-only (type email, Enter) sent the link; page confirmed "Check your inbox (address) for a sign-in link." [X]
- The magic link landed on `/login?error=multiple_organisations` with the session kept and the new text in a `role="alert"` box with a warning icon [X].
- `/dashboard`, `/events/new` and `/settings` all redirected a signed-in two-org person to the same URL and the same text, with no loop or flash of staff content [X].
- The new sentence says what happened ("belongs to more than one organisation") and is honest that it is a known gap ("isn't supported yet"). It has no "try again" and no blame [X].
- Public `/events` works for this person, the header shows an "Account" button, the menu has "Account settings" and "Sign out" [X].
- Sign out really signs out: `/dashboard` afterwards goes to `/login?next=%2Fdashboard`, no alert, no auth cookie [X].
- The error is not sticky once the person leaves: clearing it needs nothing, and re-opening `/dashboard` shows it again (consistent) [X].

## Not reached

- The one-org control: not signed in, not walked (budget overrun). So I cannot show "normal" for `/dashboard`, `/events`, `/account`, or whether `/account/complete` (U7) is control behaviour.
- A signed-out visit to a hand-typed `/login?error=multiple_organisations` (the card says the attendee dictionary has no such key and falls back to a generic message).
- Opening the second magic link (U4 loop is inferred, not executed).
- Narrow viewport, dark theme, screen reader, a second keyboard-only pass after the error state.
- `/account/sign-in`, `/participants`, `/checkin`, `/analytics` (not asked, not opened).
- How `?next=` is carried through a successful sign-in for this person.

## Fixtures and cleanup

- Organisation `CX07U probe org`, slug `cx07u-probe-org`, id `53e092ae-bee8-431e-8fe1-a97b706e298c`.
- Auth user `cx07u-twoorg@cx07u.invalid` id `4a8b0cfc-59fe-4eca-84cf-b277a75975ae` (staff rows: `default` org and probe org, both active `organiser_member`).
- Auth user `cx07u-oneorg@cx07u.invalid` id `2fd6b0a7-5fa5-4588-9a5a-28b955c32cca` (one staff row in the probe org; created, never signed in).
- Passwords: random, kept only in a 600-mode scratch file, never printed; deleted.
- Cleanup order: staff rows, organisation, auth users (admin API DELETE, both 200), scratch files. Read-back: `staff=0 orgs=0 auth=0`. Total `staff` row count 68 before and after. Scratch files for this run: 0 left.
- Left behind: 2 Mailpit messages addressed to `cx07u-twoorg@...` (local Mailpit, harmless). `audit_events` rows from sign-in are permanent by design (not queried).
- Browser tab "seed": signed out (0 cookies), viewport emulation cleared (desktop), colour scheme set to light, `eventar-theme` removed. It sits at `/login?next=%2Fdashboard`.
- Repo: I changed no repo file except this one. `git status --porcelain` went from 55 to 57 entries during my run; the extra entries are the peer review artifacts (`docs/plans/mvp/REVIEW-CX07-backtest.md`, `docs/plans/mvp/REVIEW-CX07-dev.md`, `docs/plans/mvp/LOCK-CX-07-REVIEW`), not mine.
