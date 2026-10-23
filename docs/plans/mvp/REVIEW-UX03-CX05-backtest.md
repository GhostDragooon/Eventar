# REVIEW: UX-03 and CX-05, backtest lens

Reviewer: backtest agent (Claude Sonnet 5.5). Date of run: 2026-10-22/23 (stack clock 2026-10-22 20:2x UTC).
Scope: write paths of UX-03 and CX-05 (createEvent draft and published, publishEvent, updateEvent, the six accreditation actions, plus setRegistrationRole and removeRegistrationRole) for organiser_admin, organiser_member, body_admin. Local stack only, app on :3100, database on 127.0.0.1:54322.

Evidence tags: [X] executed and read back, [R] read from code or a function definition, [I] inferred.
No [I] evidence from `p_actor_override` simulation exists in this file. Every action call below went through the running app with a real signed-in session. Every direct database call used a real user JWT with no override.

## How it was run

- Sessions: for each account an admin `generate_link` token was exchanged with `verifyOtp` through `@supabase/ssr`, which captured the `sb-127-auth-token` cookie. These are real GoTrue sessions, equivalent to a Mailpit magic link, minus the click. Accounts: ux-admin, ux-member, ux-body, plus two fixtures made for this run, `ux03b-admin2` (organiser_admin, same organisation, never created any of the events under test) and `ux03b-adminb` (organiser_admin of a second organisation). [X]
- Server actions: `curl POST <page> -H "Next-Action: <id>"` with ids from `.next/dev/server/server-reference-manifest.json`. Results read from the flight response (`1:{...}` line, or the `x-action-redirect` header for redirects). [X]
- Read-back: psql on :54322 after every step. `audit_events` count, `verify_audit_chain()`, and the three accreditation tables were snapshotted before and after each role block. [X]
- Direct database layer: PostgREST RPC calls with the user's own access token, no override, to prove the database refuses independently of the app gate. [X]
- Not covered: the `eventar_staff` role (no account), any browser behaviour (the client-side dirty refusal, dialog focus, banner removal from the address bar; another agent holds the browser), email side effects (none are triggered by these paths).
- Run note, not a code defect: mid-run the ux-body session was revoked by something else on the shared stack (every ux-body request came back `307 /login?next=...` with no `error` parameter, other users unaffected). I re-minted the session and re-ran that block. The 307 results are not counted below. [X]

## Table of write paths tried

Audit baseline at start: 10422 rows, 0 invalid links. Audit at end: 10441 rows, 0 invalid links. Rows added by this run: 19 (itemised under Q4).

### Q1 createEvent (`app/events/new/actions.ts`)

| # | Role | Input | Expected | Observed | DB read-back |
|---|---|---|---|---|---|
| 1 | organiser_admin | status draft | draft saved, redirect to edit with saved flag | 303 `/events/b495a6fc.../edit?saved=1` | events row status draft, created_by = admin 484c8efb, published_at null, 0 audit rows [X] |
| 2 | organiser_admin | status published | published, redirect to details | 303 `/events/5d3ead56.../details?published=1` | status published, published_at set, created_by admin, one `event_published` (actor_role organiser_admin) [X] |
| 3 | organiser_member | draft | as 1 | 303 `/events/0e92d138.../edit?saved=1` | draft, created_by = member ccefdcbd, 0 audit [X] |
| 4 | organiser_member | published | as 2 | 303 `/events/51a32795.../details?published=1` | published, published_at set, one `event_published` (actor_role organiser_member) [X] |
| 5 | body_admin | draft | allowed | 303 `/events/b88d5b9c.../edit?saved=1` | draft, created_by = body e92e16c1, 0 audit [X] |
| 6 | body_admin | published | refused, nothing written | `{error: "Your role can't publish events. Nothing was saved. Save a draft, then ask an organiser admin to publish it."}` (200, no redirect) | no row with that title, audit unchanged [X] |
| 7 | admin | status "bogus" | refused | `{error: "status: Invalid option..."}` | no row [X] |
| 8 | no cookie / garbage cookie | published | stopped by the gate | 307 `/login?next=/events/new` both times, action not run | n/a [X] |
| 9 | member, body_admin, member+published | draft or published with a `cpd.bodyId` | refused before the database | `{error: "Your role can't set accreditation. Nothing was saved. ..."}` x3 | zero events, audit unchanged [X] |
| 10 | organiser_admin | draft with authorised body, 1.5 h | saved with accreditation | 303 `/events/98e98922.../edit?saved=1` | accrediting_body_id set, cpd_hours 1.5, one `event_cpd_config_set` [X] |
| 11 | organiser_admin | published with a body the organisation is not authorised by | partial success, said plainly | `{error: "The event was published, but your organisation isn't authorised by that accrediting body. Open it and set the accreditation there.", eventId}` | event row exists, status published, one `event_published`, accrediting_body_id null [X] |
| 12 | body_admin, direct RPC, real JWT, no override | `create_event_with_blocks` with status published | database refuses | HTTP 403, 42501 `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}` | no row [X] |

Draft creation writes no audit row (rows 1, 3, 5). That matches the code comment that the audit event comes from `publish_event`. [X]

### Q2 publishEvent (`app/events/[id]/edit/actions.ts`)

| # | Role | Target | Expected | Observed | DB read-back |
|---|---|---|---|---|---|
| 13 | organiser_admin | own draft b495a6fc | ok | `{ok:true}` | published, published_at set, exactly one `event_published` [X] |
| 14 | organiser_member | own draft 0e92d138 | ok | `{ok:true}` | published, one `event_published` (organiser_member) [X] |
| 15 | body_admin | own draft b88d5b9c | refused before the database | `{error: "Your role can't publish events. Ask an organiser admin to publish this draft."}` | still draft, no audit row [X] |
| 16 | body_admin, direct RPC, real JWT | publish_event on the same draft | database refuses | 403, 42501 `require_active_staff...` | still draft [X] |
| 17 | admin, second publish of an already published event (13) | brief expected "refused as no longer a current draft" | `{ok:true}` (no error) | status unchanged, still ONE `event_published` row for that event [X]. See finding N1: the brief's expectation was wrong, the database is idempotent here. |
| 18 | member, second publish of 14 | as 17 | `{ok:true}` | no second audit row [X] |
| 19 | organiser_admin (other organisation) vs a draft of Organisation B, called as ux-admin | refused | `{error: "Cannot publish: event not found or not in your organisation."}` | still draft [X] |
| 20 | admin | cancelled draft (set with psql) | refused, stale | `{error: "This event can't be published because it is no longer a current draft...", stale:true}` | status cancelled, no audit [X] |
| 21 | admin | soft-deleted draft (set with psql) | refused, stale | same stale error | still draft with deleted_at, no audit [X] |
| 22 | ux03b-admin2 (same organisation, did not create it) | admin's draft cbb08910 | not specified | `{ok:true}`, published | one `event_published` (organiser_admin). Publishing is organisation-wide, not creator-only. See F3. [X] |
| 23 | race: 4 concurrent publishEvent calls (2 x admin, 2 x admin2) on one fresh draft | one transition, one audit row | all four `{ok:true}` | exactly 1 `event_published` row for the event, status published [X] |

### Q3 accreditation actions (`app/events/[id]/details/multiBodyActions.ts`)

Target event cbb08910 (created by ux-admin). Fixture group G1 and accreditation A1 and a real occurrence were created first by ux-admin so that a missing gate would have had something real to delete or change. Snapshot before and after each block: `groups=38 rows=38 occ=38 audit=10430`, identical after every refused block. [X]

| # | Role | Actions (all six: addGroup, removeGroup, addRow, removeRow, link, unlink) | Expected | Observed | DB read-back |
|---|---|---|---|---|---|
| 24 | organiser_admin who CREATED the event | add group, add row, link, unlink, remove row, remove group (run in the order that builds then tears down) | succeed, one audit row each | six `{ok:true}`, group and row ids returned | six audit rows: `event_accreditation_group_added`, `_row_added`, `_occurrence_linked`, `_occurrence_unlinked`, `_row_removed`, `_group_removed`, all actor_role organiser_admin; tables back to baseline [X] |
| 25 | organiser_member | all six | role message, no rows | all six `{error: "Your role can’t set accreditation. Ask an organiser admin to add or change it."}` | counts and audit unchanged [X] |
| 26 | body_admin (after re-minting the session) | all six | role message, no rows | same message x6 | counts and audit unchanged [X] |
| 27 | ux03b-admin2: organiser_admin, same organisation, NOT the creator | all six | database 42501 with detail not_owner | all six `{error: "Only the person who created this event, or Eventar staff, can make this change."}` | counts and audit unchanged [X] |
| 28 | ux03b-adminb: organiser_admin of another organisation | all six | refused | same not_owner message x6 | counts and audit unchanged [X] |
| 29 | member, body_admin, direct RPC, real JWT | `add_event_accreditation_group` on their own event | database refuses at the role gate | 403, 42501 `require_active_staff: ... {organiser_admin,eventar_staff}`, details null | zero group rows [X]. Through the app these would show the generic "This account can’t make this change. Ask an organiser admin." [R rpcErrors.ts] |
| 30 | admin | removeGroup twice; addGroup twice | idempotent, readable | second remove: `That record could not be found — it may already have been removed.`; second add returns the same group id | one group, one audit row for two add calls [X] |

Registration roles (must still work for organiser_member on their own event):

| # | Role | Action | Expected | Observed | DB read-back |
|---|---|---|---|---|---|
| 31 | organiser_member, own event 0e92d138 | setRegistrationRole presenter | ok | `{ok:true}` | registration_roles row, assigned_by = member; `registration_role_set` audit [X] |
| 32 | organiser_member | removeRegistrationRole presenter | ok | `{ok:true}` | row gone; `registration_role_removed` audit [X] |
| 33 | organiser_member | setRegistrationRole chair | ok | `{ok:true}` | chair row present [X] |
| 34 | body_admin | setRegistrationRole presenter | refused | `This account can’t make this change. Ask an organiser admin.` | no new role row [X] |
| 35 | other-organisation admin | setRegistrationRole | refused | not_owner message | no new role row [X] |
| 36 | same-organisation admin who did not create the event | setRegistrationRole | not specified | not_owner message | no new role row [X]. See F3. |

### updateEvent (`app/events/[id]/edit/updateAction.ts`), tried because the brief lists it

| # | Role | Target | Observed | DB read-back |
|---|---|---|---|---|
| 37 | admin, creator | own draft C4 | `{ok:true}` | title changed, accrediting_body_id and cpd_hours kept (t, 1.5) [X] |
| 38 | ux03b-admin2, not creator | admin's draft C4 | `{ok:true}` | title changed to "...EDITED by admin2" [X] |
| 39 | organiser_member | own PUBLISHED event D2 | `{ok:true}` | title changed on a published event [X] |
| 40 | organiser_member, not creator | admin's PUBLISHED event D4 | `{ok:true}` | title changed on a published event [X] |
| 41 | body_admin | own draft D3 | `{ok:true}` | title changed [X] |
| 42 | admin of Organisation A | draft of Organisation B | `{error: "You do not have access to this event."}` | unchanged [X] |

Across rows 37 to 41 the audit count did not move (10438 before, 10439 after the race publish, which accounts for the single new row). Updates write no audit row. [X]

Other checks: `details?published=1` shows "What to do next" for a published event and not for a draft (UX-03 flag-needs-status behaviour holds) [X].

## Q4 audit chain and counts

- `select count(*) from verify_audit_chain() where not link_valid or not content_valid` returns 0 at the start and 0 at the end. [X]
- Rows this run added: 19, all attributable. By type: `event_published` 7 (rows 2, 4, 13, 14, 22, 11, 23), `event_cpd_config_set` 1 (row 10), accreditation 8 (group added 2, group removed 2, row added 1, row removed 1, linked 1, unlinked 1), registration role 3 (set 2, removed 1). Sum 19, equals 10441 minus 10422. [X]

## Findings

BLOCKER: none. Neither task ships a write that bypasses a gate. Every refused role left zero rows, in tables and in the audit chain, and the database refuses the same calls with 42501 when the app is skipped. [X]

### MAJOR

**F1. updateEvent has no status or ownership gate: a published event can be edited by any colleague in the organisation, unaudited. This contradicts the copy UX-03 added. Pre-existing code, not in this diff, but UX-03 now makes a promise it does not keep.**
- Where: `app/events/[id]/edit/updateAction.ts:74-89` (organisation-only check, comment says "owner-only"); the live `update_event_with_blocks` checks only `v_event_org = current_staff_org_id()`; copy at `components/event-form/PublishConfirmDialog.tsx:36` and `app/events/[id]/edit/PublishDraftButton.tsx:95`: "Details cannot be edited after publishing yet, so check them first." [R]
- Scenario: rows 39 and 40. organiser_member renamed their own published event, and a member renamed an admin's published event, through the action. `git log` shows the file last changed in c8911e3 (authority sweep), so this is the shipped org-wide model. The edit page does not offer a form for a published event [R edit/page.tsx], so only a crafted or stale request reaches it. [X]
- Why it matters: the dialog tells an organiser the published details are fixed. Registrants, reminders and CPD credit rest on those details, and a change leaves no `audit_events` row.
- Fix (decision for Ivan, as it is a rule 7 conflict between the copy and the data layer): either (a) add `status = 'draft'` to the `update_event_with_blocks` guard and the action, so the copy becomes true; or (b) keep editing open, change the copy, and write an audit event on update. Option (a) is one WHERE clause plus a test.

**F2. CX-05 gates the wizard on role only. A same-organisation organiser_admin who did not create the event is shown the enabled wizard, and every action then fails with not_owner.**
- Where: `app/events/[id]/edit/page.tsx:229,245` and `app/events/[id]/details/page.tsx:436,447` pass `canSetAccreditation(staff.role)`; `multiBodyActions.ts:36-43` checks role only; the six RPCs additionally require `created_by = actor` unless eventar_staff (`add_event_accreditation_group`: "not the owner", detail not_owner) [R]
- Scenario: `ux03b-admin2` GETs `/events/98e98922.../edit` and `/details`; both serve `canSetAccreditation:true` to the wizard (member gets `false`). Clicking Add a body then returns "Only the person who created this event, or Eventar staff, can make this change." for all six actions (row 27). The text is accurate now, but the control is still offered and cannot work. [X]
- Fix: pass the same test the database uses: `canSetAccreditation(staff.role) && (staff.role === 'eventar_staff' || event.created_by === staff.id)` at the four call sites, and show the locked state with an ownership note. The wording of that second locked state is a frontend design choice, so per the standing frontend-review rule it needs a before/after for Ivan, not a silent change.

### MINOR

**F3. The event-authority model is inconsistent across the paths, and three comments and one hand-back line describe it wrongly.**
- Observed: publish is organisation-wide (row 22), update is organisation-wide (rows 38, 40), accreditation and registration roles are creator-only (rows 27, 36). [X]
- Wrong text: `app/events/[id]/edit/actions.ts:25-26` ("owner-exclusive check happens in-function now": the SQL checks organisation only); `updateAction.ts:74-77` ("edit is owner-only"); `edit/page.tsx:61-70` ("only the event owner reaches this page": `canManageEvent` is organisation-level) [R]. CX-05.md says the registration-role RPCs are limited "to the owning organisation, not to admins" per spec 002 FR-012; the live `set_registration_role` is creator-only (row 36 refused a same-organisation admin) [R + X]. The practical effect of CX-05's "must still work for organiser_member on their own event" holds (rows 31 to 33).
- Fix: correct the comments and the hand-back line; and ask Ivan whether the intended model is "creator-only" or "organisation-wide", because F1 and F2 both follow from the mismatch.

### NIT

**N1. A second publish of an already published event returns success, not a refusal.** `publish_event` returns early when the status is already published and not deleted (live function body), so `publishEvent` answers `{ok:true}` and the page lands on the Published banner again (rows 17, 18, 23). No second audit row, no state change: safe, and it is what makes the 4-way race clean. The brief's expectation ("refused as no longer a current draft") does not match the code; the `stale` path only covers cancelled and deleted. If a colleague publishes first, the second person is told "Published" with no hint it was already done. Say so in the UX-03 hand-back; no code change needed. [X]

**N2. Cross-organisation existence oracle on the accreditation RPCs.** An admin of Organisation B sent the not_owner message for an event in Organisation A (row 28), while a non-existent group id gives "That record could not be found" (row 30). Event ids are random UUIDs, so the practical leak is low. Fix if wanted: raise P0002 when the event's organisation differs from the actor's (before the owner check). [X]

## What held up

- Three layers hold for publish and accreditation: app gate, database role gate (rows 12, 16, 29), and ownership in the RPC (rows 27, 28). Removing any one of them would not have opened a write in these tests. [X]
- The create form's refusals really save nothing: no event row, no audit row, for body_admin publish and for member or body_admin with accreditation (rows 6, 9). [X]
- Publishing is atomic and idempotent under concurrency (row 23), and the audit chain is intact after 19 new rows. [X]

## Fixture ids (local database; audit rows are permanent)

Events (titles started "UX03B"; some were renamed by the updateEvent tests and still carry the prefix):
- b495a6fc-bdf7-4adf-a6c5-6db4bf235d44 create draft admin (published by row 13)
- 5d3ead56-2392-46f9-a8ed-f66635ab53b1 pub admin
- 0e92d138-3cb2-478f-b4af-8cd53f09cf43 member draft (published by row 14, renamed)
- 51a32795-ac71-452d-b1e7-cf182c10c69a pub member
- b88d5b9c-37cd-47e1-856f-0bd7c70b78c7 body draft (renamed)
- cbb08910-5773-4257-91d7-9ad2a59bd536 D4 (published by admin2, renamed)
- 4c836e2d-74ba-49dc-80b8-8e8745ee20c4 D5 (Organisation B draft)
- e358e8b4-8f60-4360-9c39-604f48ccf341 D6 (set to cancelled with psql)
- 7b1b6389-14f7-45ab-9512-66e0305eb1fa D7 (deleted_at set with psql)
- 98e98922-5f68-4ae3-9424-dae29fee6872 C4 (draft with accreditation, renamed twice)
- 3e26ea8f-d999-4389-bffd-0ea4e5937b1f C5 (published, accreditation refused)
- 88f1cb83-30b8-4c54-a9c4-9e96e460255f R1 (race event, published)

Other rows:
- Organisation "UX03B Org B" 81c91639-594c-4df0-948c-1ee0a91138cf (slug ux03b-org-b)
- staff ux03b-admin2@eventar-review.invalid 7819a1da-941e-4928-85e7-25c7710fbe5d (auth user b75abdbf-1289-44f0-8c65-28c8d6d7a689)
- staff ux03b-adminb@eventar-review.invalid fa2ba5f3-232e-42f7-aeca-b03956912d59 (auth user 86bc43c0-ba18-4790-8c57-0e4a7a336090, Organisation B)
- registration c07e3ea7-997c-4560-bf9d-ba1db2ce3525 (ux03b-reg1@eventar-review.invalid) on event 0e92d138, with a `chair` role row left in place
- accreditation group 38f82e8a-75fe-46db-80b2-70a99d94db4e and row 7decd2c4-6d5f-47ff-b89e-f05ec8673d74 (both removed in row 24); group 54574294-87d2-4b30-acbc-2b5f4b05cb65 (created and removed in row 30); occurrence 54fedffb-192a-4883-b849-f0f51939c3b4 (existing, unlinked again)
- Session cookie files and `env.local` were kept in the session scratchpad with mode 600 and deleted at the end of the run.

Nothing was staged or committed. No source file was edited. This file is the only file written. The tree's existing uncommitted changes (including the `motion` dependency note in UX-03.md) were not touched.
