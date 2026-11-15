# MVP acceptance walk r3: ORGANISER-ADMIN lens (2026-11-14)

Actor: `organiser_admin` of the default organisation, signed in through a Mailpit magic link, role read from the page ("Organiser Admin" plus the account email in the sidebar). Server :3100, local stack, `EVENTAR_REVIEW_MODE=false`. Tags: [X] executed this run, [R] read in code, [I] inferred. Screenshots: two inline (venue dropdown), none on disk. Fixtures: `ZZ-WALK organiser` (E1) and `ZZ-WALK capacity` (E3).

Budget note: the 130-call cap was reached. Unreached steps are listed as NOT RUN, not PASS.

## Rows

| Row | Verdict | Evidence |
|---|---|---|
| O1 sign in, land on Events | PASS [X] | Magic link lands on `/dashboard`, tab title "Events". Sidebar: Check-in, Events, History, then Admin: Settings. No Programme, no Manage. Footer shows the account email and "Organiser Admin". |
| O2 create event, Save draft | PASS [X] (Drafts-tab clause NOT RUN) | Name typed, venue picked by clicking the first of two stable rows ("Timezone follows the venue - Asia/Hong_Kong." read back), date Fri 4 Dec 2026, 09:00 to 17:00 by clicking the pickers. Save draft redirects to `/edit` with "Draft saved. Review and publish when you are ready." DB: `status=draft, created_by=<staff A>, start 2026-12-04 01:00+00, end 09:00+00, tz Asia/Hong_Kong`. I did not read the Drafts tab while E1 was still a draft. |
| O3 agenda, no silent loss | PASS [X] | Save with 3 blocks: 3 rows (keynote 3ddaa05d, lecture b4e19e21, workshop afa7fa9e), no duplicates. Reload, rename block 2, save: still 3 rows, same 3 ids (S6). Remove block 3, save: 2 rows, ids 3ddaa05d and b4e19e21 unchanged. Event end moved to 10:00 AM (before block 2): form shows "This block runs outside the event's start/end window." and Save is refused with `"ZZ Lecture two RENAMEDZZ Lecture two" (10:30 AM to 11:30 AM) must sit inside the event's time window, 09:00 AM to 10:00 AM.` No raw `agenda_block_outside_event_window` text on screen. DB after refusal: 2 blocks, event end still 09:00+00, `updated_at` unchanged. The "add a block that ends after the event end" variant was not walked separately (the same flag and refusal fired from the end-earlier case). |
| O4 publish gate | PASS [X: creator only] | Dialog "Publish this event?": "Your registration page goes live. Anyone with the link can register." / "Registration opens now." / "Check-in opens at 04 Dec 2026, 08:00 (Asia/Hong_Kong), 60 minutes before the start." / "Details cannot be edited after publishing yet, so check them first." Keep editing: DB still `draft`, `published_at` null, `updated_at` unchanged. Publish: DB `published`, `published_at 2026-11-14 13:33:23+00`, 2 blocks kept, 1 occurrence; lands on `/details`. Walked as the creator only. The non-creator colleague publish was NOT RUN (call cap). The colleague auth user and staff row were created and deleted unused. |
| O5 one Events home | NOT RUN (partial [X]) | After E1 ended: Active tab listed `ZZ-WALK capacity` (live) and not E1; History lists E1 with link to `/events/<E1>/analytics`. Tab counts read as "Active 26, Drafts 4" and were not matched to the DB; the Drafts tab content was not read. |
| O6 Registrations vs Check-in | PASS [X] | Check-in page: "Live capture only: scan, enter a code or add a walk-in. To edit a person's details or roles, open Registrations." Registrations page (`/registrations`): "Everyone registered for this event. Edit contact details and roles here. To check people in, open Check-in." Tabs All (3) / Registered (2) / Attended (1) / Cancelled (0) match the DB. |
| O7 time-gated check-in, 3 states | PASS [X] with F1 (MINOR) and gaps | See "O7 detail". |
| O8 staff-side walk-in | PASS [X] | UI: "Registered & checked in ZZ Walk Inside." Row: `source=walk_in, user_id NULL, profile_snapshot NULL, status attended, check_in_method manual`. `registration_checkins` 1 row for it. The staff row ids and auth uids (A and B) appear in no column of the registrations row or the check-in row (regex over `to_jsonb(row)::text`). |
| O9 post-event path, CSV | NOT RUN (2-click path PASS [X]) | History row link goes straight to `/events/<E1>/analytics` (click 1), then "Export CSV" (click 2). That CSV is the funnel summary (`Section,Item,Count,Percent` / `Funnel,Registered,3,` / `Funnel,Attended,1,` / `Funnel,Responded,0,`), not the registrants list. I did not find or export the registrants CSV, so the S7 check on the `=HYPERLINK("http://x","y")` fixture (registrant R2, present and shown on the Registrations page) is NOT RUN against a real export. `lib/csv.test.ts` passes (31 tests) [X: unit only]. The "Export attendance evidence (CSV)" click captured a base64 data URI that I did not decode. |
| S8 staff walk-in on a full event | PASS [X] | E3 published, `max_attendees=1`, 1 registration, window open. Walk-in submit shows "This event is at capacity." Registrations for E3 stayed at 1. |

### O7 detail (E1, moved with SQL; the S5 trigger blocks a plain event-time update when blocks exist, so blocks were deleted and re-inserted shifted)

| State | Page copy and controls | Writes |
|---|---|---|
| BEFORE (start +5h) [X] | "NOT OPEN YET", "Check-in has not opened yet. It opens 60 minutes before the event starts." Scan badge, Enter code, both speaker "Check in", roster "Check in" all disabled with `aria-describedby=checkin-closed-note`. `+ Walk-in` stays enabled; its panel repeats the closed copy; typed name and email, Return: nothing written. | registrations stayed 2, `registration_checkins` 0, `speaker_checkins` 0 |
| INSIDE (start +30m) [X] | "LIVE", "Check-in is open.", every control enabled. Walk-in: "Registered & checked in ZZ Walk Inside." | `registration_checkins` 1 |
| AFTER (start -5h, end -1h) [X] | "CLOSED", "Ended 2h ago", "Check-in is closed. This event has ended." Scan, Enter code, speaker and roster controls disabled with the closed note linked. | unchanged |
| Stale page, window moved to AFTER [X] | Speaker "Check in" clicked on the page still showing OPEN: server refusal "Check-in is closed. This event has ended." | `speaker_checkins` 0 |

Writers into `registration_checkins` and `speaker_checkins` [R, grep plus `pg_proc` scan]: (1) `markAttended` Server Action, then RPC `mark_attended`; (2) `walkInRegisterAndCheckIn`, which inserts the registration then calls `markAttended`; (3) `selfCheckIn` (public `/checkin/confirm`), then RPC `self_check_in`; (4) `toggleSpeakerCheckin`, direct table write. `pg_proc` confirms only `mark_attended` and `self_check_in` insert into the two tables.

BEFORE-state attempts at DB level [X: psql, simulated authenticated JWT for the organiser, each rolled back]:
- `mark_attended('ZWALK001','manual',null)` returned `not_open_yet`; no row.
- `self_check_in('ZWALK001','127.0.0.1')` returned `self_serve_off`; no row. The self-serve window gate itself is untested (self-serve is off by default) [R only].
- Direct `insert into speaker_checkins` as an authenticated org member SUCCEEDED (1 row inside the transaction, then rolled back). See F1.

## Findings

No BLOCKER. No MAJOR.

- **F1 MINOR (needs Ivan's ruling): the speaker check-in window gate is app-layer only.** A direct INSERT into `speaker_checkins` by any authenticated member of the organisation succeeds before the window opens (31 days early on 2026-11-03; now 5 hours early). The Server Action refuses correctly ("Check-in is closed. This event has ended.") and the UI disables the control, so the walked paths are safe. The code comment in `speakerActions.ts` already says the gate is app-layer. A DB-level window check would close it. Not a regression of this phase.
- **F2 NIT: `+ Walk-in` is the only desk control that stays enabled in BEFORE and AFTER.** It opens a panel with the closed copy and writes nothing (BEFORE proven; AFTER panel not read). Consistent with the disabled siblings only after the user clicks.
- **F3 NOTE (tooling, not product): `scripts/walk-window.sh` fails on any event that has agenda blocks.** The S5 trigger raises `agenda_block_outside_event_window: block <id> runs outside its event's start/end window` on the plain `update events` and rolls the helper back. This is the DB guard working. The helper needs the delete and re-insert shape used here.
- **F4 NOTE (fixture artefact, not product):** the roster "Check in" click on the stale page returned "Invalid code format." because my fixture code `ZWALK002` does not match the app's 6-character code format. The desk-path server refusal after the window moved to AFTER is therefore not proven in the UI; the DB RPC refusal was proven in the BEFORE state only.
- **F5 NOTE: the History-to-event "Export CSV" is the funnel summary, not the registrants list.** If the 2-click requirement means registrants, the registrants export is not reachable from that page.
- **F6 NOTE: a walk-in check-in writes a `participation_evidence` row** that blocks deleting the registration (FK `participation_evidence_registration_id_fkey`). Cleanup needs it deleted first. Expected by design; recorded for the cleanup recipe.
- **F7 NOTE: first admin-API delete of auth user A returned 500, the retry returned 200** after the staff, event and registration rows were gone. Cause not diagnosed.

## Not run (gaps)

O4 non-creator colleague publish; O2 Drafts-tab membership while draft; O5 Drafts tab content and counts against the DB; O9 registrants CSV file and S7 on a real export; O7 roster/Enter-code write in the INSIDE state and the AFTER desk-path refusal in the UI; O3 add-block-ending-after-event-end as its own step.

## Cleanup and residue

Deleted in order: `participation_evidence`, `speaker_checkins` (0), `registration_checkins`, `email_log`, `registrations`, `event_occurrences`, `agenda_blocks`, `events`, `staff`, then the two auth users through the admin API. Leftover count, stderr visible: `events=0 staff=0 regs=0 auth=0 occ=0 agenda=0 public.users_for_my_ids=0 evidence=0`. The local redirect server on :8765 was killed (no listener) and the scratch link and env files removed. Expected residue: `audit_events` rows (sign-in, publish, walk-in). Ids created: events `1e9b3dcc-8f2a-4cc8-9407-fa6c29d18011` (E1) and `0035d3a9-3954-433e-ad65-0ae544ee9147` (E3); agenda blocks `3ddaa05d-6b99-4676-a8f6-367d058c15b6`, `b4e19e21-9cf2-46d5-9c09-8e1c92ad773a`, `afa7fa9e-5551-4fe9-af90-412f615aed69`; staff `b83c0f0a-c820-4de6-97a5-f5e5e64b723b`, `66fed2ea-ccbc-4417-ba34-1b1045c2eaa6`; auth users `e374a8eb-d890-4595-8a46-2928e1652e0e`, `8a4110f5-0c95-42e2-ba0d-e4bed798422a`; registrations `bd6ccea6-37cd-46a7-9f3c-0bde90e16707`, `964a3bcb-1641-49f9-bfd9-f47817e31a6b`, `97e6aad6-f27e-49f6-8ab5-9e44a5f7fd3a`, `5f341f68-1bf1-4781-bb0b-82dd4d3d32a4`. The browser pane still holds the (now invalid) session cookie of the deleted organiser A.
