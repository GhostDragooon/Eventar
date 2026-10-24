# REVIEW DB-04, backtest lens

Reviewer: backtest agent (separate from the dev-code and user-walk lenses). Date: 2026-10-24. Evidence tags: [X] executed against the real system, [R] read from code or catalog, [I] inferred.

## Verdict

PASS for the card as written. Everything DB-04 promises held under real signed-in JWTs against the local stack: the per-block upsert keeps ids stable, refuses foreign, duplicate and answered blocks atomically, and a published (or cancelled) event cannot be edited through the RPC, through a direct PostgREST PATCH of any detail column, or through a direct agenda-block write. The shipped paths that must keep working (publish, Close registration, cancel, soft-delete, restore, the edit page, the `updateEvent` Server Action with `blockIds`) all worked.

No BLOCKER. One pre-existing MAJOR next to the card's scope (a signed-in organiser can hard-delete a published event), two MINOR, three NIT. None of them is a defect in the DB-04 migration itself except the wording issues in F2 and F4.

Count line: 0/1/2/3 (B/M/m/n).

## Environment

- Dev server http://localhost:3100 was in REVIEW MODE: a signed-out `GET /events/new` returned HTTP 200 with the banner "Review mode — authentication is bypassed" [X]. A signed-out Server Action POST ran as the review-mode operator and saved (as designed, local only). All role-dependent probes below used real sessions: access tokens from the Mailpit magic-link flow for ux-admin (organiser_admin) and ux-member (organiser_member), and for the Server Action a `sb-127-auth-token` cookie built from the same session. `lib/auth.ts` and `lib/supabase/server.ts` honour a real auth cookie even in review mode [R], and the edit page rendered the header "ux-admin ux-admin@eventar-review.invalid" for my cookie [X].
- Lock file scratch-demo/locks/dev-3100.lock named `claude-e94a72 DB-03 reviews`; not touched. No servers started or stopped, Browser pane not used, no repo file edited except this hand-back.
- Migration 20261024110000 was applied locally before I started. I re-ran the whole file inside `begin; ... rollback;` and it completed (CREATE FUNCTION, DROP/CREATE TRIGGER, the self-check DO block) with both triggers still present afterwards, so the "idempotent" claim holds [X].

## Findings

| ID | Severity | Route / function | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|---|
| F1 | MAJOR (pre-existing, outside the card's literal scope; needs a ruling) | `DELETE /rest/v1/events` (policy `events_org_member_delete`, grant DELETE to `authenticated`) | A signed-in organiser_member can hard-delete a PUBLISHED event through PostgREST. The row is gone and its agenda goes with it. No audit row was written for the delete. The FK catalog says a delete also cascades to registrations, survey_responses, email_log, speaker_checkins, event_occurrences and event_accreditation_groups; only credit_ledger and participation_evidence (NO ACTION) stop it. This contradicts the card's headline "a published event cannot be edited at any layer a signed-in user reaches", though the card only names edits. | [X] fixture event `DB04 BT race 0` (published, in the default org): `DELETE /rest/v1/events?id=eq.<id>` as ux-member returned 200 with the full row, then `select count(*) ... = 0`. [X] `has_table_privilege('authenticated','public.events','DELETE') = t`. [R] policy qual `organisation_id = app_private.current_staff_org_id()`, created in 20260910000000_authority_sweep_org_scope.sql. [R] FK delete rules from `pg_constraint`. I did not execute the registrations cascade. [X] audit types for the fixtures were event_published/cancelled/soft_deleted/restored only. | Ask Ivan. Options: revoke DELETE on `events` from `authenticated` (soft-delete already goes through `bulk_update_event_status`, a definer), or add `and status = 'draft'` to the policy's USING. Either needs a proof row in `audited_table_writes`-style tests. |
| F2 | MINOR | `updateEvent` Server Action, stale second tab | A tab that still holds a block another tab (or person) removed gets the raw database text as the error: `update_event_with_blocks: block 42c6b02a-88c7-410e-bcf3-1a77bd37753b is not part of event db04b700-0000-4000-8000-000000000001`. The organiser cannot act on it, and the form gives no hint to reload. The same raw text reaches the user for "appears twice" (not reachable from the UI). The two refusals the action maps to plain words (`event_not_draft`, `block_has_survey_answers`) are fine. | [X] tab A removed "racer 7" via RPC (200); tab B then saved through the real action with that block's id: HTTP 200, flight payload `"error":"update_event_with_blocks: block ... is not part of event ..."`, agenda unchanged. | In `rpcErrorMessage` (updateAction.ts) map messages containing `is not part of event` to a sentence like "The agenda changed since you opened this page. Reload and re-apply your changes. Nothing was saved." |
| F3 | MINOR | `DELETE /rest/v1/agenda_blocks` on a DRAFT event | The rule "a block with a survey answer cannot be removed" lives only in the RPC. A direct PostgREST delete of an answered block on a draft succeeds and the answer silently loses its block (`survey_responses.valuable_block_id` is ON DELETE SET NULL). Reach is narrow: published and cancelled events are shut by the trigger and the UI uses the RPC, so it needs survey rows on a draft. Still a silent loss, rule 12. | [X] survey row `valuable_block_id` pointed at "D block NEW" on a draft. RPC refused removal (`block_has_survey_answers: D block NEW`, 22023, event and agenda unchanged). Then `DELETE /rest/v1/agenda_blocks?id=eq.5ca61a8d-...` as ux-admin: 200, row returned, survey `valuable_block_id` read back empty. | In `agenda_blocks_draft_only_writes`, on DELETE for `authenticated`/`anon` also raise when `app_private.block_has_survey_answers(old.id)` (same message), so both layers agree. Or accept and say so in the card. |
| F4 | NIT | `update_event_with_blocks` and the `agenda_blocks` trigger, cross-organisation messages | The migration header and card say the cross-org refusal is "now a clean 42501 'is not in your organisation'". That holds only for events the caller can read (published). For another organisation's DRAFT the caller gets HTTP 400 P0001 `event <id> not found or not visible`, because RLS hides drafts first. A cross-org POST of an agenda block into a draft gets `event_not_draft: the agenda of event <id> cannot be changed while it is not visible` (22023), which says "not a draft" about a draft. Harmless and unreachable from the UI (the action checks organisation first), and nothing leaked or changed. | [X] with a fixture second organisation and an organiser_admin there: RPC on org1 draft: 400 P0001 not found or not visible; RPC on org1 published event: 42501 `is not in your organisation`; PATCH events on org1 draft and on org1 published `registration_close_at`: 200 `[]` (0 rows); POST block into org1 draft: 400 22023 `... while it is not visible`; DELETE block: 200 `[]`. The eventar_staff operator in org2: RPC 42501 on draft and published (as documented); POST block 403 42501 RLS. | Either soften the card wording to "refused (42501 for visible events, not found for hidden drafts)", or in the trigger return NEW/OLD when the parent is not visible so RLS's 42501 fires. |
| F5 | NIT (pre-existing) | `anon` EXECUTE on `update_event_with_blocks` | `anon` holds EXECUTE (Supabase default). It is refused safely: draft gives P0001 not found or not visible, published gives HTTP 401 / 42501 `is not in your organisation`. No state change. | [X] `has_function_privilege('anon', 'public.update_event_with_blocks(uuid,jsonb,jsonb)', 'EXECUTE') = t`; anon RPC calls above. | `revoke execute ... from anon` if the repo's grant-guard matrix wants staff-only RPCs unreachable by anon. |
| F6 | NIT | updateAction.ts doc comment | The header comment still describes "Full-replace update", "absent nullable keys overwrite to NULL", and the inline comment says an empty array DELETES every agenda block. Since DB-04 an empty array deletes only blocks without survey answers and refuses if any is answered (observed: `[]` payload gave `block_has_survey_answers`). | [R] updateAction.ts; [X] `[]` payload behaviour. | Update the comment. |

## Verified OK

All against the local stack, ux-admin unless stated. Fixture prefix `DB04 BT`.

| # | Probe | Observed |
|---|---|---|
| 1 | RPC save twice with the same block ids | 200 both times; the two rows keep the same ids, titles and display_order |
| 2 | Add a block without an id | 200; new row gets a fresh uuid, existing ids unchanged |
| 3 | Reorder, caller sends junk display_order (7, -5, 3) | 200; display_order is the payload index (0, 1, 2) |
| 4 | Remove one block by omitting it | 200; that row deleted, the rest renumbered 0..n-1 |
| 5 | Remove a block a survey answer points at (admin, then member) | 400, 22023, `block_has_survey_answers: D block NEW`; event column change in the same payload did not stick; agenda and survey row unchanged |
| 6 | `[]` payload while an answered block exists | 400, 22023, same message; nothing removed |
| 7 | Keep the answered block, drop others | 200; survey row still points at the same block |
| 8 | Block id of another event | 400, 22023, `block <id> is not part of event <id>`; agenda unchanged |
| 9 | Duplicate id in the payload | 400, 22023, `block <id> appears twice in the payload`; unchanged |
| 10 | Nonexistent uuid as id | 400, 22023, `is not part of event` |
| 11 | Non-uuid id; blocks_input object; blocks_input null | 400 22P02; 400 22023 and 400 22023 `blocks_input must be a jsonb array` |
| 12 | Atomicity: invalid `kind` in last block, and event `end_time < start_time` | 400 23514 both; agenda and event columns unchanged (earlier removals rolled back) |
| 13 | Empty-string id treated as new | 200; inserted as new block |
| 14 | RPC on PUBLISHED event as admin and as member, with blocks and with `[]` | 400, 22023, `event_not_draft: event <id> is published and its details cannot be edited yet`; event and agenda unchanged |
| 15 | Direct PATCH of title, topic, description, venue_name, city, latitude, start_time, end_time, max_attendees, checkin_modes, registration_open_at, hero_image_url, poster_path, hosted_by, category, format on published (admin; title also as member) | every one 400, 22023, `event_not_draft: ...`; row unchanged |
| 16 | PATCH `registration_close_at` plus `title` together on published | 400 22023 (title part refused, nothing written) |
| 17 | PATCH `registration_close_at` alone on published, admin, member, and to null | 200 each, value changed and cleared; no other column touched |
| 18 | No-op PATCH (same title) on published | 200 (allowed, nothing changes) |
| 19 | PATCH `status` | 403 42501 permission denied (no grant) |
| 20 | `POST`, `PATCH` (title, and event_id into a draft), `DELETE` on `agenda_blocks` of the published event, admin and member | all 400, 22023, `event_not_draft: the agenda of event <id> cannot be changed while it is published`; agenda unchanged |
| 21 | Same agenda writes on a DRAFT (PostgREST DELETE of a block) | allowed (200) |
| 22 | Cancelled event: PATCH title, RPC | 400 22023 `... is cancelled and its details cannot be edited yet`; PATCH `registration_close_at` still 200 |
| 23 | service_role: RPC on published | 400 22023 (RPC refuses every role); service_role PATCH title and POST block on published pass (204, 201), as the card says; reverted |
| 24 | Column coverage | The 23 columns `authenticated` can UPDATE equal the trigger's 22 compared columns plus `registration_close_at` [R]+[X] |
| 25 | Publish a draft through the real `publishEvent` action | 200; status published; one `event_published` audit row |
| 26 | Real `updateRegistrationClose` action on the published event: set, clear, set as member | 200 each; `registration_close_at` stored/cleared accordingly |
| 27 | `bulk_update_event_status` cancel, soft_delete, restore as ux-admin JWT | 200 each, returns the id; status `cancelled`, then deleted flag and restore round trip (definer passes the triggers) |
| 28 | GET `/events/<draft>/edit` and `/events/<published>/edit`, admin and member | 200 for both; draft shows the form (Save changes, Publish); published shows the read-only view ("Editing event details isn't ..." notice) |
| 29 | Real `updateEvent` action on a draft with 2 blocks plus 1 new: first save | 200; flight body carries `"blockIds":[B2,B1,new]` in payload order |
| 30 | Second save using the returned ids with a reorder and a title edit; third identical save | 200; ids stable, three rows, no copies |
| 31 | Action: remove an answered block | 200 with `The block "D block one" has survey answers, so it cannot be removed. Nothing was saved.`; agenda and venue unchanged |
| 32 | Action as member on a draft | 200 with `blockIds`; saved |
| 33 | Action: non-uuid block id; other event's block id; nonexistent event | `block 0.id: Invalid UUID` (no RPC); the raw `is not part of event` text (see F2); `Event not found.` |
| 34 | Action on a published event (D3 after publish, and the pre-published fixture) | 200 with `This event is no longer a draft, so its details cannot be edited yet. Your changes were not saved.`; nothing changed |
| 35 | Concurrency A: 8 parallel RPC saves of one draft, same ids plus a different new block each | all 200, no deadlock, final state 3 kept + 1 new block, no duplicates |
| 36 | Concurrency B: 6 rounds of RPC save racing `publish_event` on a fresh draft | save 200 in 2 rounds (event edited and block present, then published), save 400 `event_not_draft` in 4 rounds (event untouched, 0 blocks); publish 204 every time; no half-applied state |
| 37 | Cross-organisation with a fixture second org (organiser_admin) | see F4 for the refusals; org2 admin saving its own draft: 200, 1 block written, proving the refusals are org-scoped and not a blanket failure |
| 38 | Re-run of the migration in a rolled-back transaction | completes, both triggers present afterwards |

## Not reached

- Bulk cancel / soft-delete / restore through the dashboard's Server Action: its action id is not in the dev manifest (client-only reference not compiled), so I called the same RPC as the ux-admin JWT. The real action uses the service-role client with `p_actor_override`, a path the definer function treats the same way; [I] only.
- The survey-refusal behaviour in the browser (the form still shows the removed block, the dev's open question 1): not driven, the Browser pane was out of bounds.
- Reorder from the form UI: the form has no reorder control; reorder was proven at RPC level only.
- Stale-tab last-write-wins in the other direction (tab B lacks a block tab A added, so B's save silently removes it): follows from the upsert rule and was true before DB-04; not executed, and there is no version check.
- A direct PATCH of `registration_close_at` to a value after the event start: the action refuses it, but I did not probe whether the database does (the trigger exempts that column entirely) [I].
- The unit, RLS and build gates: forbidden for this lens.

## Fixtures and cleanup

Created: 9 events (`DB04 BT draft`, `published`, `to-publish`, `race 0..5`, `org2 draft`), their agenda blocks, 1 registration and 1 survey response, 1 fixture organisation (`db04bt-org2`), 2 staff rows and 2 auth users (`db04bt-o2admin@example.invalid`, `db04bt-op@example.invalid`, deleted through the auth admin API). `race 0` was removed by the F1 probe itself. Everything else removed by delete (events cascade the rest). Another agent's `DB-04` fixtures were not touched.

Residue read back after cleanup: events 0, agenda_blocks 0 for my ids and titles (table total 1, the pre-existing row), registrations 0, survey_responses 0, staff 0, organisations 0, auth users 0.

Permanent residue: 10 `audit_events` rows mentioning the fixtures (7 event_published, 1 event_cancelled, 1 event_soft_deleted, 1 event_restored). Audit rows are append-only by design and cannot be removed. Sign-in also left three new `auth.sessions` rows for ux-admin and ux-member (magic links). Scratch token and cookie files in my scratchpad were deleted.
