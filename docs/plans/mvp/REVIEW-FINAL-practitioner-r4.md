# MVP acceptance walk r4: PRACTITIONER lens (2026-11-21) - FINAL

HEAD 1a7d2bf. :3100 review mode OFF (`/events/new` signed out = 307). Local stack. Built-in Browser pane. Tags [X] executed, [R] read in code, [I] inferred. Screenshots: the pane tool saves each screenshot to a file under `/Users/ivan/.claude/projects/-Users-ivan-Eventar/d34a0c1c-6fa2-4cf1-b5a9-ceb867212205/tool-results/mcp-Claude_Browser-blob-*.jpg` (on disk, named by the tool, not by me). Wizard selects (profession, specialty, position) set with `form_input` as setup only; every button/link/registration click was a real click.

Fixtures: events `ZZ-R4-prac main` (70b35e99-..., +3d, cap 10), `ZZ-R4-prac race` (9626305b-..., +5d, cap 1); staff `zz-r4-staff@example.test` (organiser_admin); actors `zz-prac-r4-1@example.test` (practitioner).

## Rows so far

| Row | Verdict | Evidence |
|---|---|---|
| A1 doors, landing (signed out) | PASS [X] | Attendee tab: header "Log in" -> `/account/sign-in`; hero "Sign up" -> `/account/sign-up` (real click reached "Sign up" page). Organiser tab: header pill becomes "Organiser log in" -> `/login`; hero has NO "Start an Event" / "Sign up" (r3 had "Start an Event"); hero CTAs "Browse accredited events" -> `/events`, "See how it works". Intentional per commit 84dd2dd; organiser door still reachable. |
| A2 sign-up, wizard, consent (entry: landing -> Sign up, no `next`) | PASS [X] + known MAJOR M1 | Magic link `redirect_to=.../auth/callback?next=/account/registrations`, but first landing was the wizard (`/account/complete`) because profile incomplete. Untick: Continue greyed, "Tick the box above to continue." Identity empty: greyed, "Add your first name, last name and phone to continue." After Continue: `consent_records` `terms_of_service tos-0.1-draft` + `privacy_policy pp-0.2-draft`, both withdrawn_at NULL (2 rows, DB read-back). Licence step skipped; Done lands on `/account/registrations` (the no-`next` landing r3 did not walk: PASS). Consent sentence verbatim: "Eventar uses your professional identity to release CME/CPD credit for events you attend. By continuing you agree to the terms and privacy policy we will publish before launch." Checkbox: "I agree to the Eventar terms and privacy policy once published." No anchors in main (JS read). curl: /terms 404, /privacy 404, /legal/terms 404, /legal/privacy 404, /account/terms 404, /account/privacy 404. |
| A3 browse from portal | PASS [X] | Registrations empty state "No upcoming events" + "Find events" -> `/events` (skeleton, then list) -> "View details" -> event page. Nav: Check-in, Registrations, Events, History, Account (Record renamed History). Card title click does nothing, re-clicked twice (N3 confirmed, not a no-response artefact: only "View details" is the link). |
| A4 register while signed in | PASS [X] | DB: `registrations` user_id = auth id (linked t), source self_registration, status registered, code U55Z8V, profile_snapshot present (position_code medical_officer ...). |
| A5 record state | PASS [X] | Registrations: "Upcoming / ZZ-R4-prac main / 24 Nov 2026, 17:30 (GMT+8) / Check-in opens at 24 Nov 2026, 16:30 (GMT+8)". `/account/check-in`: "Show your pass to the organiser at the door. Check-in opens 60 minutes before an event starts and closes when it ends." ... "Nothing here yet / Your pass appears here 60 minutes before an event starts." (correct: event is 3 days out). `/account/record` is now titled "History": "No past events yet. Events you have signed up for are under Registrations. Browse events to register, or link past registrations from Account." / "No points in your History yet. Points release after check-in once your profile and licence are complete." |
| Wrong turn: invalid email, sign-up | PASS [X] | Native `type=email` for "not-an-email" stops submit (browser validation, not app). "a@b" passes native: inline red box "Please enter a valid email address." |
| Wrong turn: invalid email, event form (signed in) | PASS [X] with NIT | "a@b": red box "Invalid email", DB rows 0. Message differs from sign-up copy (see N-copy). |
| Wrong turn: whitespace-only name (signed in) | FAIL-minor [X] | Register greyed, no reason in words; line reads "Registering as  · zz-prac-r4-1@example.test"; re-clicked the greyed button, read whole page: no message. DB 0 rows. Still m3 from r3, unfixed. |

| Wrong turn: duplicate registration, same email | PASS [X] | Signed in, event page reloaded after registering: the page shows the empty register form again (no "you are already registered" state, see m5). Register -> inline "That email is already registered for this event." DB count stayed 1. Same message for a signed-out guest typing the registrant's email (row count 1). |
| Wrong turn: empty guest name (signed out) | FAIL-minor [X] | Register greyed with empty fields; clicked, read whole page: no message. Same class as whitespace name (m3). |
| Wrong turn: unticked consent | PASS [X] | See A2 (greyed + reason in words). DB: 0 consent rows until ticked. |
| Capacity race | PASS [X] | Race event cap 1, 0 rows; form open and filled signed out; filler row inserted via SQL; Register -> red box "This event is at capacity." DB total 1, 0 rows for the race email. After reload: "At capacity" / "1/1 registered." (r3 parked copy "Future events will open registration soon" is gone). Chip still reads "REGISTERING". |
| A6 organiser door while signed in | PASS [X] | `/login` while signed in as the practitioner: "Organiser log in / You're signed in as zz-prac-r4-1@example.test. Organiser log in is for organiser emails only." + "Back to my registrations" + "Sign out and use another email". Honest, still signed in (clicking Back landed on Registrations signed in). Entry was `/login` typed: when signed in, the landing page has NO organiser door at all (header "Account", Organiser tab hero has no pill). Header pill on this page says "Log in" although signed in (n6). |
| A7 staff on public page | PASS [X] | Staff magic link (landed `/dashboard`). Header "You're viewing the public page [Events]". Copy "You're signed in as an organiser. This creates a guest registration." -> "GUEST REGISTERED / Registered as a guest / ZZ R4 Staff Guest (zz-prac-r4-staffguest@example.test) / Registered. No confirmation email was sent." DB: user_id NULL, profile_snapshot NULL, source self_registration. |
| Signed-out guest registers | PASS [X] | "YOU'RE REGISTERED / See you on the day / You're registered. We couldn't send email; show this screen to staff. / Closer to the event we'll email your personal check-in pass. / Need to cancel? See event staff at check-in." + button "Sign up". DB user_id NULL. |
| "Browser tab is your proof" copy (r3 m1) | FIXED [X] | Signed-in confirmation now reads "You're registered. We couldn't send email; show this screen to staff. ... Need to cancel? See event staff at check-in. ... You are registered. It is under Registrations." The "this browser tab is your proof" sentence is gone. Residue: "show this screen to staff" (email-stub branch, RESEND unset locally) still tells an account holder the screen is the proof (m4), and "You're registered" is said twice. |
| Phone nav 375px | PASS [X] | `scrollWidth 375 = innerWidth 375` on Registrations, event page, Account. Portal bottom bar: Check-in, Registrations, Events, History, Account, each 44-74 x 48 px, active tab marked. Public pages: floating pill "Events / Account" (signed in) or "Events / Log in" (signed out); it covers the Register button at top of scroll but the page scrolls clear of it. Dev "N" badge overlaps the "Check-in" label (dev overlay, environment). "Check-in" label sits ~6px from the screen edge (nit). Sign out is not in the phone bottom bar; it is in the Account page "Session" card (102x44). Small tap targets on Account: "Fix" 19x20, "Edit professional profile" h20 (nit). |
| Sign-out, old cookie rejected | PASS [X] | Phone Account > Session > "Sign out" -> lands on `/` showing "Log in". Old session cookie replayed with curl (value never printed): pre-signout `/account/registrations` shows the user; after, body carries `NEXT_REDIRECT;replace;/account/sign-in?next=%2Faccount%2Fregistrations` and no user data, identical to no cookie. (HTTP is 200 both ways because of the streamed redirect, so status is not the oracle.) |
| Headings, cards, empty states, inline errors (batches 3-5) | PASS [X] | One H1 per page; 20px cards with shadow; empty-state recipe "No upcoming events" / "Nothing here yet" each with one button; inline red error box with icon on sign-up, event form, capacity, duplicate. No regression seen. Viewport reset to desktop, `eventar-theme` removed. |

## Findings

**BLOCKER:** none.

**MAJOR**

- **M1 (known, predates, recorded once): consent names Terms and Privacy that do not exist and cannot be opened.** Exact sentence: "Eventar uses your professional identity to release CME/CPD credit for events you attend. By continuing you agree to the terms and privacy policy we will publish before launch." Checkbox: "I agree to the Eventar terms and privacy policy once published." No anchors in `main`; `/terms`, `/privacy`, `/legal/terms`, `/legal/privacy`, `/account/terms`, `/account/privacy` all 404 [X: curl]. Consent rows `tos-0.1-draft` and `pp-0.2-draft` are written. Not fixed per brief.

**MINOR**

- **m3 (r3, unfixed): disabled Register gives no reason for a whitespace-only or empty name.** Event form (signed in: name set to spaces; signed out: empty). Button greyed; clicking it does nothing; the page text below has no message; the "Registering as  · <email>" line loses the name. Wizard steps do explain themselves ("Tick the box above to continue.", "Add your first name, last name and phone to continue."), so the event form is the odd one out.
- **m4: "show this screen to staff" tells a signed-in account holder the screen is their proof.** Shown after a signed-in registration when email fails ("You're registered. We couldn't send email; show this screen to staff."). Account holders have a pass under Check-in. Local env has no RESEND key, so the branch is expected here; the copy is still wrong for a linked user. [R unverified for prod branch.]
- **m5: signed-in user who already registered sees the empty register form again.** Reloading the event page after registering shows "Registering as ZZR4 PracOne ... Register" instead of a registered state; the duplicate is only caught after the click ("That email is already registered for this event."), with no link to Registrations.
- **m2 (r3, partly fixed): capacity has no next step.** Race message "This event is at capacity." has no action; after reload "At capacity / 1/1 registered." (better than r3) with no "browse other events" button.

**NIT**

- N1 (r3, unfixed): the public event page has no direct "Sign up"; only "Log in or sign up" -> `/account/sign-in?next=<event>`.
- N2 (r3, unfixed): landing hero still shows "Sign up" while signed in (header shows "Account").
- N3 (r3, confirmed twice): on `/events`, a click on the card title does nothing; only "View details" navigates.
- N4 (r3): chip "REGISTERING" at capacity.
- n5: two different messages for the same invalid email: sign-up "Please enter a valid email address.", event form "Invalid email". The sign-up input is also cleared after the error, and the red box stays while "Sending..." is shown on the next submit; the event-form red box stays after the email is corrected until the next submit.
- n6: `/login` shows a "Log in" pill in the header while the page says "You're signed in as ...". Landing page has no organiser door at all when signed in; account menu lists History, Profile, Account, Sign out (no Registrations or Check-in, which the sidebar has).
- n7: portal "Record" is now titled "History" (sidebar, route still `/account/record`). Consistent inside the app; the History copy "No points in your History yet." repeats the word.
- N5 (environment): licence step lists ~330 RLS-fixture accrediting bodies; `/events` lists RLS fixtures.
- n8: Organiser tab hero has no "Start an Event" any more (intended by 84dd2dd); noted because r3 A1 relied on it.

## Not run (gaps)

- `/account/check-in` with a pass inside the 60-minute window (event was 3 days out, so only the empty state was seen).
- Old cookie replay was done by curl only, not by a second browser tab.
- Real Next button click on sign-up was not walked (Enter and the Next button both submitted; the Next click did work: "Check your inbox (...) for a log-in link").
- Screenshots: every step above has a pane screenshot on disk under the tool-results path in the header; the pane tool does not let me pick filenames. Steps read only by text (get_page_text/JS): wizard Identity/Professional fills, `/events` read, phone nav geometry.
- Tool-call budget: exceeded the ~130 guide (about 150 calls).

## Cleanup and residue

Deleted in one txn: `email_log` (5), `registrations` (4), `event_occurrences` (2), `events` (2), `staff` (1); `participation_evidence` and `credit_ledger` tails were 0 for these events. Auth users `d535d81d-4731-42a6-b6a8-d06d56f61647` (practitioner) and `dd0ecd54-59de-4d5e-b057-bb8bea0c113e` (staff) deleted via admin API (both 200). Leftovers, stderr visible: `events=0 staff=0 regs=0 auth=0 consent_orph=0 prof_orph=0 my_public_users=0`. Expected residue: `audit_events` (sign-ins, consent grants, registrations). Background helper servers on 127.0.0.1:8765/8766 killed by PID (no listener); scratch link/cookie/env files removed; browser cookie cleared; magic links and cookie never printed. Main checkout: only this review file is new from this run.
