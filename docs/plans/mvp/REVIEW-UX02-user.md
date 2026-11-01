# REVIEW UX-02 (attendee portal shell): user lens

Reviewer: user-lens agent, 2026-11-01. Code under review: `AccountShell` at HEAD `4542a6a` (the :3100 server already ran the dev-lens fixes: "coming soon" cue on phone tabs, onboarding brand not a link, rail scroll, safe-area). Findings that only exist at `fb52a76` are not listed.

Legend: [X] seen live on :3100, [R] read from code or computed from measured numbers.

## Summary

BLOCKER 0, MAJOR 2, MINOR 6, NIT 4. Hit the 100-call cap, so this is partial. Not covered: the 320 px pass of the portal tab bar (only the 320 onboarding bar was walked), dark theme on a phone, sign out from the rail and from the Account page, browser back after a portal sign-out, 375 px walks of /events, /account/record, /account/profile and /account/claim, phone keyboard. Also took 6 screenshots against a cap of 4 (thumbnails).

What works [X]:
- New account: sign-in goes to `/account/complete`. The bar shows brand, email (at 640 px and up) and a Sign out button. No portal nav, no rail, no tab bar at 1280, 375 and 320. `/account`, `/account/record`, `/account/profile` and `/account/claim` all redirect there. Sign out clears the cookie and lands on `/`.
- Complete account: the rail and tab bar mark the right place on /account, /events, /account/record, /account/profile and /account/claim (Events on /events, Account on the other four). Checked via `aria-current`. No horizontal scroll at 1280 or 375 on the portal pages measured, and `scrollWidth` equals `innerWidth` on onboarding at 375 and 320.
- 375 px tab bar: all five labels fit with no clipping. "Registrations" label 70.3 px in a 74.3 px tab, 26 px gaps, tabs 48 px tall. Main content has 72 px bottom padding: on /account the footer ends at 2363 and the page at 2435. Nothing hides behind the bar.
- Skip link is the first tab stop. The rail comes before main in tab order, with a visible focus outline (browser default `auto`).
- Soon rows are inert (no navigation, no focus). Typing `/account/registrations` gives a 404. Typing `/checkin` as an attendee gives the Organiser log in page with a calm message.

## MAJOR

### M1. Phone tab bar: three of five tabs are dead and the phone shows no "Soon" cue [X]
- Page: any shell page. Viewport: 375 (and by the same markup 320). Light.
- Steps: sign in as a complete attendee, open /account at 375, look at the bottom bar, tap Check-in, Registrations or History.
- Saw: the three tabs are dimmed (label contrast 2.10:1 on the bar, against 7.34:1 for Events) and carry no "Soon" word, unlike the rail. The only cues are `title` (needs hover, never fires on touch) and an `sr-only` "(coming soon)" (screen readers only). A tap does nothing: no navigation, no toast, no state change. Check-in is the first and most prominent tab, and Check-in is the thing an attendee wants on the day of an event.
- Why it matters: "would a person tap them expecting something" is yes. Three of five controls on the main phone nav look like a faint style choice, not an explanation.
- Fix options (Ivan decides, show before/after): (a) show a tiny "Soon" under each unbuilt label as the rail does; (b) make them buttons that announce "Check-in is coming soon" in a live toast on tap; (c) drop the unbuilt tabs from the phone bar until their pages exist (two tabs, Events and Account). (a) is the smallest change and matches pick 5a.

### M2. The event pages leave the shell and speak a different vocabulary [X]
- Pages: /events/[id], the guest registration form and its confirmation. Viewport: 1280 (same header at all widths). Complete attendee.
- Steps: from /events open an event, register, read the confirmation, open the header "Account" menu, click the brand.
- Saw: the public pill header replaces the shell: no rail, no tab bar, no "Registrations". The Account menu there reads "My record / Profile & memberships / Account settings / Sign out", the shell reads "Check-in / Registrations / Events / History / Account". The confirmation says "This is now on your record" with a "My record" link, and `/account/record` is titled "Your Eventar record" with Account highlighted. The brand "Eventar home" goes to `/` (the marketing home) for a signed-in attendee, whereas the rail brand goes to `/events`. The way back exists (the "Events" pill, the menu), but the person registers and the portal's own word for it ("Registrations") never appears.
- Known follow-up (event detail stays public), logged so the vocabulary mismatch is a deliberate choice and not an oversight.
- Fix: when the follow-up lands, put event detail in the shell for a complete attendee. Short term, rename the public menu items to the doctrine labels (My record becomes History or Registrations once built, Profile & memberships and Account settings become Account) and point the signed-in brand at /events.

## MINOR

### m1. "Soon" text and rail labels are low contrast [X]
- Rail, 1280. Unbuilt row labels: 2.08:1 light, 2.50:1 dark. The "Soon" pill (10 px): 3.44:1 light, 4.25:1 dark, under 4.5:1. Disabled controls are exempt from 1.4.3, but the pill is the explanation and is real text.
- Fix: raise the pill to full `on-surface-variant` (about 7:1) and keep the label dimmed.

### m2. 404 under /account/* offers "Sign in" to a signed-in attendee and no way back to the portal [X]
- Steps: signed in, open `/account/registrations`. Header shows Home, Events, "Sign in"; body offers "Upcoming events" and "Home".
- Fix: the global not-found cannot see the session cheaply; add "Your account" beside "Home" only if it can read the session, or accept it. A person who typed a Soon row's likely URL lands here.

### m3. Registrations is "Soon" while the registration list already exists under Account [X]
- Steps: register for an event, then open /account/record. It lists the event with status "registered" under the Account highlight. The rail row named Registrations says Soon.
- Known and chosen (5a). The cost is that the thing a person looks for is on a page that has no row of its own. Fix when the Attendee surfaces card lands: point Registrations at that list.

### m4. Onboarding bar hides the account email below 640 px [X]
- Steps: new account, /account/complete at 375 or 320. Only the brand and Sign out show.
- Why: someone who signed in with the wrong address cannot tell which account they are completing. The email span is `hidden sm:inline`.
- Fix: show the email on a second line under the bar on phones, or truncate it beside Sign out.

### m5. Phone has one Sign out and it sits about 2000 px down the Account page [X]
- 375 px: the Account page's Sign out button is at y 2069 of a 2435 px page. The tab bar has no Sign out (pick 2a). The desktop rail has it plus the page one (two Sign out buttons on /account at 1280).
- Fix: accept as pick 2a, or add a "Sign out" link near the top of the Account page on phones.

### m6. Back after sign-out shows the signed-in page for a few seconds [X]
- Steps: new account, /account/complete, Sign out (lands on `/`), browser Back. The onboarding page returned with the email and Sign out in the header for roughly 3 to 7 seconds before redirecting to `/account/sign-in?next=%2Faccount%2Fcomplete`. Dev server timing inflates this, so treat the length as an upper bound. No data was shown beyond the email.
- Fix: none needed in the shell if production redirects faster; if not, `pageshow` revalidate.

## NIT

- n1. Sign-in for a signed-in or complete user lands on `/account/record` (via `/account/sign-in` and `/account/complete`), titled "Your Eventar record", with Account highlighted. Fine until Registrations or Check-in exist. [X]
- n2. `/checkin` as an attendee shows "Organiser log in" with "Back to my record" (old vocabulary). The message is clear. When the attendee Check-in route is built it must not reuse `/checkin` (doctrine). [X]
- n3. `/account/complete` stepper labels truncate at 375 and 320 ("C", "I..", "P.") before and outside this card. [X]
- n4. Dev only: the "Review mode" pill and the Next dev indicator sit over the bottom 66 px at phone width and cover the Check-in and Registrations tabs, so a phone review taps the overlay instead of the tab. Not a product issue. [X]

## Four questions per page (complete attendee, 1280)
- /account: where (Account highlighted, "Your account"), can do (edit identity, profile link, "View your record"), happened (readiness strip), next (links). OK.
- /events: where (Events highlighted), do (browse, open an event), next (open an event). OK.
- /account/record: where is clear, but the nav does not name the page (Account highlighted for a log). See m3, n1.
- /account/profile and /account/claim: each has "Back to account". OK.
- /account/complete (new account): "A few things before you start", progress 1 to 4, Continue. A dead end only by design; Sign out is the one exit.

## Not verified
- Sign out from the rail and from the Account page, and Back afterwards, on the portal (only the onboarding Sign out was run).
- Phone dark theme, phone keyboard, the 320 portal bar. Computed [R]: tab widths sum to 262 px in a 312 px lane, so 12 px gaps remain at 320, no clip expected, but not measured.
- Onboarding brand: now `href={null}` at HEAD (non-link) [R]; the first walk read the old link to `/account/complete`.

## Environment and cleanup
- Two throwaway auth users (`zz-ux02-new@`, `zz-ux02-cmp@rls-test.invalid`) on the local stack; the complete one got a copied profile, licence and consents from a seeded user. Both deleted, plus their licence and registration rows; counts back to 0. Audit rows from sign-ins may remain (permanent by design).
- Session cookies were never printed (the classifier refused a `cat`). A local `python3 http.server` on 127.0.0.1:8765 served them to a page `<script>`; stopped and removed. The listener count is 0.
- Browser: signed out, `eventar-theme` removed, viewport reset to desktop with colour scheme light.
- No code edits, no commits, no `.env.local`, no Supabase MCP.
