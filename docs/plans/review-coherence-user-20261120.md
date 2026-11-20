# User-lens review: public and attendee surfaces (2026-11-20)

Method: dev server :3100, built-in browser, 375px and 1280px. "Seen" = screenshot or DOM read. "Inferred" = not observed. Swipe/flick not testable: not verified.
Overall: no BLOCKER. No horizontal scroll on any page (scrollWidth == innerWidth, seen, 375 and 1280).

## Header (all pages)
- Seen: same order on every page: logo, Events/Upcoming events, Organisers/Organiser log in, Log in. No "Home". Current page is not a link on /events (Events), /account/sign-in (Log in), /login (Organisers).
- MINOR: labels differ by width (375: "Events", "Organisers"; 1280: "Upcoming events", "Organiser log in", wordmark "Eventar"). Deliberate, but "Organisers" is vague (see /login).
- MINOR: tap targets under 44px at 375 (seen): logo 30x30, Events 64x39, Organisers 88x34, Log in 68x33. Hero Sign up/Log in 38px high. Footer links 19px high.
- MINOR: on /account/sign-up no header item is current (no Sign up item). Fine.
- MINOR: on an event page "Events" is a link and not marked current. Acceptable (child page).

## 1. Landing /
- Works: pill toggles both ways (aria-selected flips, copy swaps, seen). Attendee: Sign up / Log in. Organiser: "Start an Event" -> /login?next=/events/new, "Organiser log in" -> /login.
- MINOR: in Organiser mode the sample card is still the attendee record ("Your Eventar record, Dr. Chan Mei-ling") and the header "Log in" still goes to attendee sign-in. Mixed message for an organiser.
- MINOR: "Rule-aware for 8 Hong Kong accrediting bodies" appears twice (hero and "Why Eventar"). Two cards both end "See how it works" and link to the same anchor. Repetition, not a dead end.
- MINOR: pill buttons 38px high at 375.
- Pill label differs by width: "Organiser" (375) vs "Organiser or training provider" (1280).

## 2. /events
- Works: tabs (All, Medicine & dentistry, Allied health, Other), cards with date, time, venue, LIVE/REGISTERING badge, "View details" (44px). No scroll.
- MINOR: tab row clips "Allied health" at the right edge at 375 (scrollable, swipe not verified, cue is only the cut-off).
- MINOR (seen): empty tab shows "Nothing in this category right now." with no link back to All. Dead end by one tap on the tab.
- MINOR: footer "Upcoming events" links to /events while on /events (circular, seen).
- MINOR: cards in 15 events read "LIVE", 8 "REGISTERING"; a first-time visitor will not know LIVE means in progress and not registrable (inferred; label meaning is not explained on the page).

## 3. Event page with Register form
- Works: native validation fires for a bad email. Submitting "notanemail" gave the browser bubble "Please include an '@' in the email address..." and focus moved to the email field (seen via validationMessage; bubble is not capturable in a screenshot).
- MAJOR (known, seen): Register button disabled until both fields filled; no text says why. Empty form = a dead pale button.
- MINOR: the in-page error is native only. No inline message under the field (seen: no role=alert on the page).
- MINOR: "a@b" passes browser validation on this form (HTML5 accepts it) but sign-in rejects it with "Please enter a valid email address." Not verified what the Register action does with it (I did not submit, to avoid writing a registration row).
- MINOR: hero band above the title is an empty pale block (~200px at 375, ~210px at 1280); on 1280x800 the Register form is below the fold. Probably missing event image (fixture event).
- Good: "Log in or sign up to release CME/CPD points for accredited events." links with ?next back to the event. QR block explains itself.

## 4. /account/sign-in and /account/sign-up
- Works: one-line copy ("We'll email a one-time link, no password."), one toggle each ("New here? Sign up" / "Already have an account? Log in"), no self-links in the body. Header "Log in" is non-link on sign-in.
- Works: `a@b` -> red banner "Please enter a valid email address." (seen, both pages and /login). Banner says what to do.
- MINOR: the "Trouble logging in?" disclosure opens to nothing visible (innerText stays "Trouble logging in?" after open=true; seen on sign-in and /login). It may need a real click to reveal; I toggled it by script, so treat as unverified. If it is empty, it is a dead end.
- MINOR: page body is a blank card skeleton for 4-8s on first load in dev (seen at 375 and 1280). Dev compile, likely not a production issue.
- MINOR: tab title of /login is "Log in · Eventar", the same as /account/sign-in. Two doors, one title.
- MINOR: sign-up header shows "Log in" as the primary button, which duplicates the toggle link in the card. Fine.

## 5. /login (organiser door)
- Reachable at 375 via "Organisers" (88x34, seen). It becomes current on arrival.
- Confuses (MAJOR-ish for a would-be organiser, seen): "Organisers" reads like a marketing page for organisers; it is a bare login. Copy "Organiser emails only. No access? Contact an admin." gives no contact, no "who is the admin", no apply path. A new organiser reaches a dead end. The only organiser pitch is on the landing pill, which is not linked from /login.
- Good: heading "Organiser log in" distinguishes it from attendee Log in; placeholder you@company.com.
- MINOR: header "Log in" (attendee) beside page title "Organiser log in": two log-ins on one screen, only the heading tells them apart.

## 6. 404 (/nope)
- Works: HTTP 404, "This page doesn't exist." plus explanation and two buttons ("Home", "Upcoming events") at 44px (seen).
- MINOR: the page has a "Home" button while the header deliberately has none. Fine for recovery.

## Not verified
- Swipe on the category tab row; the Trouble logging in disclosure by a real tap; the Register server-side error path (not submitted); real production auth (review-mode bypass banner overlays the bottom of every page at 375 and hides footer text).
