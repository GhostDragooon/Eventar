# REVIEW R3 — practitioner portal, user lens (cold start)

- Date 2026-11-02 (local stack, dev server :3100, review mode off). Built-in browser pane only.
- Persona walked: practitioner prac01@final.invalid (completed profile), signed in by real magic link from Mailpit. The incomplete-account persona was NOT walked (see Coverage gaps).
- Evidence tags: [X] executed in the browser or psql this session; [C] read from source only.
- Budget: capped at 65 tool calls; I used about 68 (3 over, all spent on sign-out and its verification). Several planned steps were cut, listed below.

## Findings, ranked

**MAJOR-1 — A registered person is shown a blank Register form again.** [X]
- Route /events/<id> after sign-in. For ee926641 (ZZ-FINAL member c1, already registered since 2026-11-01) and for 51a32795 right after I registered, the page shows the same "Register / Registering as Mei Lam" form with no "You are registered" state, no link to the registration.
- Re-submitting gives the right refusal ("That email is already registered for this event.") but the message has no link to Registrations, so the answer to "did it work, where is it" needs a trip back through the strip.
- Fix: for a signed-in user with a registration row for this event, replace the form with a registered card plus a link to Registrations.

**MINOR-1 — Claim is two clicks, and the claim page forgets where you came from.** [X]
- The banner in Registrations, Check-in and History is present and says "We found 1 registration made with your email as a guest. Link it to your account to see it here." Its action "Link past registrations" is a link to /account/claim, not the claim itself. The page then needs a second click "Link my past registrations".
- Result copy is good: "Linked 1 past registration to your account."
- But it does not say which registration, and the only way out is "Back to account", not "See Registrations". The whole point (see it under Registrations) is not offered as the next step.
- DB read-back of user_id after the claim was not run (budget). The UI claimed success only.

**MINOR-2 — Success card contradicts itself on proof and mixes dev text.** [X]
- After Register: "You're registered." then "Email delivery is in dev mode — check the operator console." then "Need to cancel? See event staff at check-in — this browser tab is your proof of registration." then "You are registered. It is under Registrations."
- Three registered statements, a dev-mode line a real user cannot act on, and "this browser tab is your proof" next to "it is under Registrations". For a signed-in user the proof is the Registrations page. The dev line is presumably hidden in production; if it is not, it is BLOCKER-level misleading copy. Not checked. [C needed]
- Positive: exactly one row written. psql: registrations 929 to 930, row for prac01 on 51a32795, source self_registration, user_id set.

**MINOR-3 — History copy still sends you to Account to link.** [X]
- History empty state: "Browse events to register, or link past registrations from Account." On the same page the claim banner already offers "Link past registrations" above it. Two routes, one hidden behind Account.

**MINOR-4 — Public event page versus portal: it does feel like leaving the product.** [X]
- Portal pages: left sidebar (Check-in, Registrations, Events, History, Account), Sign out in the sidebar, "Portal" nav in the footer.
- Event page: a floating pill header with only "Upcoming events" and a blue "Account" button, no sidebar, no Sign out. The only route back is the small "← Back to my registrations" strip, which works (href /account/registrations).
- The sidebar logo "Eventar home" goes to /events (the public list), so the logo in the portal also leaves the portal.

**MINOR-5 — Icon ligature names exposed to assistive tech.** [X]
- On /account the Material icons for badge, call, translate, alternate_email, logout have no aria-hidden. get_page_text reads "badgeIdentity", "callContact" etc. Elsewhere icons are aria-hidden="true". Whether they sit inside headings (name pollution) was not checked.
- On the sign-in page and the History page the dump also shows "mail", "check_circle", "event_available", "workspace_premium" as text; the first two have the same risk.

**NIT-1 — URL still says /account/record.** [X] The label is "History" in menu, title, heading and strip; the route is /account/record. Invisible to users unless they read the address bar. Residual word search: "Record" as the log name appears nowhere on /account, Registrations, Check-in, History or the sign-in page ([X] via get_page_text and a regex over /account body).

**NIT-2 — Hidden claim page shell check.** [X] /account/claim has Sign out in the sidebar; fine.

## Per-step four-question table

| Step | Where am I | Main thing | How do I progress | How do I get back | Observation |
|---|---|---|---|---|---|
| 1 Sign-in page (signed out) /account then redirect | "ATTENDEE · LOG IN", Log in | One email field, "Next" | Type email, Next; confirmation "Check your inbox (prac01@final.invalid) for a log-in link." | "Back to home", "Organiser log in", "Sign up" link | /account signed out lands here (verified at start and at end). Copy honest. Trouble-logging-in list is useful. |
| 2 Magic link to Registrations | "Registrations — The events you have signed up for." | Upcoming list | Row links to event; "Find more events" | Sidebar nav | Row shows "04 Dec 2026, 09:00 (GMT+8)" and "Check-in opens at 04 Dec 2026, 08:00 (GMT+8)". Change 2 verified: opens-at with timezone label. |
| 3 Check-in | "Check-in" | One-line contract: "Show your pass to the organiser at the door. Check-in opens 60 minutes before an event starts and closes when it ends." | Empty state "Nothing to check in to right now" and button "See my registrations" | Sidebar | Registrations says "events you have signed up for", Check-in says "show your pass". Contract is clear and different on each page. |
| 4 History (/account/record) | "History" | "Past events and points through Eventar — a running log, not a substitute for iCMECPD or your college." | Empty states with Browse events / Account links | Sidebar | "History" everywhere, no residual "Record". See MINOR-3 and NIT-1. |
| 5 Account | "Account · Mei Lam" | Profile edit | Save changes, Edit professional profile & licences, "View your History" | Sidebar | Readiness checklist reads fine. Links to History use the new word. See MINOR-5. |
| 6 Public event page, already registered (ee926641) | Event page | Register form | Register | "← Back to my registrations" strip (works) | MAJOR-1. Chrome differs from the portal, MINOR-4. |
| 7 Public event page, new registration (51a32795) | Event page then success card | "YOU'RE REGISTERED" | Link "Registrations" in the card | Strip | One row written [X psql]. Copy overlong, MINOR-2. Re-submit gives a clear duplicate warning. |
| 8 Claim banner (fixture, user_id NULL row for prac01's email on the ZZ-R3b event) | Banner at the top of Registrations, Check-in, History | "We found 1 registration made with your email as a guest." | "Link past registrations" then "Link my past registrations" | Claim page "Back to account" | Banner present on all three [X, fetched HTML]. Claim confirms "Linked 1 past registration to your account." MINOR-1. |
| 9 Sign out | Sidebar button "Sign out" (real click, from the claim page) | Session ended | n/a | Next /account navigation landed on /account/sign-in, title "Log in · Eventar" | Verified. |

## Chrome comparison (step 6)

- Portal: sidebar with five items, icon plus word, Sign out button, footer "By Eventar · CPD infrastructure, Hong Kong", second "Portal" nav.
- Event page: floating pill, brand left, "Upcoming events" centre, blue "Account" button right, back strip below. No sidebar, no Sign out. Wider white document body.
- Judgement: different shells with the same brand mark; the strip makes the return obvious, but the Account button there leads to the portal while the portal logo leads out to /events. Not a blocker.

## Fixtures (left in place, nothing deleted)

- auth user prac01@final.invalid, id e9713e1d-cad8-4b85-9e15-51a67784c25b (from the earlier walk).
- New registration, prac01 on event 51a32795-ac71-452d-b1e7-cf182c10c69a (UX03B pub member), created via the UI. registrations total 929 to 930.
- ZZ-R3d claim fixture: registration id 34881bfb-c38c-451c-b8b1-0914d7a1124d, code D63B4D03, event 2a132696-0d91-4bd2-b6cc-dada44f9da5c (ZZ-R3b open window), email prac01@final.invalid, full_name "ZZ-R3d claim row", inserted with user_id NULL, then claimed through the UI (expect user_id now e9713e1d..., not read back). This adds one more registration row, so the total should read 931.
- Mailpit: one sign-in link message for prac01 (spent).

## Coverage gaps

- Incomplete-account persona NOT walked: no disposable @eventar-review.invalid user, so the new /account/complete copy ("Any registrations you have made are saved. Finish this and you will see them under Registrations, with your past events in History...") was not seen rendered. [C] only: the copy exists in app/account/complete/CompleteClient.tsx (line ~95) and the source comments say every attendee page redirects an incomplete account to /account/complete. Whether Registrations, History and Check-in show an explicit explanation versus a redirect was not exercised.
- /account/sign-up and /login were not opened this pass.
- Keyboard pass on Registrations (tab order, focus visibility, traps) NOT run.
- 375px width check NOT run; no resize was made, so the pane is still at its default size and no reset was needed.
- Claim DB read-back (user_id set on 34881bfb) and the claimed row appearing in Registrations/History were not checked after the claim.
- "Success card" dev-mode line in production mode not checked.
- Sign-in strip "Back to my registrations" on the sign-in page (change 1) not seen: I arrived signed out from /account, not from an event page. Not verified either way.
- Check-in pass with an open window not seen for prac01 (no open-window registration under a linked user).

## Tooling notes

- Typing with a ref click then real type worked in the sign-in email field; the value and focus were verified before submitting.
- read_page "interactive" returns an empty page right after navigation (pane quirk); find and get_page_text work. A navigate call returns before client-side redirects finish; read the location a call later.
