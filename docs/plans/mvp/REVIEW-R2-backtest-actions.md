# REVIEW R2 - backtest-actions lens

- Date: 2026-11-02
- Base: 4c04977 plus the uncommitted working tree (cards B and D, agenda/venue/timezone fixes).
- Lens: backtest-actions. Real Server Actions and routes on http://localhost:3100 (review mode OFF: a signed-out `/events/new` returns 307), real local Postgres :54322, real GoTrue :54321 sessions. curl, psql and node only; no browser tools, no code edits, no git writes, no builds, no server start or stop.
- Tool calls: about 57 of the 90 cap (stop line 80). All cases in scope were executed except where a gap is named below.
- Tags: [X] executed and read back. [I] inference (labelled).
- Method: 7 disposable auth users (`zz-bt3-*@final.invalid`) and 2 orgs (`ZZ-BT3 org A/B`): organiser_admin, organiser_member, body_admin, auditor in A; organiser_admin in B; a complete practitioner; an incomplete practitioner. Sessions minted with `@supabase/ssr` `signInWithPassword`, cookies in 0600 scratch files (never printed, deleted at the end). Server Actions called with `curl POST <page> -H "Next-Action: <id>"`, ids from `.next/dev/server/server-reference-manifest.json`.
- Prior DB-level backtest (`REVIEW-R2-wave1-backtest-db.md`) read only to avoid repeating; nothing here repeats its SQL-level cases.

## Verdict

No BLOCKER. The five behaviours the cards promised hold at the Server Action layer: the email lock message, the pre-insert role refusal on walk-in, the audit payload without raw addresses, the UTC instant plus venue-zone display, and the portal strings. Two MAJOR findings (S1 role gap, agenda order enforced only in the form), four MINOR, four NIT. Nothing leaked across organisations.

## Case table

| Case | Actor | State | Response (exact) | DB read-back | Tag |
|---|---|---|---|---|---|
| A1.1 | organiser_admin | attended, unlinked; name-only edit | `{"ok":true}` | name changed, email unchanged, 1 audit row `registration_contact_updated` | [X] |
| A1.1 repeat | organiser_admin | same row, name edited again | `{"ok":true}` | name changed, audit rows for the row 1 -> 2 | [X] |
| A1.1m | organiser_member | attended, unlinked; name-only | `{"ok":true}` | name changed, email unchanged, 1 audit row | [X] |
| A1.2 | organiser_admin | attended; email change | `{"error":"This person has already checked in, so their email cannot be changed. You can still correct their name."}` (plain sentence, exact) | email unchanged, audit rows unchanged (0 -> 0 new) | [X] |
| A1.2m | organiser_member | attended; email change | same sentence | email unchanged, audit 1 -> 1 | [X] |
| A1.3 | organiser_admin | unattended, unlinked; email ` ZZ-BT3-Un-New@Final.Invalid ` | `{"ok":true}` | stored `zz-bt3-un-new@final.invalid` (trimmed, lower-cased); 1 audit row, payload `{"fields":["email"],"email_before_sha256":"743c...","email_after_sha256":"f139..."}`; search of the whole payload for `zz-bt3-un` and `final.invalid`: 0 hits | [X] |
| A1.3m | organiser_member | unattended, unlinked; email change | `{"ok":true}` | email changed, payload same shape (two sha256 keys, no address) | [X] |
| A1.4 | organiser_admin | linked (user_id set); email change | `{"error":"This registration belongs to an Eventar account, so its email cannot be changed here. The name can."}` | email unchanged | [X] |
| A1.4n | organiser_admin | linked; name-only | `{"ok":true}` | name changed | [X] |
| A1.5 | organiser_admin of org B | org A registration, name + email change | `{"error":"You do not have access to this registration."}` | name and email unchanged; no data in the reply | [X] |
| A1.5b | organiser_admin of org B | non-existent registration uuid | `{"error":"Registration not found."}` | n/a | [X] |
| A1.6 | signed out | any | HTTP 307, `location: /login?next=%2Fevents%2F<id>%2Fregistrations` (action never runs) | row unchanged | [X] |
| A1.7a | organiser_admin | `registrationId: "not-a-uuid"` | `{"error":"Invalid UUID"}` (HTTP 200, not 500) | n/a | [X] |
| A1.7b | organiser_admin | email `not-an-email` | `{"error":"That is not an email address."}` | n/a | [X] |
| A1.7c | organiser_admin | name `"  "` | `{"error":"A name is required."}` | n/a | [X] |
| A1.7d | organiser_admin | args `[null]` | `{"error":"Invalid input: expected object, received null"}` (HTTP 200) | n/a | [X] |
| A1.7e | body_admin, auditor | same-org registration, email change | `{"error":"You do not have access to this registration."}` (both) | name and email unchanged | [X] |
| D1.walk | body_admin | in-window event | `{"error":"Your role cannot check people in. Ask an organiser admin or member."}` HTTP 200 | registrations for the walk-in email: 0 before, 0 after | [X] |
| D1.walk | auditor | in-window event | same sentence | 0 rows | [X] |
| D1.walk | organiser_admin of org B | org A event | `{"error":"You do not have access to this event."}` | 0 rows | [X] |
| D1.walk | organiser_admin (A) | in window | `{"ok":true,"registration":{...,"code":"..."},"credit":{"anyIssued":false,"allSkipped":false,"lines":[]}}` | 1 row: source `walk_in`, user_id NULL, status attended, check_in_method manual, 1 `registration_checkins` row | [X] |
| D1.walk | organiser_member (A) | in window | same shape | same read-back | [X] |
| D1.walk | organiser_admin | event starting in 10 days | `{"error":"Check-in has not opened yet. It opens 60 minutes before the event starts."}` | 0 rows | [X] |
| D1.walk | organiser_admin | invalid email / bad event uuid / signed out | `{"error":"Invalid email"}` / `{"error":"Invalid UUID"}` / 307 to `/login?next=...` | 0 rows | [X] |
| D1.walk | organiser_admin | email already registered and attended | `{"error":"This email is already registered. Use code entry to check them in."}` | no new row | [X] |
| D1.leg | organiser_admin | published event, now inside the event window, but two occurrences both in the future (walk-in gate passes, `mark_attended` returns `not_open_yet`) | `{"error":"ZZ BT3 Walk nomatch2 was registered (code M5B2DZ) but not checked in. Check-in has not opened yet. It opens 60 minutes before the event starts."}` | row LEFT: status registered, source walk_in, 0 check-in rows, 1 `email_log` row (skipped). Retry same email: "This email is already registered. Use code entry to check them in." Enter-code with M5B2DZ: same "Check-in has not opened yet..." line | [X] |
| D1.leg (throw branch) | - | `markAttended` throwing after the insert (the "Use Enter code with Y to finish." text) | not provoked | - | not covered (see gaps) |
| D1.mark | body_admin, auditor | in-window event, registered row | `{"error":"Your role cannot check people in. Ask an organiser admin or member."}` HTTP 200, not 500 | status registered, 0 check-in rows | [X] |
| D1.mark | signed out | any | 307 to `/login?next=...` | - | [X] |
| D1.mark | organiser_admin of org B | org A code | `{"error":"Code not recognised."}` | status registered, 0 check-ins | [X] |
| D1.mark | organiser_admin | code `zzz` | `{"error":"Invalid code format."}` | - | [X] |
| D1.mark | organiser_member | in window, registered | `{"ok":true,"registration":{...},"credit":{...}}` | status attended, 1 check-in row | [X] |
| D1.mark | organiser_admin | same code again | `{"error":"Already attended.","alreadyAttendedAt":"2026-11-02T15:06:20.248935+00:00"}` | unchanged | [X] |
| D1.mark | organiser_admin | method `"carrier-pigeon"` (hand-built) | HTTP 500 (no body message) | status registered, nothing written | [X] |
| S1 | body_admin | live event, speaker `ZZ-BT3 Host` | `{"ok":true,"checkedInAt":"2026-11-02T15:06:40.088Z"}` | `speaker_checkins` row created, checked_in_at set | [X] |
| S1 | auditor | same | `{"ok":true,"checkedInAt":null}` (toggled off) | checked_in_at NULL, updated_by = auditor's staff id | [X] |
| S1 | organiser_member, organiser_admin | same | `ok` both, toggling | row follows each call | [X] |
| S1 | organiser_admin | event starting in 10 days (check-in not open) | `{"ok":true,"checkedInAt":"..."}` | row created: there is no window check | [X] |
| S1 | organiser_admin of org B | org A event, real speaker name | HTTP 500, `digest ...`, log: `new row violates row-level security policy for table "speaker_checkins"` (42501) | no row changed | [X] |
| S1 | organiser_admin of org B | org A event, name not on agenda | `{"error":"That name is not a speaker on this event's agenda."}` | - | [X] |
| S1 | organiser_admin | name `Nobody`; signed out | plain sentence; 307 | - | [X] |
| E1.create | organiser_admin | `createEvent` London draft, blocks sent Late, Early, Mid (13:00, 09:30, 11:00) | HTTP 303 `x-action-redirect: /events/<id>/edit?saved=1` | `agenda_blocks.display_order`: Late 0, Early 1, Mid 2. The server keeps the payload order; it does NOT sort by start | [X] |
| E1.update #1 | organiser_admin | `updateEvent`, same blocks WITH ids, sent in start order | `{"ok":true,"blockIds":[Early,Mid,Late]}` | display_order 0,1,2 = Early 09:30, Mid 11:00, Late 13:00; 3 rows; ids unchanged | [X] |
| E1.update #2 | organiser_admin | identical payload again | same `blockIds` | 3 rows, ids identical, no duplicates | [X] |
| E1.update #3 | organiser_admin | hand-built payload with ids, reversed order | `ok` | display_order follows payload index again (Late 0, Mid 1, Early 2) | [X] |
| E1.update #4 | organiser_admin | same blocks WITHOUT ids (stale client) | `ok` | still 3 rows (no duplicates) but all 3 ids replaced | [X] |
| E1.no-start | organiser_admin | block with `start_time` missing | `{"error":"block 1.start_time: Invalid input: expected string, received undefined"}` | nothing saved | [X] |
| E1.empty-start | organiser_admin | block with `start_time: ""` | `{"error":"block 1.start_time: Invalid ISO datetime; block 1.end_time: Block end must be after start"}` | nothing saved | [X] |
| T1 | organiser_admin | `createEvent` published, New York coords, entered start `2026-12-01T14:00:00.000Z` | 303 to `/events/<id>/details?published=1` | `start_time` 2026-12-01 14:00:00+00, `timezone` America/New_York, published_at set | [X] |
| T1 | organiser_admin | same, London coords, `09:00Z` | 303 | `start_time` 09:00:00+00, `timezone` Europe/London | [X] |
| T1 public | signed out | `/events/<NY id>` | prints `Tue 1 Dec` `09:00-17:00` `(America/New_York)`; agenda rows `10:30` (stored 15:30Z) and `14:00` (stored 19:00Z), in start order | 14:00Z -> 09:00 EST, 15:30Z -> 10:30, 19:00Z -> 14:00: no off-by-hours | [X] |
| T1 public | signed out | `/events/<London id>` | `Tue 1 Dec` `09:00-17:00` `(Europe/London)` | matches (GMT = UTC in December, so it proves little by itself) | [X] |
| R1a | practitioner (complete) with 1 guest registration, same confirmed email | `/account/registrations`, `/account/check-in`, `/account/record` | all three 200; banner text "We found 1 registration made with your email as a guest. Link it to your account to see it here." and the "Link past registrations" link on all three | - | [X] |
| R1a (none) | same user after I linked the guest row (fixture update) | same three pages | banner count 0 on all three | - | [X] |
| R1b | same user, linked upcoming registration | `/account/registrations` | "Check-in opens at 05 Nov 2026, 22:04 (GMT+8)" (event start 23:04 HKT) | - | [X] |
| R1c | practitioner with no `professional_profiles` row | the three pages | HTTP 200 streamed page with `NEXT_REDIRECT` and `<meta http-equiv="refresh" content="1;url=/account/complete">`; `/account/complete` shows "Your registrations are saved. Finish this and you will see them under Registrations, with your past events in History. It takes about two minutes, and after that registering for an event only asks about the event." | - | [X] |
| R1d | complete attendee / signed out / staff session | `/events/<id>` | "Back to my registrations" count 1 / 0 / 0 | - | [X] |
| R1e | complete attendee | nav labels on the three pages | exact "History" present (2-3 times per page), exact "Record" absent, "Registrations" and "Check-in" present; the word "Record" appears 0 times in the HTML (includes the account menu markup as rendered server-side) | - | [X] (the account menu popup content is client-rendered on click: [I] it follows the same labels) |
| O1 | organiser_admin (event creator) | `/events/<id>/registrations` | "Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in."; chip "Organiser Admin"; "Sign out" | - | [X] |
| O1 | organiser_member | same | "...Edit contact details here. To check people in, open Check-in."; chip "Organiser"; "Sign out" | - | [X] |
| O1 | body_admin, auditor | same | "Everyone registered for this event. You can view contact details; an organiser admin or member can edit them."; chips "Body Admin" / "Auditor"; "Sign out" | - | [X] |
| O1 | organiser_admin, organiser_member | `/events/<id>/checkin` | "Live capture only: scan, enter a code or add a walk-in. To edit a person's details or roles, open Registrations." | - | [X] |
| O1 | body_admin, auditor | `/events/<id>/checkin` | "Live capture only: this desk is read-only for your role. To see everyone registered, open Registrations."; "cannot check people in" sentence present (1) | - | [X] |
| O1 | all four staff roles | `/checkin` | H1 "Check-in: choose an event" and "Open the desk for an event that is live now or coming up. A desk opens 60 minutes before the start." (identical for every role) | - | [X] |
| O1 signout | auditor | `/auth/v1/logout` | 204; old access token on `/auth/v1/user` -> 403 `session_not_found`; fresh GET `/events/<id>/checkin` and `/checkin` with the old cookie -> 307 `/login?next=...`; `markAttended` and walk-in actions with the revoked cookie -> 307 `/login?next=...` | - | [X] |
| Q1 (function) | n/a | `safeNextPath` / `attendeeNextPath` / `classifyPath` run via tsx on the real source | `//evil.example`, `/\evil.example`, `/\\evil.example`, `https://evil.example`, `javascript:alert(1)`, ` //evil.example`, `/<TAB>/evil.example`: all null. `/events/new` and `/dashboard`: safeNext keeps them, `attendeeNextPath` null (class organiser). `/account/../dashboard`: attendeeNext null. `/account/registrations`(+query): kept | - | [X] |
| Q1 (route) | n/a | `/auth/callback?next=<probe>` with no code, real route | the three evil probes -> `/login?error=missing_code` (next dropped). `/events/new` -> `/login?error=missing_code&next=%2Fevents%2Fnew` (kept, org path). `/account/registrations` -> `/account/sign-in?error=missing_code&next=%2Faccount%2Fregistrations` | - | [X] |

## Findings

### BLOCKER
None.

### MAJOR

**M1. `toggleSpeakerCheckin` lets body_admin and auditor write, on a desk the page calls read-only.** [X]
- Scenario: an auditor opens `/events/<id>/checkin`. The header says "this desk is read-only for your role" and the roster hides check-in. `SpeakersCard` is rendered for every role (`RosterClient.tsx` line 262, no `canCheckIn` prop) and its button is live. The auditor presses it: `{"ok":true,...}`, a `speaker_checkins` row is written with `updated_by` = the auditor's staff id. Same through a direct call. Policies `speaker_checkins_org_member_insert/update` admit any org member, whatever the role.
- Also confirmed (known): no window check. The toggle succeeded on an event 10 days away.
- Also: a staff member of another organisation who knows a real speaker name gets an HTTP 500 (see N1/m3), not a refusal sentence.
- Proposed fix: pass `canCheckIn` into `SpeakersCard` and disable the toggle (copy: same CHECKIN_ROLE_MESSAGE); in the action, gate on `canCheckIn(staff.role)` and return `CHECKIN_ROLE_MESSAGE`; decide separately whether speakers follow the check-in window. Database policy should add the same role list (3-layer rule). Not fixed here, per brief.

**M2. Agenda order by start is enforced only by the form, not by the actions or the database.** [X]
- Scenario: `createEvent` with blocks Late 13:00, Early 09:30, Mid 11:00 stores display_order 0,1,2 in that payload order. `updateEvent` with a reversed payload stores the reversed order. The new `sortBlocksByStart` runs in the browser only. Any client that skips it (stale tab from before the deploy, an import, a second form) saves an agenda whose `display_order` does not follow time. Readers that order by `display_order` (the edit form, exports) then disagree with the public page, which showed start order in the T1 check.
- Proposed fix: sort by `start_time` (stable) inside `createEvent` and `updateEvent` before the RPC (a one-line `sort` on `blockParse.data`; `updateEvent`'s `blockIds` mapping reads back by `display_order`, so it stays correct). Or assign `display_order` inside `create_event_with_blocks` and `update_event_with_blocks`. Add one test: out-of-order payload -> rows in time order.

### MINOR

**m1. Walk-in gate uses the event window; `mark_attended` uses occurrence windows. A multi-occurrence event can strand a registered-but-unchecked walk-in with a wrong message.** [X]
- Scenario: event running now, but its occurrences (sessions) are both later. Walk-in passes the lifecycle gate, the row is inserted (source walk_in, counts against capacity), `mark_attended` returns `not_open_yet`. The desk shows "...was registered (code M5B2DZ) but not checked in. Check-in has not opened yet. It opens 60 minutes before the event starts." The event started 30 minutes earlier, so the sentence is false. Retrying the walk-in says "already registered"; Enter code repeats the false sentence.
- Note this is the intended "leave the row, give the code" behaviour; the defect is the text and the pre-check. Proposed fix: for `not_open_yet` on a multi-occurrence event say "No session is open for check-in right now" (the code already has `no_matching_occurrence` copy), and ideally run the occurrence window check before the insert.

**m2. `markAttended` does not validate `method`.** [X] A hand-built call with `"carrier-pigeon"` returns HTTP 500 (database check constraint) instead of a sentence. Not reachable from the UI. Fix: `z.enum(['qr','manual'])` and return `Invalid request.`

**m3. `toggleSpeakerCheckin` throws (HTTP 500) when another organisation's staff pass a real speaker name.** [X] Published events' agendas are publicly readable, so the speaker-name check passes, then the insert hits the `speaker_checkins` INSERT policy (42501) and is thrown. No data changes, but the action's own comments promise a structured error. Fix: treat 42501 on the insert as `{ error: 'You do not have access to this event.' }`.

**m4. `updateRegistrationContact` is an existence oracle across organisations.** [X] Org B's admin gets "You do not have access to this registration." for a real org A registration id and "Registration not found." for a made-up id. Ids are random uuids so the practical risk is low. Fix: return the same sentence for both (the walk-in and `markAttended` paths already answer other-org cases identically).

### NIT

- N1. Zod defaults leak into user-visible errors on hand-built payloads: `Invalid UUID`, `Invalid input: expected object, received null`, `block 1.start_time: Invalid input: expected string, received undefined`, and `Invalid email` (walk-in). The form prevents these; if the "plain sentences" rule covers actions, set messages on the schemas.
- N2. `updateRegistrationContact` tells body_admin and auditor "You do not have access to this registration." The registration is theirs to read; the missing thing is the edit role. Say "Your role cannot edit contact details" (the page subtitle already does).
- N3. Walk-in on an email that is already registered AND attended says "Use code entry to check them in." The person is already in. The message does not distinguish the two states.
- N4. `/account/sign-up` copy (this diff): "so that registration can be added to your Registrations." Capital R and the repeated noun read oddly; "added to your registrations" is enough.
- N5. `/checkin` picker (all staff roles) shows the same subtitle for body_admin and auditor, who cannot check anyone in; only the next page explains.
- N6. Portal pages for an incomplete practitioner answer HTTP 200 with a meta-refresh redirect (the known streamed-redirect behaviour, not new); a curl-based status check sees 200.

## Not covered / gaps

- D1 throw branch ("Use Enter code with Y to finish."): needs `markAttended` to throw after the insert (dropped connection, timeout). Not provokable from outside without breaking the shared DB or app. The non-throw failure branch (m1) was exercised instead. Covered by unit test only.
- Q1: the real `/auth/callback` code-exchange (post sign-in default landing and the "practitioner given `/events/new`" classification) cannot be driven without a valid auth code or a real magic-link mail. The classifier functions and the no-code redirect were run for real; the final landing URL after a successful exchange is [I].
- R1e: the account menu popup is client-rendered on click; only the server-rendered HTML was grepped.
- Action behaviour from a real browser form (client validation, `sortBlocksByStart` in `AgendaSection`) is out of scope (no browser tools); M2 is about what the server accepts.
- eventar_staff was not exercised at the action layer (covered at SQL level by the prior backtest).
- Concurrency (two staff on the same registration) not repeated here; the prior DB backtest covers the lock.
- CPD credit outcomes after check-in (`credit` object) returned empty lines for non-CPD events; no CPD event was used.

## Cleanup proof

Counts before (start of run) and after cleanup, same session, local DB:

| Table | Before | After |
|---|---|---|
| events | 446 | 446 |
| registrations | 915 | 915 |
| registration_checkins | 713 | 713 |
| professional_profiles | 361 | 361 |
| auth.users | 1091 | 1091 |
| staff | 255 | 255 |
| organisations | 25 | 25 |
| agenda_blocks | 3 | 3 |
| audit_events | 67686 | 67702 (+16, permanent) |

- Leftover query for my prefixes: events 0, registrations 0, staff 0, orgs 0, auth users 0, public.users 0, agenda blocks 0.
- Deleted in one transaction as superuser: email_log (4), registration_checkins (6), speaker_checkins (2), agenda_blocks (10), participation_evidence (4: created by the check-ins; its FK to registrations blocked the first attempt, which rolled back whole), registrations (11), event_occurrences (9), events (8), practitioner_licences (1), consent_records (2), professional_profiles (1), staff (5), organisations (2). The 7 auth users were deleted through the admin API (200 each).
- audit_events delta +16: 12 rows named my registration or event ids (6 `registration_contact_updated`, 4 `attendee_checked_in`, 2 `event_published`); the other 4 are not attributable to my subject ids (a browser agent was walking :3100 at the same time). Audit rows are permanent by design.
- Scratch cookies, tokens, password file, env file and ids file deleted from the scratchpad. No cookie or password was printed.
- Nothing under `ZZ-FINAL` or the existing prac01/guest1/walkin*/pre1/memberwalkin registrations was touched.
