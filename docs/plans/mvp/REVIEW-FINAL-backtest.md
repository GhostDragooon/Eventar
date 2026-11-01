# REVIEW-FINAL: backtest lens

- Date: 2026-11-01. HEAD: `4ca0bbe`. Lens: BACKTEST (real local stack, real running app on :3100 review-mode OFF, real auth, rows read back).
- Scope: write paths added or changed in `git diff 00e2b07..HEAD -- app lib supabase/migrations` (9 migrations, 15 action/route files).
- Tool calls: 53 of 110 (stop line 96). Status: COMPLETE for the priority list, with gaps listed at the end.
- Evidence tags: [X] executed, [R] read in code, [I] inferred.
- Method: disposable orgs `ZZ-BT org A/B`, 7 disposable staff and practitioner users at `zz-bt-*@final.invalid`, 14 `ZZ-BT` events. Sessions minted with `@supabase/ssr` `signInWithPassword`. Server Actions driven by `curl`-equivalent `fetch` with the `Next-Action` header; RPC and table probes by PostgREST with the user JWT; read-back by local `psql :54322`. Never Seoul, never `.env.local`, no MCP, no browser.
- Reading note: a successful Server Action answers with an RSC re-render, not a value. "OK" below means the DB read-back changed as expected. "ERR" is the action's own returned error. Where the HTTP status was 500 or 307 I say so.

## 1. Write-path table

Auth layers: P = `proxy.ts` gate, A = `requireStaff` or session check in the action, D = database (RPC role list, RLS, grants, triggers).

| Path | Surface | Actors tried | States tried | Result (exact) | Read-back | Tag |
|---|---|---|---|---|---|---|
| `createEvent` -> `create_event_with_blocks` (+ `publish_event`, `set_event_cpd_config`) | `/events/new`, A+D | signed out, practitioner, memberA, bodyA, adminA | draft, published, status `cancelled`, cpd body without hours, bad dates, title 201, lat 91, block outside envelope, bad kind | signed out 307 `/login?next=`; practitioner 307 `/login?error=not_organiser`; member draft OK; member publish OK (`canPublishEvents` includes members); bodyA draft OK (see F1); validation errors returned with exact zod text | rows in `events` (org A, `created_by` = actor staff id), blocks 2 for E1, `event_published` audit for the member publish only | [X] |
| `createEvent` with `cpd` | same | adminA (body not authorised), memberA | published + cpd | adminA: event saved AND published, error "The event was published, but your organisation isn't authorised by that accrediting body" (partial success is stated); memberA: "Your role can't set accreditation. Nothing was saved", 0 rows | `events` count confirms 1 / 0 | [X] |
| `updateEvent` -> `update_event_with_blocks` | `/events/[id]/edit`, A+D | signed out, practitioner, adminB (other org), memberA (not creator), bodyA, adminA2 | draft, published; bad uuid, unknown uuid, blocks not array, foreign block id, description 4001 | signed out/practitioner 307; adminB "You do not have access to this event."; bad uuid "Invalid event id."; unknown "Event not found."; published "This event is no longer a draft..."; foreign block id "The agenda changed in another tab or window..." with 0 change; memberA, bodyA, adminA2 all saved (any org staff may edit a draft) | save x2 with ids: 2 blocks, same ids; id-less save x2: 2 blocks, old ids replaced (no duplicates); 3 concurrent id-less saves: 2 blocks `[A,B]`; no `audit_events` rows for create or update of a draft | [X] |
| `update_event_with_blocks` direct | PostgREST RPC, D | adminA JWT | published event | 400 `22023 event_not_draft: ... cannot be edited yet` | state unchanged | [X] |
| `events` direct writes | PostgREST, D | adminA, adminB JWT | published | PATCH title/max_attendees: 400 `22023 event_not_draft`; PATCH status / deleted_at / organisation_id: 403 `42501 permission denied for table events`; DELETE: 403 `42501`; INSERT: 403 `42501`; adminB PATCH registration_close_at: 200 `[]` (RLS filtered, 0 rows) | event row unchanged | [X] |
| `agenda_blocks` direct | PostgREST, D | adminA JWT | published, draft | published PATCH/DELETE: 400 `22023 event_not_draft`; draft INSERT: 201 (allowed, no envelope check) | row inserted on draft | [X] |
| `publishEvent` -> `publish_event` | `/events/[id]/edit`, A+D | signed out, practitioner, bodyA, adminB, adminA; JWT with `p_actor_override` | draft, already published, cancelled draft, bad uuid | bodyA "Your role can't publish events..." (state still draft); adminB "Cannot publish: event not found or not in your organisation."; prac JWT with override: 403 `42501 require_active_staff`; adminB JWT with override: 403 `42501 ... not in caller's organisation`; adminA OK; second publish returns OK, 1 audit row only; cancelled draft: "can't be published because it is no longer a current draft"; bad uuid: HTTP 500 (see F11) | `status=published`, `published_at` set, `event_published role=organiser_admin org=A keys=attestation_status` | [X] |
| `updateRegistrationClose` | `/events/[id]/details`, A+D(RLS) | signed out, adminB, bodyA, adminA | in range, after start, junk, null | adminB "Update failed — event not found or not owned by you." (value unchanged); after start "Registration close must be before event start."; junk "Invalid registration close timestamp."; **bodyA changed the value** (F1); null clears | `registration_close_at` read back each time; no audit | [X] |
| `cancelEvents` / `softDeleteEvents` / `restoreEvents` -> `bulk_update_event_status` | `/dashboard`, A+D | signed out, practitioner, adminB, bodyA, memberA, adminA | draft, published with attended registrations, already cancelled, deleted | adminB: success shape with 0 rows changed (F9); **bodyA cancelled an event** (audit `event_cancelled role=body_admin`); non-uuid list "Could not update the selected events."; empty list OK; cancel twice: 1 audit row; restore of a cancelled event clears `deleted_at` only, status stays `cancelled` (F10) | `status`/`deleted_at` and audit rows (`event_cancelled`, `event_soft_deleted`, `event_restored`, payload `previous_status`, `previous_deleted_at`) | [X] |
| `registerForEvent` | `/events/[id]`, public | anon, prac1 (own email), prac2 (other email), adminA staff (own email) | published, draft, cancelled, past, inside check-in window, capacity | guest row `user_id=null`; prac1 `user_id=prac1`; prac2 with other email `user_id=null`; **staff own email `user_id=null` and 0 `professional_profiles` rows under the staff UUID**; duplicate and case-variant duplicate "That email is already registered..."; bad email "Invalid email"; name 101 "Name too long"; bad uuid "Invalid UUID"; draft/cancelled "Registrations are not open"; past "This event has already ended."; window "Registration for this event has closed."; capacity race F5 | `registrations` rows read back | [X] |
| `registrations` direct | PostgREST, D | prac1, adminA, anon JWT | any | INSERT 403/401 `42501`; PATCH full_name/status/user_id 403 `42501`; DELETE 403 `42501`; INSERT `registration_roles` 403 `42501` | rows unchanged | [X] |
| `updateRegistrationContact` -> `update_registration_contact` | `/events/[id]/registrations`, A+D | signed out, practitioner, adminB, bodyA, adminA, memberA (not creator); prac JWT with override | unlinked, linked, attended+unlinked, attended+linked, cancelled, past event | adminB and bodyA: "You do not have access to this registration."; linked + email: "This registration belongs to an Eventar account, so its email cannot be changed here."; linked + name: OK; duplicate email "Another registration for this event already uses that email."; bad email/blank name/name 201: exact messages; unknown id "Registration not found."; no-op save: no audit row; prac JWT with override: 403 `42501 require_active_staff`; anon: 401 `42501 permission denied for function`; `a b@c.d`: 400 `22023 invalid_email`; attended unlinked + email: OK (CLAIM-B); cancelled and past-event rows: OK | audit `registration_contact_updated payload={"fields":["email"]}` (names only); actor_role correct for admin and member | [X] |
| `setRegistrationRole` / `removeRegistrationRole` | `/events/[id]/registrations`, A+D | adminA (creator), adminA2, memberA, adminB, bodyA, practitioner; JWT with override | unattended, attended, duplicate, absent role, bad role | creator OK + 1 audit; duplicate set: no second row or audit; non-creator admin/member/adminB: "Only the person who created this event, or Eventar staff, can make this change." (42501 `not_owner`); bodyA "This account can't make this change."; practitioner 307; bad role via action "Invalid request."; bad role via RPC 23514; adminA2 JWT with creator's override: 403 `not_owner` (override inert); **attended: 22023 `role_locked_attended` for set and remove, creator included** | `registration_roles`, `registration_role_set` / `registration_role_removed` audit (payload `role_code`); remove of an absent role: no audit | [X] |
| `markAttended` -> `mark_attended` | `/events/[id]/checkin`, A+D | signed out, practitioner, adminB, bodyA, adminA, memberA; prac JWT with override | before window (3h), inside (30 min before start, and live), after end, cancelled registration, repeat, lowercase code, bad format | adminB "Code not recognised."; **bodyA HTTP 500 (`42501` thrown)**; before "Check-in has not opened yet. It opens 60 minutes before the event starts."; after end "Check-in is closed. This event has ended."; cancelled "This registration was cancelled — it can't be checked in. Re-register the attendee first."; repeat "Already attended."; lowercase/short "Invalid code format."; cancelled event "This event isn't accepting check-ins"; prac JWT: 403 `42501` | `registrations` status/method, `registration_checkins` 1, `participation_evidence` 1 (`check_in/manual_entry`, actor set), audit `attendee_checked_in payload={via,method,event_id}` | [X] |
| `walkInRegisterAndCheckIn` | `/events/[id]/checkin`, A+D | signed out, adminB, bodyA, adminA, memberA | live, ended, before window, cancelled event, duplicate email, cancelled registrant's email, name 101, bad email | adminB "You do not have access to this event." and **0 rows**; adminA with own staff email: row `source=walk_in user_id=null`, 0 profile rows; duplicate "This email is already registered. Use code entry to check them in."; ended/before/cancelled event: exact lifecycle messages, 0 rows; **bodyA: HTTP 500 and a `registered` walk_in row was left behind** (F2) | rows by email | [X] |
| `selfCheckIn` -> `self_check_in` | `/checkin/confirm`, public (service role) | anon, prac1 JWT | self_serve off then on (fixture), valid, repeat, cancelled, ended, before window | RPC direct anon 401 and prac JWT 403 `42501 permission denied for function`; action: off "Self check-in isn't enabled for this event"; on OK `method=qr`; repeat "You're already checked in."; cancelled "This registration was cancelled."; ended "Check-in for this event has closed."; before "Check-in isn't open yet."; unknown code "This registration is no longer valid." | status, checkins 1, evidence 1 | [X] |
| `toggleSpeakerCheckin` (+ direct `speaker_checkins`) | `/events/[id]/checkin`, A+D(RLS) | signed out, practitioner, adminB, bodyA, adminA2, memberA, adminA | live, ended, 3h before start, cancelled event, non-agenda name, name 5000 chars, bad uuid | no window or lifecycle check: ended, before-window and cancelled all stamped; bodyA, adminA2, memberA can; adminB HTTP 500 (`42501`, row not written); non-agenda "That name is not a speaker on this event's agenda."; name 5000 and bad uuid "Invalid speaker check-in request."; direct PostgREST insert by bodyA with free-text name `Anyone At All` on an ended event: 201 with `updated_by=null` | `speaker_checkins` rows; 0 audit rows; only the check-in page reads this table | [X] |
| `setEventCpdConfig` -> `set_event_cpd_config` (RPC level) | RPC, D | memberA, bodyA, adminB, adminA | unauthorised body, authorised body (fixture row, removed), hours 0 / 25 / -1, after attendance | memberA and bodyA: 403 `42501 require_active_staff ... {organiser_admin,eventar_staff}`; adminB: 403 `not_in_org`; unauthorised body: 403 `not_authorised_for_body`; hours 0/25/-1: 400 `23514`; adminA authorised: OK; **adminA changed hours on an event with 7 attended registrations: OK** (F7) | `cpd_hours`, audit `event_cpd_config_set {accrediting_body_id, cpd_hours}` | [X] (action itself is a FormData form action, not driven; RPC driven) |
| `add_event_accreditation_group` (RPC) | RPC, D | memberA, bodyA, adminB, adminA | no valid category | memberA, bodyA: 403 `require_active_staff`; adminB 403 `not_owner`; adminA 400 `23514` (my category code was not valid: role gate shown, happy path not reached) | none | [X] partial |
| other multi-body RPCs (`remove_event_accreditation_group`, `add/remove_event_accreditation_row`, `link/unlink_accreditation_occurrence`) | `multiBodyActions.ts` | - | - | not executed | - | [R] |
| `exportRegistrantsCsv`, `exportAttendanceEvidence`, `exportCollegePackage`, `exportEventEvidence` | `/events/[id]/edit` and `/details`, A+D | adminA, adminB, bodyA, practitioner | live event, cross-org | adminB: "Event not found." / "Not authorised to export this event."; practitioner 307; adminA CSV "Registration is not closed yet."; attendance evidence export returned a base64 CSV; college and evidence exports "No credit has been posted for this event yet"; 0 audit rows from exports | none | [X] negatives, happy path partial |
| `sendReminderForEvent`, `sendSurveyInviteForEvent` | `/events/[id]/details`, A+D | signed out, practitioner, adminB, bodyA, adminA | live event | adminB "You are not authorized for this event."; practitioner and signed out 307; **bodyA OK**; adminA repeat send reports `stalled` (visible) | `email_log` rows `queued x7, skipped x3`, none `sent` (F12) | [X] |
| `createInviteLink` -> `create_invite_token` | `/settings/team`, A+D | memberA, bodyA, practitioner, adminA | roles `eventar_staff`, `body_admin` | memberA and bodyA "Only admins can create invite links."; practitioner 307; invalid roles "Invalid role."; adminA OK, `expires_in_h=168`, stored value is a hash, token 32 chars | `invite_tokens` row | [X] |
| `acceptInvite` -> `accept_invite_token` | `/invite/[token]`, A+D | signed out, prac3, adminB (existing staff of org B), prac2 | bogus token, no confirm, reuse | bogus "This invite link isn't valid..."; signed out "You must be logged in to accept an invite."; prac3 accepted with `options=null` (no practitioner data so no prompt): staff row `organiser_member` org A; reuse by adminB/prac2 "This invite link has already been used."; **adminB accepted a fresh org-A invite with no prompt and now holds two staff rows** (F6) | `staff` rows, audit `invite_accepted {invite_id, invited_role}` | [X] |
| `claimMyRegistrations` -> `claim_registrations_for_user` | `/account`, A+D | prac2, prac1 repeat, staff, signed out, anon RPC | linked-later registration | prac2 claimed 1 (CLAIM-B); repeat claim: 0; staff and signed out "not_authorized"; anon RPC 401 `42501` | `user_id` set; audit `registration_claimed role=self payload={email,user_id,previous_user_id}` | [X] |
| `acceptRequiredConsents` -> `grant_consent` | `/account/complete` | prac2, signed out | - | OK writes `tos-0.1-draft` and `pp-0.2-draft`; signed out "not_authorized"; `grant_consent` RPC writes 1 audit row `consent_granted {consent_type, version}` | consent rows, audit | [X] |
| `consent_records` direct writes | PostgREST, D | prac2 JWT | - | CLAIM-A below | rows changed, 0 audit | [X] |
| `updateMyAccount`, `updateMyProfessionalProfile`, `declareMyLicence`, `addMyAppointment` | `/account` | signed out, adminA (staff), prac1 | valid, oversize, duplicate | signed out and staff "not_authorized"; profile save OK (1 profile row); licence declare OK, duplicate "already_declared", bad body uuid and 121-char number "invalid_input"; `updateMyAccount` and `addMyAppointment` returned `invalid_input` for my payload shape, so their happy path is NOT proven | `professional_profiles`, `practitioner_licences` (status `declared`), audit `licence_declared` | [X] partial |
| Auth `next` sinks | `/auth/callback`, `/login`, `/account/sign-in`, `/account/complete` | - | `//evil.example`, `/\evil.example`, `/%5Cevil.example`, `https://evil.example`, `http://localhost:3100@evil.example`, `javascript:`, tab-prefixed, `/events/new` | `safeNextPath` (run through `tsx`): all hostile values -> `null`; `/events/new`, `/dashboard`, `/account` pass. Callback with no code and with `code=bogus`: hostile `next` dropped, redirect `http://localhost:3100/login?error=missing_code` or `exchange_failed`; `/events/new` kept as `&next=%2Fevents%2Fnew`. Signed-in practitioner on `/login?next=/events/new`: 200, no loop | success branch (valid PKCE code) not executed | [X] failure branches, [R] success branch |
| Sign-out revoke | GoTrue + app | memberA | - | `POST /auth/v1/logout` 204; GoTrue `/user` with old token 403 `session_not_found`; old staff cookie -> `/dashboard` and a staff action 307 `/login`; PostgREST with the old JWT still 200 until JWT expiry (F13) | - | [X] |
| `/api/cron/dispatch` | route | anon | - | no auth 401, bad bearer 401; authenticated path not run (no secret, it acts on every event) | - | [X] negatives only |
| `rate_limit_check` via `registerForEvent` | RPC via action | anon | 36 requests | same `X-Forwarded-For`: 30 pass, 6 limited; 36 rotating `X-Forwarded-For` values: 36 pass (F8) | `rate_limits` rows | [X] |

## 2. The two claims

### CLAIM-A: direct `consent_records` writes, no audit row. CONFIRMED [X]

Setup: disposable practitioner `prac2`, JWT from `signInWithPassword`. Table grants (read first, [X]): `authenticated` holds table-level INSERT, UPDATE and DELETE; policies `consent_self_insert` (check `user_id = auth.uid()`), `consent_self_withdraw` (UPDATE using and check `user_id = auth.uid()`), no DELETE policy, no triggers.

```
AUD0=$(psql ... -c "select count(*) from audit_events")
curl -s -X POST $API/rest/v1/consent_records -H "apikey: $ANON" -H "Authorization: Bearer $PRAC2_JWT" \
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d '{"user_id":"<prac2>","consent_type":"marketing","version":"v-bt","context":{"ip":"forged"}}'
```

| Step | Request | Outcome |
|---|---|---|
| CA1 | INSERT own `marketing` row, forged `context` | 201, row returned with `granted_at` = server now |
| CA2 | INSERT own `terms_of_service` row, `version: "v0-forged"` | 201 |
| CA3 | PATCH `granted_at = 2001-01-01` (backdate) | 200, changed |
| CA4 | PATCH `withdrawn_at = now()` then `null` | 200 both (withdraw and un-withdraw) |
| CA5 | PATCH `version = "v-forged"` | 200 |
| CA6 | INSERT a row for ANOTHER user (prac1) | 403 `42501 new row violates row-level security policy` |
| CA7 | PATCH `user_id` to prac1 | 403 `42501` |
| CA8 | DELETE own row | 200 `[]` (RLS, no policy, 0 rows) |

`audit_events` count before and after CA1-CA8: delta 0. The documented path `rpc/grant_consent` on the same user: delta +1 (`consent_granted {consent_type, version}`).

What it means: a user can create consent rows for a made-up version, rewrite `granted_at` and `version` of an existing row, and withdraw or un-withdraw with no audit trail. The forged `v0-forged` terms row did not stop `acceptRequiredConsents` (it still wrote `tos-0.1-draft`), because the gate compares against the current version; but a user can pre-write a row carrying the CURRENT version string and skip the audited grant. Blast radius is the user's own rows only. The consent record is the evidence the organisation would show a regulator, and this one is user-editable and unaudited. Hard rule 11 (audited-mutation tables revoke direct writes) is not applied to this table.

### CLAIM-B: email change on an attended, unlinked registration, then claim. CONFIRMED [X]

Fixtures: ZZ-BT live event (org A, created by adminA), registration `rVictim` (`zz-bt-victim@...`, `user_id` null), practitioner `prac2` (`zz-bt-prac2@...`).

```
B1  adminA markAttended(code,'manual')          -> status=attended, user_id=null, checkins=1, evidence=1, ledger=0
B2  adminA updateRegistrationContact({registrationId:rVictim, fullName:'ZZ Victim', email:'zz-bt-prac2@...'})
    -> OK. read-back: status=attended user_id=null email=zz-bt-prac2@final.invalid
    -> audit: registration_contact_updated role=organiser_admin payload={"fields":["email"]}   (audit delta +1)
B3  prac2 JWT: POST rpc/claim_registrations_for_user {}  -> 200 1
    -> read-back: status=attended user_id=<prac2>
    -> audit: registration_claimed role=self payload={"email":"zz-bt-prac2@final.invalid","user_id":"<prac2>","previous_user_id":null}
    -> prac2 listMyAttendanceRecords returns the event
    -> credit_ledger rows for prac2 = 0 (prac2 has no licence, and the check-in happened while the row was unlinked, so no award)
```

Findings from the chain:
- `update_registration_contact` has no status guard: it allowed an email change on an ATTENDED row (also on a CANCELLED row and on a past event's row, B6 and B7). The only email guard is "linked" (`user_id` not null).
- Who can do it: `organiser_admin`, `organiser_member` (also a non-creator member, K13) and `eventar_staff`. The creator-only rule applies to roles, not to contact edits.
- The audit row holds field names only. There is no old email and no new email, so the reassignment of an attended record cannot be reconstructed from `audit_events`, and the original attendee's identity is gone from the registration row.
- "Credit follows the email": the ATTENDANCE RECORD followed (visible in the new owner's account). A credit ledger row did NOT (no licence, and `claim_registrations_for_user` has no retro-award step). With a licensed claimant the attendance would still be there, but I did not execute a credit award on claim.
- Mitigation to weigh: any org staff member can already mint attendance for any email with a walk-in, so the new power is "reassign an existing record", not "create attendance".
- A linked attended row is protected: B4 "This registration belongs to an Eventar account, so its email cannot be changed here."; B5 name change on it is allowed.

## 3. Findings (ranked)

No BLOCKER found. 6 MAJOR, 7 MINOR, 6 NIT.

### MAJOR

**F1. `body_admin` can write to events through six paths while the same role is refused publish, registration edits, check-in, CPD and invites.** [X]
- Scenario: an accrediting-body administrator account (read-oriented by `canEditRegistrations` comment and the publish gate) can cancel or soft-delete an organisation's events, create and edit draft events, move `registration_close_at`, trigger reminder and survey emails to every attendee, and stamp speaker check-ins.
- Evidence: bodyA (`body_admin`, org A): `createEvent` draft OK (event created); `updateEvent` on E1 OK (blocks replaced); `cancelEvents` OK with audit `event_cancelled role=body_admin org=A`; `updateRegistrationClose` changed the value; `sendReminderForEvent` and `sendSurveyInviteForEvent` OK (7 `email_log` rows); `toggleSpeakerCheckin` OK. Refused for the same account: `publishEvent`, `updateRegistrationContact`, `setRegistrationRole`, `setEventCpdConfig`, `createInviteLink`.
- Cause [R]: `events_org_member_insert/update` and `speaker_checkins_org_member_*` policies check the organisation only, no role; `bulk_update_event_status` calls `resolve_actor(p_actor_override, variadic array[]::text[])` (any active staff); `canManageEvent` and the email actions check ownership only.
- Proposed fix (proposal): decide the intended role matrix first. If `body_admin` is read-only, add a role list to those RPCs and policies (same shape as `resolve_actor(..., 'organiser_admin','organiser_member','eventar_staff')`), and gate the actions with a `canEditEvents` helper next to `canEditRegistrations`. Add the rows to the grant-guard style matrix test.

**F2. Walk-in by an account that cannot check people in leaves an orphan registration and answers HTTP 500.** [X]
- Scenario: `body_admin` opens the check-in desk and registers a walk-in. `walkInRegisterAndCheckIn` passes `canManageEvent`, inserts the registration with the service-role client, then calls `mark_attended`, which refuses the role with `42501`. The error is thrown (HTTP 500) and the row stays.
- Evidence: W8 -> 500; read-back `c4b31e82-... registered user_id=null src=walk_in` (full name and email of a person who was never checked in). The same role scanning a code (M4) also gets HTTP 500 rather than a message.
- Cause [R]: the order is insert first, role gate second (inside the RPC); there is no compensation. Rule 12: partial write plus a 500.
- Proposed fix: reject the role in the action before the insert (same helper as F1), and catch the `42501` from `mark_attended` with a message. Better: register and check in inside one definer function so the pair is atomic.

**F3. CLAIM-A: `consent_records` is directly writable by its owner, unaudited.** See section 2. Fix proposal: `revoke insert, update, delete on public.consent_records from authenticated` (grant-level, per rule 11), make `grant_consent` and a `withdraw_consent` definer the only write paths, add the table to `tests/rls/audited_table_writes.rls.test.ts` with a `42501` negative test.

**F4. CLAIM-B: attended records can be re-pointed to another email, and the audit cannot say from what.** See section 2. Fix proposal: refuse an email change when `status = 'attended'` (or `check_in_at` is set), at least when `user_id` is null and the registration has evidence rows; if it must stay, put old and new email hashes (or a salted digest) in the audit payload so the move is reconstructable without storing the address. Also consider guarding cancelled rows.

**F5. Capacity is not enforced under concurrency.** [X]
- Scenario: a capped event opens and many people submit at once.
- Evidence: event `max_attendees=3`, 8 concurrent `registerForEvent` calls with distinct emails: 8 rows, 8 OK, 0 refusals. Duplicate-email race held (5 concurrent -> 1 row). Walk-in uses the same read-count-then-insert pattern [R].
- Note: the code comment already calls the check "best effort ... T1", so this may be a known and accepted gap. Rank it against the CPD-event capacity promise.
- Proposed fix: take the count and insert in one definer function under a per-event advisory lock, or a deferred constraint trigger on `registrations` that compares to `max_attendees`.

**F6. An existing staff member who accepts another organisation's invite is locked out of the staff console, with no prompt.** [X]
- Scenario: org-B admin receives an org-A invite link and accepts it.
- Evidence: IN13 `acceptInvite(token, null)` -> `{orgName:"ZZ-BT org A"}`; staff rows afterwards `organiser_admin B; organiser_member A`. Then `createEvent` and `updateRegistrationContact` as that user -> 307 `/login?error=multiple_organisations` (MO2, MO4). Direct PostgREST for the same user resolves to org A only (drafts visible: A 2, B 0), so RLS picks one organisation arbitrarily.
- Cause [R]: the confirm prompt in `acceptInvite` only looks at practitioner tables; accepting as existing staff is silent. CX-07 documents multi-org staff as "a case, not an outage", yet the console is unusable for both organisations.
- Proposed fix: decide the policy (Ivan's ruling in `eventar-staff-email-multi-org` covers the redirect, not the invite). Either refuse or prompt in `acceptInvite` when the caller already has a staff row in another organisation, or build the organisation picker the redirect implies.

### MINOR

**F7. CPD hours can be changed after people have attended.** [X] `set_event_cpd_config` has no attendance guard. adminA set 5 hours on an event with 7 attended registrations (audit `event_cpd_config_set` recorded). Check-ins before and after the change would carry different credit. Proposal: refuse (or require an explicit reason code) once any registration is `attended` or any ledger row exists for the event.

**F8. IP rate limit is bypassable by rotating `X-Forwarded-For`.** [X] 36 requests with 36 different header values all passed; with one value the limit held at 30. Production on Vercel overwrites the header [I], so this is a deployment-dependent risk (any other proxy, or direct exposure). Proposal: read the platform-set client IP header only (`x-vercel-forwarded-for` or the last trusted hop), and fall back to a shared bucket when absent.

**F9. Cross-organisation bulk cancel returns a success shape.** [X] adminB `cancelEvents([A's event])` -> `{ok:true,count:0}`, event unchanged. Safe, but "ok" with zero rows is the pattern rule 12 warns about. Proposal: return an error or a distinct `count: 0` message when no id matched.

**F10. Cancel cannot be undone, and restore does not restore status.** [X] `restoreEvents` after `cancelEvents` leaves `status=cancelled`. Cancelling an event that has attended registrations is allowed (registrations stay `attended`). Check-in on it is then refused ("isn't accepting check-ins"). Proposal: confirm this is intended; if not, add an un-cancel or make restore use `previous_status` from the audit payload.

**F11. Unhandled errors surface as HTTP 500.** [X] `publishEvent('zzz')` -> 500 (`22P02` thrown); `markAttended` and `walkInRegisterAndCheckIn` as `body_admin` (F2); `toggleSpeakerCheckin` as another organisation's admin -> 500 (`42501` from the RLS insert; nothing written). The UI normally prevents these, except the role and organisation cases. Proposal: map `42501` and `22P02` to the existing neutral messages.

**F12. Reminder and survey sends leave `queued` rows that never reach `sent`.** [X] After `sendReminderForEvent` and `sendSurveyInviteForEvent` on a 10-registration event: `email_log` `queued x7, skipped x3`; a repeat send answers `stalled: 7` (visible, so not silent). Local stub mode, so I cannot say whether production behaves the same; needs a dev read of `lib/email/eventEmails.ts` to confirm the queued-to-sent transition under the stub. Tagged MINOR pending that.

**F13. Audit payload for `registration_claimed` stores the claimant's email address.** [X] `{"email":"zz-bt-prac2@final.invalid", ...}` in an append-only, hash-chained table; erasure requests cannot remove it. Everything else I read back was PII-light (`fields`, `role_code`, ids, event ids). Proposal: store the user id only, since the registration id is already the subject.

### NIT

- N1. `publishEvent` on an already published event returns success without a message (audit stays at 1 row) [X].
- N2. Speaker check-in (known finding) confirmed by execution: no window, no lifecycle check, any active staff of the event's organisation including `body_admin`, no audit, free text through direct PostgREST insert with `updated_by` null; nothing but the check-in page reads it, so I rank it NIT unless a credit consumer is planned [X].
- N3. Old JWT still reads through PostgREST after sign-out until it expires; app cookies and GoTrue reject it [X]. Expected for stateless JWTs.
- N4. Circular dead end at the door: a cancelled registrant cannot be checked in by code ("Re-register the attendee first") and a walk-in with the same email is refused ("This email is already registered. Use code entry"); the only route is outside the UI [X].
- N5. Audit organisation for definers that use `actor.organisation_id` (`set_registration_role`, `remove_registration_role`, `mark_attended`) would record the operator's own organisation when `eventar_staff` acts across organisations, unlike `update_registration_contact` which uses the event's organisation [R]. Not executed (no operator fixture).
- N6. Direct PostgREST insert into `agenda_blocks` on a draft skips the envelope check the action performs [X].

### What held (negative results worth recording) [X]

- All forbidden direct writes returned SQLSTATE `42501` (grant level): `registrations` INSERT/UPDATE/DELETE, `events` INSERT/DELETE and UPDATE of `status`, `deleted_at`, `organisation_id`, `registration_roles` INSERT; anon INSERT 401.
- `p_actor_override` is inert for real sessions on `publish_event`, `update_registration_contact`, `mark_attended`, `set_registration_role` (all refused or attributed to the JWT's own staff row).
- Cross-organisation actors were refused on update, publish, contact edit, role edit, check-in, walk-in, exports, email sends, CPD; no row changed.
- Staff guest registration and staff walk-in never attach the staff UUID and never create a profile row.
- Check-in window: before start-60min refused, inside accepted (30 min before start), live accepted, after end refused; the same on self check-in and walk-in. Concurrent check-in x5 -> 1 checkin, 1 evidence, 1 audit.
- Agenda save is idempotent under repeated and concurrent saves; a foreign block id is refused and leaves the event untouched.
- Open redirect: no hostile `next` value survived `safeNextPath`.
- Audit-last: in the `prosrc` tail of `publish_event`, `update_registration_contact`, `set/remove_registration_role`, `bulk_update_event_status` (inside the loop), `mark_attended`, `claim_registrations_for_user`, `grant_consent`, `set_event_cpd_config`, `accept_invite_token`, `declare_licence`, `self_check_in`, `write_audit_event` is the last data-writing statement [R, by reading the text after the last call]. `create_event_with_blocks` and `update_event_with_blocks` write no audit row for draft create or edit [X]; publishing writes one.

## 4. Cleanup proof

| Item | Before (ZZ-BT) | Deleted | After |
|---|---|---|---|
| events | 14 | 14 | 0 |
| registrations | 93 | 93 | 0 |
| staff | 7 (incl. adminB's second row, prac3) | 7 | 0 |
| organisations | 2 | 2 | 0 |
| auth users | 8 (via admin API, 8 x 200) | 8 | 0 |
| participation_evidence (hash-chain tail) | 8 | 8 | n/a |
| registration_checkins / roles / speaker_checkins / agenda_blocks / email_log | 8 / 1 / 5 / 5 / 97 | all | 0 |
| invite_tokens / practitioner_licences / professional_profiles / consent_records | 2 / 1 / 1 / 5 | all | 0 |
| orphaned children (events -> occurrences 14, accreditation groups 2, accreditations 2, accreditation_occurrences 2) | 20 | 20 | 0 (FK orphan scan over events, registrations, organisations, staff, groups, occurrences: 0) |
| rate_limits rows for my spoofed IPs | 37 | 37 | 0 |

- Evidence rows: deleted as superuser in one transaction with `set local session_replication_role = replica` (the hash-chain and append-only triggers are off inside that transaction). Because that also switches off FK checks, I scanned for orphans afterwards and removed the 20 child rows it left; the final scan reports 0.
- Global counts after vs baseline at start: events 444 = 444, registrations 904 = 904, registration_checkins 704 = 704, professional_profiles 355 = 355, auth.users 1082 = 1082, staff 253 = 253, organisations 25 = 25, participation_evidence 549 = 549.
- `audit_events`: 43871 -> 43916, delta +45, permanent by design (types: `evidence_recorded`, `attendee_checked_in`, `registration_contact_updated`, `consent_granted`, `event_published`, `event_soft_deleted`, `event_restored`, `invite_accepted`, `licence_declared`, `event_cpd_config_set`, `event_cancelled`, `registration_role_set/removed`, `registration_claimed`).
- `email_log`: I did not take a start baseline. After deleting my 97 rows it reads 32; the 42 I saw mid-run included my own rows.
- Not deleted: about 29 `rate_limits` rows keyed by session ids and the shared unknown-IP bucket (ephemeral windows, cannot be matched to me safely after the users were deleted).
- Temp files: credentials and cookie scratch (`env.json`, `ids.json`) deleted; the scripts remain in the session scratchpad. A hung `psql` call at the very start (a heredoc consumed by a mistaken command) was moved to background by the harness and holds no connection (0 idle-in-transaction sessions).
- Repo: no tracked file changed by me; `git status` shows only the three peer `REVIEW-FINAL-*` files and the `.claude/skills` changes that were there at the start, plus this file.

## 5. Not covered and gaps

- Block removal with survey answers (`block_has_survey_answers`): not seeded, not executed.
- The "saved but the agenda could not be read back" branch of `updateEvent`: cannot be forced from outside; [R] only.
- `setEventCpdConfig` as a form action (FormData encoding), and `remove_*`/`link_*`/`unlink_*` accreditation RPCs: not driven; the add-group role gate was proven but its happy path was not reached.
- `eventar_staff` (platform operator) never exercised: no fixture; the cross-organisation operator paths and audit organisation attribution (N5) are [R].
- `updateMyAccount`, `addMyAppointment` happy paths (my payload failed validation), `uploadAvatar`, `changeEmail`, `resendVerificationEmail`, `sendMagicLink`, `sendAttendeeMagicLink`, `provisionOrganisation`, `completeOrgOnboarding`: not executed (outside the diff or real-mail side effects).
- Real Resend delivery: not exercised (stub mode, `.invalid` addresses).
- `/api/cron/dispatch` authenticated run: not executed (needs the secret, acts on every event).
- Auth callback success branch (valid PKCE code) and `wizardLandingPath` on `/account/complete`: not executed.
- Window edges at exactly -60:00 and exactly the end second, multi-occurrence events: not tested.
- Export happy paths: blocked by "Registration is not closed yet" and "No credit has been posted"; only the cross-organisation negatives and the attendance CSV were proven.
- `credit_ledger`: no licensed attendee fixture, so credit award on check-in and on claim was not exercised (ledger stayed 0).
- Concurrency tests ran on one dev server process.
