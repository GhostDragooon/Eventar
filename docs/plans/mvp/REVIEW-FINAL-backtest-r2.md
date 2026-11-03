# REVIEW-FINAL backtest R2 (write paths exercised by the MVP walks)

Date 2026-11-03. Local stack only: psql `127.0.0.1:54322`, app `:3100`. No browser, no Seoul, no Supabase/Vercel MCP, no source edits, no git writes.
Method: ZZ-BT fixtures (3 staff + 1 practitioner auth users, 6 events, 9 registrations). Two call styles:
- **HTTP**: real Server Action POSTed to :3100 with a real signed-in session cookie (`Next-Action` header), state read back with psql.
- **SQL-as-identity**: `set local role authenticated` + `request.jwt.claims` (sub, role, email; `require_active_staff` matches on the JWT email) calling the same RPC the action calls. This bypasses the action's own pre-gates (Zod, `canCheckIn`, rate limit, credit award), so those parts are marked "action code read only".

Summary: **0 BLOCKER, 0 MAJOR, 4 MINOR, 4 NIT.** Every write path asserted below behaved as designed; the findings are gaps and open decisions, not broken writes.

## Path table

| # | Path | Expected | Observed | PASS/FAIL |
|---|------|----------|----------|-----------|
| 1a | mark_attended, event starts +5h (SQL as bt-admin) | refused `not_open_yet`, zero rows | `not_open_yet`; checkins/evidence/audit all 0, status `registered`, check_in_at null | PASS |
| 1b | mark_attended, event ended 2h ago | refused `closed`, zero rows | `closed`; counts still 0/0/0 | PASS |
| 1c | mark_attended inside window as body_admin | 42501 | `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}` (action maps this to the role message, code read) | PASS |
| 1d | mark_attended inside window, bt-admin | `ok`, one row each | `ok`; checkins 1, participation_evidence 1, audit `attendee_checked_in` 1, status `attended` | PASS |
| 1e | same code again | `already`, still one row | `already`; counts still 1/1/1 | PASS |
| 1g | mark_attended, staff of another org | `not_recognised` | `not_recognised` | PASS |
| 2a | walkIn before window (HTTP, bt-admin, E1) | refused, no registration | `Check-in has not opened yet. It opens 60 minutes before the event starts.`; registrations on ZZ events 4 -> 4 | PASS |
| 2b | walkIn after end (E2) | refused, no registration | `Check-in is closed. This event has ended.`; still 4 | PASS |
| 2c | walkIn as body_admin | refused before insert | `Your role cannot check people in. Ask an organiser admin or member.`; still 4 | PASS |
| 2d | walkIn inside window (E3) | source walk_in, user_id NULL | `J5S34K|walk_in|user_id null=t|attended|check_in_at set` | PASS |
| 2e | walkIn same email twice | refused, no dup | `This email is already registered. Use code entry to check them in.`; total 5 (only the one new row) | PASS |
| 3a | toggleSpeakerCheckin before window (E1 starts +5h) | writes (no window rule) | WRITES: `checked_in_at 2026-11-03 01:45:53.339+00`, `updated_by` = bt-admin id | PASS (as predicted) |
| 3b | toggleSpeakerCheckin after end (E2 ended -2h) | writes | WRITES: `checked_in_at 2026-11-03 01:45:53.604+00`, `updated_by` = bt-admin id | PASS (as predicted) |
| 3c | toggleSpeakerCheckin as body_admin | refused | `Your role cannot check people in...` (nothing written) | PASS |
| 4a | registerForEvent, staff session, own email | user_id NULL, no profile | `bt-admin@... user_id NULL, source self_registration, profile_snapshot null`; professional_profiles for staff UUID 0 | PASS |
| 4b | same, body_admin session | user_id NULL | NULL | PASS |
| 4c | practitioner session, own email | user_id = that user | `user_id c3c765ab-...` (= the practitioner) | PASS |
| 4d | practitioner session, other email | user_id NULL | NULL | PASS |
| 5.1 | agenda save, 3 new blocks | exactly 3 rows, ordered | A,B,C display_order 0,1,2 | PASS |
| 5.2 | save with B left out, A and C by id | 2 rows, ids stable | A|0, C|1, `id_stable=t`, count 2 | PASS |
| 5.3 | payload with end<start block, edits event title + A title, drops C | refused, nothing written | `violates check constraint "agenda_blocks_check"`; event title unchanged (`ZZ-BT draft`), A and C present with original ids/titles | PASS |
| 5.4 | payload names unknown block id | refused, nothing written | `block 1111... is not part of event`; row count unchanged (2) | PASS |
| 5.5 | block starting 1 day before the event, DB RPC | refused (envelope) | **ACCEPTED**: block `A-outside` saved with start before event start | FAIL (DB layer; see MINOR-1) |
| 5.6 | updateEvent HTTP: block outside window | refused, nothing written | `Block "A-OUT" runs outside the event's start/end window`; title and both blocks unchanged | PASS |
| 5.7 | updateEvent HTTP: block end before start | refused, nothing written | `block 0.end_time: Block end must be after start`; unchanged | PASS |
| 5.8 | updateEvent HTTP: valid, keep A by id, drop C, add D | A id stable, C gone, D new | `ZZ-BT EDIT3`, `A (orig-id) | D (new-id)` | PASS |
| 5.9 | updateEvent HTTP: identical re-save with ids | no churn | rows 2, both ids kept | PASS |
| 5.10 | createEvent HTTP: out-of-window block | refused, no event | `Block "X" runs outside the event's start/end window`; no `ZZ-BT create1` event row | PASS |
| 5.11 | createEvent HTTP valid | draft + block + occurrence | `draft`, created_by = caller, 1 block, 1 occurrence | PASS |
| 5.12 | agenda change on published event (direct DELETE and RPC, authenticated) | refused | `event_not_draft: the agenda of event ... cannot be changed while it is published` / `...details cannot be edited yet`; block count still 1 | PASS |
| 6a | publishEvent as body_admin | refused with reason, status unchanged | `Your role can't publish events. Ask an organiser admin to publish this draft.`; status `draft`, audit 0 | PASS |
| 6b | publishEvent as organiser_member, non-creator | brief expected refusal | **SUCCEEDED**: `{"ok":true}`, `published`, `published_at` set, 1 `event_published` audit | see MINOR-3 |
| 6c | two concurrent publishEvent, organiser_admin | one state change | both `{"ok":true}`; status published once, `event_published` audit count = 1 | PASS |
| 6d | third sequential publish | idempotent | `{"ok":true}`; audit count still 1 | PASS |
| 7a | contact edit, organiser_member non-creator, unlinked, name+email | allowed + audit | applied (`ZZ F1 renamed|f1b@...`); audit `registration_contact_updated`, payload `fields:[full_name,email]` + `email_before_sha256`/`email_after_sha256` only, no raw email | PASS |
| 7b | email change on attended registration | refused | `email_locked_attended: ...` (DETAIL `email_locked_attended`) | PASS |
| 7c | name-only change on attended registration | allowed | applied (`ZZ L1 renamed`); audit row not counted (not run) | PASS |
| 7d | email change on account-linked registration | refused | `linked_registration: ...` | PASS |
| 7e | contact edit as body_admin / as other-org admin | refused | 42501 `require_active_staff...` / `registration ... is not in your organisation` | PASS |
| 7f | set role as non-creator member | refused | `not the owner of the event behind registration` DETAIL `not_owner` | PASS |
| 7g | set role as creator, twice | one row, one audit | role_rows 1, `registration_role_set` audits 1 | PASS |
| 7h | set role after attendance | 22023 `role_locked_attended` | `has attended, so its credit is already posted` DETAIL `role_locked_attended`; role rows for attended reg 0 | PASS |
| 7i | set role with invalid code `ceo` | refused | `violates check constraint "registration_roles_role_code_check"` (raw DB error; action-level Zod not exercised) | PASS (see NIT-3) |

## Findings, ranked

### BLOCKER
None.

### MAJOR
None.

### MINOR

**MINOR-1. Agenda envelope rule lives only in the app layer, not the DB (executed, 5.5 vs 5.6/5.10).**
`update_event_with_blocks` accepts a block that starts before the event does. Query: authenticated bt-admin, `select update_event_with_blocks(E4, <event>, [{id: A, start_time: event_start - 1 day, end_time: event_start - 23h, ...}])` committed; readback `A-outside | before_event_start = t`. The `updateEvent` and `createEvent` actions refuse the same payload (5.6, 5.10), so the walks are safe, but a staff client calling the RPC directly skips the rule. Hard rule 8 says form -> Zod -> DB constraint. Impact is data quality on the caller's own draft, not integrity or cross-org. Only `end_time > start_time` is a DB check (`agenda_blocks_check`). The atomicity guarantee does hold: a failing payload rolled back the event row and every block (5.3).

**MINOR-2. Speaker check-in has no window rule (executed, 3a/3b). Known open product decision, recorded as asked.**
Exact rows after the two toggles (E1 starts +5h, E2 ended -2h): `speaker_checkins` row for E1 `checked_in_at 2026-11-03 01:45:53.339+00, updated_by 26a54ae9...(bt-admin)`; row for E2 `checked_in_at 2026-11-03 01:45:53.604+00, same updated_by`. Both wrote with no refusal. I did not count audit rows for speaker toggles (not run), and `has_table_privilege` shows `authenticated` and `service_role` hold full DML on `speaker_checkins` (RLS-gated, not on the Rule 11 revoke list), so the toggle may leave no hash-chained trail. Confirm that is intended before the walk treats speaker check-in as evidence.

**MINOR-3. Brief vs code on who may publish (executed, 6a/6b).**
The brief expected organiser_member to be refused. Actual: `canPublishEvents` is true for organiser_admin, organiser_member and eventar_staff, and a non-creator organiser_member published E5 (`{"ok":true}`, 1 audit). Only body_admin (and auditor, by the same helper) is refused, with a clear sentence and status unchanged. The code and the DB function (`publish_event` roles list) agree with each other, so this is a spec question, not a bug. Related stale text: `app/events/[id]/edit/actions.ts:25` says the owner-exclusive check happens in the function; the live function is organisation-scoped (confirmed by the member publish).

**MINOR-4. `participation_evidence` keeps DELETE for service_role (privilege query only, no write attempted).**
`has_table_privilege('service_role','public.participation_evidence','delete') = t` (insert and update are revoked). `audit_events`, `credit_ledger`, `registration_checkins` and `registration_roles` revoke all three for authenticated, anon and service_role. If evidence is meant to be permanent like the ledger, the retained DELETE is the gap; if it exists for erasure (like `practitioner_licences`), no action. Confirm intent and add the table to the audited-writes matrix either way.

### NIT

- **NIT-1.** `email_log` rows from `registerForEvent` stay `queued` when `RESEND_API_KEY` is unset (4 of 4 ZZ registrations). The code comment calls it deliberate ("no Phase 9 sweep planned"); worth one line in the Stage 8 deploy checklist so ops do not read it as a stuck queue. Local table totals: skipped 12, failed 8, queued 23 (mixed with other fixtures).
- **NIT-2.** A save that omits block ids recreates every block with fresh ids (5.9 with ids: stable; resend without ids: `kept_ids 0`). The form sends ids, so the walk is fine. A client that drops ids would lose any survey-answer links; the RPC's `block_has_survey_answers` guard then refuses the save rather than losing them silently.
- **NIT-3.** `set_registration_role` with an invalid code reaches the DB check and fails as a raw `23514`. I read the action path only; I did not post an invalid code through the HTTP action, so I cannot say whether the user sees a clean message.
- **NIT-4.** `createEvent` as body_admin saved a draft (created_by = body_admin id, 1 occurrence). This matches the in-code copy ("Save a draft, then ask an organiser admin to publish it"), but that role then holds a draft it cannot publish. Confirm it is intended.

## Hard rule 11 / RLS observations
- `has_table_privilege` matrix (anon / authenticated / service_role, insert/update/delete): `audit_events`, `credit_ledger`, `registration_checkins`, `registration_roles` all `f`. `participation_evidence` `service_role` delete `t` (MINOR-4). `speaker_checkins` authenticated and service_role all `t` (RLS-gated).
- A direct `DELETE` on `agenda_blocks` of a published event as `authenticated` is refused by the `agenda_blocks_draft_only_writes` trigger (5.12).
- `audit_events` stays append-only: teardown did not touch it; 9 residue rows remain by actor id.

## Not run
- `markAttended` through HTTP: the SQL function was called directly, so the action's credit award (`awardAttendanceCredit`), its message mapping and its rate limit were read, not executed. The walk-in path did run the real action and `markAttended` inside it (2d).
- Audit-row count for the name-only contact edit on an attended registration (7c) and for speaker toggles.
- `setRegistrationRole` and `updateRegistrationContact` through HTTP (the RPCs ran under real JWT identities; the actions' Zod and `requireStaff` layers were read only).
- Real concurrency interleaving for double publish: two parallel curls, both succeeded, one audit row. `publish_event` takes a row lock, but I did not force overlap.
- Public registration capacity, duplicate email and email-send paths; `self_check_in`; the credit award itself.

## Teardown proof
After the final teardown transaction (committed), `ZZ-BT` counts:

| table | rows left |
|---|---|
| events (`title like 'ZZ-BT%'`) | 0 |
| registrations (zz-bt.invalid email or `BT%` code) | 0 |
| registrations on `b7000000-*` events | 0 |
| agenda_blocks | 0 |
| speaker_checkins | 0 |
| participation_evidence | 0 |
| orphan registration_checkins | 0 |
| staff (zz-bt.invalid) | 0 |
| auth.users (zz-bt.invalid) | 0 |
| public.users for the four ids | 0 |
| email_log (zz-bt.invalid) | 0 |
| professional_profiles for staff and practitioner ids | 0 |

Residue: `audit_events` 9 rows (append-only, expected). The first teardown attempt rolled back cleanly (a wrong column name in `public.users`); the second committed. Session cookies and the env file in the scratchpad were deleted. The existing fixture event `960f8842-...` and the ux-*, prac02 and final.invalid accounts were not touched.

Tool calls used: about 39 of 40 (including this write and the hand-back).
