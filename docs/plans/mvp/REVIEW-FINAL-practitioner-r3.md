# MVP acceptance walk r3: PRACTITIONER lens (2026-11-14)

Actors: one fresh practitioner (real sign-up, Mailpit magic link, role: no staff row), one disposable `organiser_admin` (A7 only), signed-out guests (S8). Server :3100, local stack, `EVENTAR_REVIEW_MODE=false`. Tags: [X] executed this run, [R] read in code, [I] inferred. Screenshots: none on disk (inline only: consent step, race form). Calls used: about 125 of 130. Wizard selects (profession, specialty, position) were set with `form_input` as setup only; every button, link and registration click was a real click.

Fixtures (all deleted): events `ZZ-WALK prac main` (+3d, published), `ZZ-WALK prac capacity` (+4d, max 1), `ZZ-WALK prac race` (+5d, max 1; extra, for the race click).

## Rows

| Row | Verdict | Evidence |
|---|---|---|
| A1 doors, landing page and public event page | PASS [X] | Landing (signed out): "Start an Event" -> `/login?next=/events/new`; "Log in" -> `/account/sign-in`; "Sign up" -> `/account/sign-up`; "Upcoming events" -> `/events`. Event page: "Organiser log in" -> `/login`; "Log in" -> `/account/sign-in`; "Log in or sign up first" -> `/account/sign-in?next=<event>`, whose "Sign up" link keeps `next` (`/account/sign-up?next=%2Fevents%2F<id>`). All HTTP 200 and render; no dead end. See N1, N2. |
| A2 sign-up, wizard, consent | PASS [X] (S1 holds) with the known MAJOR, and "land on Registrations" NOT RUN | Magic link -> `/account/complete?next=<event>`, 4 steps Consent / Identity / Professional / Licence. Untick: Continue greyed, "Tick the box above to continue." Identity empty: greyed, "Add your first name, last name and phone to continue." After consent Continue, `consent_records` for the user: `terms_of_service, tos-0.1-draft, granted_at 13:42:10.514, withdrawn_at NULL` and `privacy_policy, pp-0.2-draft, granted_at 13:42:10.586` (2 rows, written by the wizard). Known MAJOR M1 below. Wizard does not stop without a licence: step 4 says "You can add a licence later from your profile. Credit is released only for events you check in to after you declare a licence." and "Done" lands on `next`. I arrived through an event page, so I landed on the event page (it shows "<- Back to my registrations"), not Registrations. The no-`next` landing was not walked. |
| A3 browse events from the portal, open one | PASS [X] | Registrations -> "Find more events" -> `/events` -> "View details" -> `/events/ddcf883c-...` ("ZZ-WALK prac capacity"). Signed-in nav present: Check-in, Registrations, Events, Record, Account. See N3. |
| A4 register while signed in | PASS [X] | Form pre-filled ("Registering as ZZWalk PracOne - zz-walk-prac1@example.test"). DB: `registrations` row `89333ca2-...`, `user_id e7d06e60-... = auth id`, `source self_registration`, `status registered`, `registration_code E8F5CW`, `profile_snapshot` present (profession medicine, `licence_summaries []`). Page: "YOU'RE REGISTERED ... You are registered. It is under Registrations." True: A5 shows it. See MINOR m1. |
| A5 record state under Registrations | PASS [X] | "Registrations / The events you have signed up for. / Account setup is not finished: no current licence is declared. Credit is released only for events you check in to after you declare one. [Add a licence] / Upcoming / ZZ-WALK prac main / 17 Nov 2026, 21:40 (GMT+8) / Check-in opens at 17 Nov 2026, 20:40 (GMT+8) / Find more events". Registration code and pass are not shown on this list (`/account/check-in` not walked). |
| A6 organiser CTA while signed in as practitioner | PASS [X] | "Start an Event" while signed in -> `/login?next=/events/new` shows: "You're signed in as zz-walk-prac1@example.test. Organiser log in is for organiser emails only. Attending events? Your account is below. Invited as an organiser? Open the invite link your admin sent you." Buttons "Back to my registrations", "Sign out and use another email". Still signed in until I clicked sign out; that button then showed the plain organiser form ("Staff emails only. ..."). |
| A7 staff on the public page | PASS [X] | Signed in as `organiser_admin` (magic link, landed `/dashboard`). Event page text: "You're signed in as an organiser. This creates a guest registration." Result: "GUEST REGISTERED ... ZZ Staff Guest (zz-walk-guest@example.test)". DB: `user_id NULL, profile_snapshot NULL, source self_registration, status registered`. `professional_profiles` for the staff auth user: 0. (`public.users` has a row for the staff auth user; I did not read it before the click, so I cannot say the registration did not create it. Inference: the sign-in or user creation did.) |
| S8 capacity (max 1) | PASS [X] with m2, N4 | First practitioner (prac1, signed in) registered: DB 1 row, `self_registration`, user linked. Second visitor (signed out): page chip "REGISTERING", panel "At capacity", text "This event is at capacity (1/1 registered). Future events will open registration soon." The form is gone; only the header links ("Upcoming events", "Log in") remain. No dead end in the technical sense, but no recovery action in the panel. DB count stayed 1 [X]. A second signed-in practitioner attempt was not walked (the form is absent from the page, so the UI offers no attempt). Race (event `race`, max 1): form open and filled, filler row inserted by SQL, Register clicked: red panel above the button "This event is at capacity." Row count stayed 1, 0 rows for the race email [X]. The form stays enabled and unchanged. |
| Cold-start wrong turns | PARTIAL [X] | Consent unticked and identity empty: see A2 (buttons greyed, reason shown). Event form, name replaced with spaces: Register greyed, no message, line reads "Registering as  - zz-walk-prac1@example.test"; DB 0 rows (m3). NOT RUN: invalid email on sign-up and on the event form, duplicate registration of the same email, empty name on the guest form. |

## Findings

**BLOCKER:** none.

**MAJOR**

- **M1 (known, predates this phase; recorded once): consent names Terms and Privacy that do not exist.** Exact copy: "Eventar uses your professional identity to release CME/CPD credit for events you attend. By continuing you agree to the terms and privacy policy we will publish before launch." and the checkbox "I agree to the Eventar terms and privacy policy once published." The copy contains no links (`read_page`: no anchors in the step), so no link can be walked. `/terms`, `/privacy`, `/legal/terms`, `/legal/privacy` all return 404 [X: curl]. The user must accept documents they cannot open. The consent grant itself works (S1 PASS).

**MINOR**

- **m1: signed-in confirmation tells an account holder their browser tab is the proof.** After A4: "Need to cancel? See event staff at check-in — this browser tab is your proof of registration." directly under "You are registered. It is under Registrations." Contradicts the account record, and offers no self-cancel path.
- **m2: capacity race message has no next step.** "This event is at capacity." appears inline, the form stays enabled, the page chip is not updated until reload. After reload the page shows the "At capacity" panel with "Future events will open registration soon." (parked copy).
- **m3: Register is disabled with no reason for a whitespace-only name.** Button greyed, nothing explains why, and the "Registering as" line loses the name. (Native `required` accepts spaces; the button logic rejects them silently.)

**NIT**

- N1: the public event page has no direct "Sign up" link; the only door is "Log in or sign up first" -> sign-in -> "Sign up" (two clicks).
- N2: the landing page hero tab panel still shows "Sign up" and "Log in" while signed in (header shows "Account").
- N3: on `/events`, one click on the card heading did nothing; only "View details" navigated. Not re-clicked, so unconfirmed.
- N4: event page chip reads "REGISTERING" while the event is at capacity (parked "full event page copy").
- N5 (environment, not product): the Licence step's accrediting-body list and `/events` carry hundreds of RLS-test fixture rows from the local DB.

## Not run (gaps)

A2 landing on Registrations when `next` is absent; invalid-email and duplicate-registration wrong turns; `/account/check-in` and `/account/record`; second signed-in practitioner on the capacity event (UI offers no form).

## Cleanup and residue

Deleted in order: `email_log`, `registrations` (4), `event_occurrences` (3), `events` (3), `staff` (1), then auth users `e7d06e60-3d5f-4116-8214-097e632a4416` (practitioner) and `8875cbc1-6e94-4e01-96f6-ebecb017a20d` (staff) through the admin API (both 200; the first attempt sent a stray body and did nothing, retried). Leftovers, stderr visible: `auth_left=0 events=0 staff=0 regs=0 consent_orphans=0 profile_orphans=0 my_public_users_left=0`. `public.users` shows 240 orphan rows overall, all from earlier runs (none mine). Expected residue: `audit_events` (sign-ins, consent grants, registrations). Ids: events `37c570e5-02a6-4ecc-a7e3-a0b2ae3c4ca9`, `ddcf883c-b1a0-4e2a-a747-35d382670866`, `b1c32f6f-4491-4b16-abdb-c940853f9943`; staff `90dfaba5-0a53-4c1d-ae4f-1436a96bddaf`; registrations `89333ca2-ab6c-4702-838c-1a441a3c99a7`, `e62e87cd-ba3d-4c16-b29a-f4891d307fa9`, `827d6dc3-c6ce-4e27-aefe-6d5b6ca3e111`, `b4e70441-f5b8-4d9c-b795-8f865c9305c9`. The local redirect server on :8765 was killed by PID (no listener); scratch link and env files removed; browser cookies cleared. Magic links and keys were never printed.
