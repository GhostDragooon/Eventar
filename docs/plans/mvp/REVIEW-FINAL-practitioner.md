# REVIEW-FINAL practitioner (user-lens), walk steps 1-4, 2026-11-03

Reviewer: practitioner user-lens agent. Address prac02@final.invalid. Server :3100, real auth. Budget 40 tool calls; the budget ran out during the completion wizard (step 2). Steps 2 (partly), 3 and 4 are NOT done. Screenshots were inline-only (one at the landing page); none saved to disk.

NOTE ON APPENDS: the brief asked for an append after each step. The tool budget allowed one write. Steps 1 and 2 are recorded together below.

## Step 1 (A1): doors from landing and from a public event page. PASS with findings

Doors recorded (label -> href):

Landing `/`
- "Eventar home" -> `/`
- "How it works" -> `#how-it-works`; "Platform" -> `#platform`; "For organisers" -> `#for-organisers` (in-page anchors)
- "Upcoming events" -> `/events`
- "Start an Event" -> `/login?next=/events/new` (organiser door, top-right primary button, the loudest button on the page)
- "Log in" (header) -> `/account/sign-in`
- Hero tabs: "Attendee" / a second tab with no accessible name (organiser or hosting provider, per the screenshot)
- "Sign up" -> `/account/sign-up`; "Log in" (hero) -> `/account/sign-in`

Public Events list `/events`
- "Home" -> `/`; Events -> `/events`; "Organiser log in" -> `/login`; "Log in" -> `/account/sign-in`
- Category tabs: All / Medicine & dentistry / Allied health / Other (not clicked, budget)
- "View details" per event (clicked 2nd = ZZ-FINAL member c1 -> `/events/ee926641-01e0-494d-b261-20b70918e787`)
- No "Sign up" on this page; only "Log in" and "Organiser log in".

Public event page `/events/ee926641-...`
- "Eventar home", Events, "Organiser log in", "Log in"
- Inline "Log in or sign up first" -> `/account/sign-in?next=/events/ee926641-...`
- Guest form: FULL NAME, EMAIL, Register
- QR text: "Scan or share this code to open this event on another device."

Sign-in `/account/sign-in?next=...`: heading "Log in", "New user? Sign up" -> `/account/sign-up`; email field; "Next"; "Trouble logging in?" list; "Back to home"; "Organiser log in" (twice in the shell and in the footer).

Sign-up `/account/sign-up`: heading "Sign up", email, "Next", "Already have an account? Log in", "Running events? Organiser log in".

### Findings
- MINOR S1-1. The event page's only account door reads "Log in or sign up first" but goes to the log-in page, not sign-up. A new practitioner must find the small "New user? Sign up" link on the next page. Quote: link "Log in or sign up first" -> `/account/sign-in?next=...`. Two clicks to reach sign-up.
- MAJOR S1-2. The `next` parameter is lost on the way to sign-up. Sign-in carries `?next=/events/ee926641-...`, but its "Sign up" link is a bare `/account/sign-up`. The magic link later carried `next=/account/registrations`, not the event. A practitioner who started from an event is dropped on the wizard and then Registrations, not back at the event. They have to find the event again. (Verified: magic link redirect_to was `.../auth/callback?next=%2Faccount%2Fregistrations`.)
- MINOR S1-3. Landing header shows "Log in" and "Start an Event" side by side. A practitioner sees organiser language ("Start an Event", "For organisers") in the first-time door. This is the public site, so acceptable, but "Start an Event" is the most prominent button.
- MINOR S1-4. The second hero tab has no accessible name (`tab [ref_9]`). A screen reader user cannot tell Attendee from organiser.
- NIT S1-5. The public Events list has no Sign up link. Only "Log in" (and "Organiser log in" next to it).
- NIT S1-6. Sign-in copy: "Guest registration still works without an account. This door is for linking past registrations, your ..." The text is truncated in the accessibility tree. I did not read the full sentence.

Four questions (event page -> sign-in -> sign-up): where am I: clear (headings "Log in", "Sign up", "ATTENDEE - SIGN UP"). Main thing: clear (email, Next). How to progress: clear. Way back: "Back to home" on sign-in only; sign-up has the header Home/Events only.

## Step 2 (A2): sign up, magic link, wizard, Registrations. INCOMPLETE (FAIL as a walk; no data written beyond consent)

URL sequence seen: `/account/sign-up` -> "Check your inbox (prac02@final.invalid) for a log-in link." (success state shown on the same page, `check_circle`) -> magic link opened in the same tab -> `/account/complete` (the wizard). Did NOT land on `/account/registrations` because the profile is incomplete. That is expected from the wizard copy ("Finish this and you will see them under Registrations").

Wizard shell `/account/complete`
- Header: "Eventar", the signed-in email, "Sign out"; "Signed in as prac02@final.invalid". No sidebar, no marketing chrome, no organiser words. Good.
- Title: "A few things before you start". Copy: "Any registrations you have made are saved. Finish this and you will see them under Registrations, with your past events in History. It takes about two minutes, and after that registering for an event only asks about the event."
- Steps: 1 Consent, 2 Identity, 3 Professional, 4 Licence.
- Step 1 "Privacy and terms": "I accept the Terms of Service and Privacy Policy." Checkbox plus Continue. Continue showed "Saving..." for more than 4 s on the first call (dev compile, assumed), then moved to step 2.
- Step 2 "Identity": SALUTATION (-, Dr, Prof, Mr, Ms, Mx), FIRST NAME, LAST NAME, PHONE, Back, Continue. Not filled (budget).

### Findings
- MAJOR S2-1. "Terms of Service" and "Privacy Policy" are plain text, not links (accessibility tree shows generic nodes, no href). A practitioner is asked to accept documents they cannot open. Quote: "By continuing, you accept the current Terms of Service and Privacy Policy."
- MINOR S2-2. The wizard has no way back to the event the person came from, and no link to Events. The only exit is "Sign out". A practitioner who signed up from an event page and now sits in the wizard has no visible "return to the event" path. Related to S1-2.
- MINOR S2-3. "Saving..." button gave no progress cue beyond the label change. It lasted several seconds in the dev server. Not judged in production.
- NIT S2-4. Wizard progress list items carry no step status in the accessibility tree until completion (step 1 turned into "check"). Fine visually; not checked for screen readers.

Four questions (wizard step 1-2): where am I: clear ("Account - Complete your profile", 4 steps). Main thing: clear. How to progress: clear (Continue). Way back: Back inside the wizard from step 2; no way back to the site or the event (S2-2).

NOT DONE (budget): wizard steps 2-4 fields, landing on Registrations, sidebar items (Check-in / Registrations / Events / History / Account), empty states, psql row check for users/professional_profiles.

## Step 2 resume (second 40-call budget): wizard Identity + Professional. STILL INCOMPLETE, FAIL (stuck at step 3 of 4)

Done by real clicks and typing: Identity (first name Prac, last name Two, phone +852 5555 0002, salutation left empty) -> Continue worked (step 2 shows a check).
Professional step `/account/complete`: fields Profession, Specialty (list, filled after the profession), Position / rank, Workplace, Department, Back, Continue.

TOOLING NOTE (not a product finding): the three native dropdowns (Profession, Specialty, Position / rank) could not be operated by real click plus keyboard in this pane (the OS popup is not drawn; arrow, Down+Return and typing did nothing). I set them with form_input (Medicine / General Medicine / Medical Officer), against the brief. The values then showed correctly in the screenshot. Treat the dropdown results as synthetic; the Continue click and the typing were real.

### Findings
- MAJOR S2-5 (needs a human re-check). After Profession, Specialty, Position and Workplace were filled, Continue stayed pale (looks disabled), clicking it did nothing, and no message said why. Page text before and after the click was identical; no error, no "Saving...". The only empty field was Department, which is not marked as required. A practitioner cannot tell which field blocks them, so they are stuck at 3 of 4 with no explanation. I did not get to test whether Department unblocks it (budget). If Department is the cause, it is silently required; if not, the dropdown values set synthetically did not register in the form state and this is a tooling artefact. Either way a silent dead end must be ruled on.
- MINOR S2-6. Before a profession is chosen the screen shows two fields both labelled "Specialty" (a dropdown and a free-text box); the free-text one disappears once Medicine is chosen. Confusing for the first seconds.
- MINOR S2-7. "Position / rank" offers only medical ranks (Consultant, Medical Officer, Resident, Clinical Professor...) for every profession, even before a profession is chosen. A nurse or pharmacist would find no fitting option except Other.
- NIT S2-8. Salutation is optional and Phone has the hint "+852 ..." but no label says whether it is required.

State at the stopping point: auth user dbf5b630-f903-459d-8f27-4e0701c30d27 has 0 rows in professional_profiles and 0 rows in registrations (psql SELECT). So nothing is written until the wizard completes, and the consent and identity steps are not saved either (or are held in the browser only).

Four questions (Professional step): where am I: clear (3 of 4). Main thing: clear. How to progress: UNCLEAR, Continue is pale and does nothing without a message (S2-5). Way back: Back button only.

## Step 3 (A3): NOT DONE (budget in both rounds).
## Step 4 (A4): NOT DONE (budget). The duplicate-registration test was not run.

## Coverage gaps
- Sidebar and every portal page (Check-in, Registrations, Events, History, Account): not visited.
- Portal event page, register button, success card, double-registration message: not visited.
- Events list category tabs and the landing "How it works / Platform / For organisers" sections: not clicked.
- Wizard steps 2-4 (Identity, Professional, Licence): not filled; Back button not tested.
- psql checks: see the report; the registrations check was not possible as nothing was registered.

## Severity counts so far
BLOCKER 0, MAJOR 2 (S1-2, S2-1), MINOR 5 (S1-1, S1-3, S1-4, S2-2, S2-3), NIT 3 (S1-5, S1-6, S2-4).

---
# ORCHESTRATOR WALK (steps 2-7), prac02@final.invalid, real clicks and typing in the fronted pane; DB read-back
Tags: [X] executed. Deviation: the three native dropdowns (Profession, Specialty, Position, Accrediting body) cannot be operated by real click or keyboard in this pane; I set them with a React-safe native setter plus a change event (one synthetic input each). Everything else is real input.

## Step 2 (A2) — wizard to home: PASS with 3 findings
- **S2-5 CONFIRMED real, MAJOR (silent dead end).** On the Professional step "Continue" is a truly `disabled` button while Department is empty. Department is required (the input is `required`) but is not marked required and no message says so. Profession, Specialty, Position and Workplace were filled; Continue stayed pale and dead. Typing "Cardiology" enabled it at once [X]. A user cannot tell which field is missing.
- **S2-9 MAJOR (decision for Ivan): the Licence step cannot be finished without a licence.** "Done" is `disabled` until one licence is declared; only the photo says "Skippable". A practitioner with no licence in the list (student, trainee, allied health outside a listed body) is locked out of the portal with no way forward and no copy that says a licence is mandatory. The body dropdown also lists local RLS fixture bodies (local data only, not a product finding).
- After Done: landed on `/account/registrations` inside the practitioner shell. Sidebar: Check-in / Registrations / Events / History / Account plus Sign out. Page text has none of Organiser, Programme, Manage, Roster, Participants, Start an Event. Empty state: "Nothing here yet · You are not registered for any upcoming events. Past events are in History." with a "Find events" button (to /events). Four questions: all clear. [X]
- Sidebar logo "Eventar" links to /events (the public list), not to Registrations: MINOR.

## Step 3 (A3) — browse from inside the portal: PASS with MINOR
"Find events" -> /events keeps the portal shell (sidebar, "Events" lit) and lists events with category tabs. Opening an event leaves the sidebar shell for the public event page with a top bar ("Upcoming events", "Account") and a link "← Back to my registrations". Way back exists. MINOR: the link says "my registrations" although the user came from Events, and the portal sidebar disappears.

## Step 4 (A4) — register: PASS with MINOR
Signed in, the form pre-fills "Registering as Prac Two · prac02@final.invalid". Register -> "YOU'RE REGISTERED · See you on the day", then "You are registered. It is under Registrations." with a "Registrations" link (to /account/registrations). psql: exactly one row, status registered, source self_registration, user_id = dbf5b630-… (the practitioner's auth id), no staff identity anywhere [X]. MINOR: "Need to cancel? See event staff at check-in — this browser tab is your proof of registration." A signed-in practitioner has no cancel path and is told a browser tab is their proof; the record exists under Registrations. MINOR: "Email delivery is in dev mode — check the operator console" and the stub banner show to a practitioner (local/dev only).
- Double-register not run (not reached).

## Step 5 (A5) — record state: PASS
Registrations shows card "Upcoming · ZZ-FINAL member c1 · 04 Dec 2026, 09:00 (GMT+8) · Check-in opens at 04 Dec 2026, 08:00 (GMT+8)" and "Find more events". The event title links to the event. No pass is shown before the window (correct). Next action: Find more events / open the event. MINOR: no hint that the pass appears at check-in time and no cancel control.

## Step 6 (A6) — organiser CTA while signed in as practitioner: PASS
Landing page "Start an Event" -> /login?next=/events/new shows "Organiser log in: You're signed in as prac02@final.invalid. Organiser log in is for organiser emails only. Attending events? Your account is below. Invited as an organiser? Open the invite link your admin sent you." Buttons: "Back to my registrations" and "Sign out and use another email". Still signed in; honest; way back. MINOR: "Your account is below" points at nothing below; no organiser Sign Up link although Doctrine 2026-10-30 says "Point to Organiser Sign Up or the Attendee door". MINOR: while signed in the landing header still shows "Log in" and "Sign up" instead of the account.

## Step 7 (A7) — staff on the public page: PASS
Executed in the organiser walk as ux-admin: the public page says "You're signed in as an organiser. This creates a guest registration." and the only route back was the header "Events" link (MINOR, no explicit "back to event manager"). psql [X]: guest zzwalk1@final.invalid and zzwalk2@final.invalid have user_id NULL; walk-in zzwalkin1 user_id NULL; no professional_profiles row and no registration under ux-admin, ux-member or ux-body. Info: two older fixture staff identities do own rows (uxr-guest2@eventar-review.invalid has a professional_profiles row; uxreview2-nobody@eventar-review.invalid owns one registration). Both pre-date this run (earlier review sessions); not produced by this walk; Ivan may want the fixtures cleaned.
