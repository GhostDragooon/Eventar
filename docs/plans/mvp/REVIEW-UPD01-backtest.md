# UPD-01 backtest review (live, :3100, local stack)

Lens: backtest. Executor: Claude Sonnet 5.5, Claude Code. Date: 2026-10-23. Method: the real `updateEvent` Server Action driven with curl and the `Next-Action` header as signed-in organisers (cookies minted by the repo's `@supabase/ssr` from password sign-ins), every write read back with psql on the local DB. No browser tool, no server started or stopped, no `.env.local`, no MCP, no `:3000`.
Evidence tags: [X] executed, [R] read, [I] inferred.

Action id: `updateEvent` is `60bdf566d401c625a1ef07f8d3a9b2773d53975414` [X]. It appears in `.next/dev/server/server-reference-manifest.json` (key `exportedName: updateEvent`) only after the edit page has been requested once in dev.

## Verdict

The card's claim holds for the Server Action: (a) to (d) all behave as written. The draft-only rule does not hold below the action: any same-organisation organiser can still rewrite a published event through PostgREST, both via the RPC (known, DB-04) and via a plain `PATCH /rest/v1/events` (not named in any card I found). Counts: B 0, M 1, m 4, n 3.

## Results of the four requested probes [X]

| Probe | Caller | Event | Return value | DB read-back |
|---|---|---|---|---|
| (a) | admin (creator, default org) | draft | `{"ok":true}` | title and venue_name changed, status still `draft` |
| (b) | same admin | published | `{"error":"This event is no longer a draft, so its details cannot be edited yet."}` | title, venue_name, status and `updated_at` identical to before |
| (c) | admin of another organisation | the same published event | `{"error":"You do not have access to this event."}` | unchanged |
| (d) | admin | cancelled | `{"error":"This event is no longer a draft, so its details cannot be edited yet."}` | unchanged |

## Findings

| ID | Sev | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|
| F1 | M | The draft-only rule lives only in the Server Action. A same-organisation organiser_admin who did NOT create the event (the exact "colleague" of the round-1 finding the card says it closes) rewrote a published event two ways, with their own JWT: `POST /rest/v1/rpc/update_event_with_blocks` returned 200 and changed title and venue; `PATCH /rest/v1/events?id=eq.<id>` returned 204 and changed the title. Neither wrote an audit row (0 `audit_events` rows reference any fixture id). The RPC is `security invoker` and checks only the organisation (`20260914000000…sql:170`); it has no status or creator check. The table path is separate: `authenticated` holds column-level UPDATE on 28 of 33 `events` columns (not `status`, `organisation_id`, `published_at`, `accrediting_body_id`, `cpd_hours`) and the policy `events_org_member_update` admits any staff member of the organisation. `grep` of the execution plan and `docs/plans/mvp/*.md` finds no card that revokes this. | [X] RPC, PATCH, row read-backs, grants and policy via psql; [R] migration; [R] plan grep | Keep DB-04 for the RPC. Add the table path to DB-04 or a sibling `sql` card: revoke the content-column UPDATE from `authenticated` (writes only through the definer or service-role path) or make the policy `USING (status = 'draft')`; mirror in `supabase/seed.sql`, add a negative test for SQLSTATE `42501`. Until then reword the hand-back: "closes the direct Server Action call", not "a colleague could rewrite it". |
| F2 | m | `created_by` and `deleted_at` are in the same `authenticated` column-UPDATE list. A non-creator colleague `PATCH`ed `created_by` of a published event to their own staff id: 204, row changed. The creator predicate the hand-back plans (`event.created_by === staff.id`) is therefore defeatable by any same-organisation user, and `deleted_at` lets them soft-delete. Outside UPD-01's diff, but it undermines the rule UPD-01 says is coming next. | [X] PATCH and read-back; [X] column grants | Fold into the F1 grant fix (revoke UPDATE on `created_by` and `deleted_at` from `authenticated`) before the creator predicate ships. |
| F3 | m | A unit test is named "lets the operator edit another organisation's draft". Live, an `eventar_staff` operator editing another organisation's draft passes the action's gates and is refused by the RPC with a raw database message: `not in the same organisation as event <uuid>`. The RPC exempts only `auth.role() = 'service_role'`, not `eventar_staff`. Pre-existing, not caused by UPD-01, but the test only proves the action does not block (RPC mocked), and the user would see raw DB text. | [X] operator call, returned message, row unchanged; [R] migration line 170 | Rename the test to say what it proves ("the action does not block the operator"), or make the RPC honour `eventar_staff` in DB-04 and map the error to a friendly message. Ivan's call which. |
| F4 | m | A soft-deleted draft (`deleted_at` set) still saves: `updateEvent` returned `{"ok":true}` and the row changed. The action's read does not select or filter `deleted_at`. Pre-existing, but "only a draft can be edited" is the same family of guard. | [X] call and read-back | Select `deleted_at` and return "Event not found." when set (one line plus one test). |
| F5 | m | The hand-back's "Live check: pending" is now answerable: a published event rejects a direct `updateEvent`, a draft saves (probes a to d). It also says tests prove "refuses another organisation's event before any status message"; live, the other-organisation admin got the access message for published, cancelled and draft events alike, so a stranger learns nothing about status. | [X] | Update the hand-back's live-check line to executed with this file as the evidence. |
| N1 | n | Time-of-check gap: the action reads `status` with the admin client, then calls the RPC in a separate statement. A publish landing between the two lets the edit hit a just-published event. Not exercised. | [I] from the code | DB-04 closes it by putting the rule in the RPC; no separate work. |
| N2 | n | The read-only edit page for a published event tells an organiser_admin "Editing event details isn't available yet — this view is read-only. Need a change? Ask an admin." The viewer was an admin, so the hint is a dead end. Pre-existing copy. | [X] page HTML | Copy decision for UX; no change for UPD-01. |
| N3 | n | Refused calls return HTTP 200 with the error inside the flight payload (normal for Server Actions). The action prints no log line for a refused status, so a refused direct call leaves no trace. | [X] responses | None needed for MVP. |

## Verified OK [X]

- (a) to (d) as in the table above, plus: a completed event is refused with the status message and left unchanged.
- Order of checks: the other-organisation admin gets "You do not have access to this event." for a draft, a published and a cancelled event; never the status message.
- Same-organisation colleague who did not create the published event: refused with the status message. Platform operator (`eventar_staff`) on a published event in the default organisation: refused with the status message, so the rule really applies to every role the card names.
- Nonexistent event id returns "Event not found."; `not-a-uuid` returns "Invalid event id."
- A draft save leaves `status = 'draft'`, and `updateEvent` wrote no audit row (0 rows reference the fixtures), as the card states.
- The edit page for a published event renders the read-only view (title, dates, venue, "this view is read-only"), not the editor.

## Not reached

- Roles `organiser_member`, `body_admin`, `auditor` calling the action (role gates are other cards).
- Review-mode (service-role executor) path; the browser UI; a non-empty `blocks` payload (only `blocks: []` was sent).
- The status-versus-publish race (N1), and whether unrelated columns (`published_at`, `accrediting_body_id`, `cpd_hours`) survive a draft save beyond `status`.
- `next build`, `pnpm test:rls`, vitest (out of scope for this lens).

## Fixtures and cleanup

Created (all prefixed `upd01bt` / `UPD01BT`): 4 auth users (`upd01bt-admin`, `upd01bt-other`, plus two extra to test the claim for a non-creator colleague and for `eventar_staff`: `upd01bt-colleague`, `upd01bt-op`, all `@upd01bt.invalid`), 4 `staff` rows, 1 organisation (`upd01bt-other-org`), 5 events (draft, published, cancelled, a second published set to completed, one draft in the other organisation).

Cleanup, in order: events (5 deleted), staff (4), organisation (1), auth users via the admin API (4, all 200), scratch directory (keys, passwords, cookies, JWTs) removed. Final read-back: `events=0 staff=0 orgs=0 auth=0`.

`audit_events` rose from 16733 to 16777 during the run; none of the 44 rows reference a fixture (checked by id and by `upd01bt` text), so they came from other sessions. Fixtures wrote no audit residue.

Repo state: this lens edited no repo file. `git status --porcelain` at the end differs from the start only by untracked files that other sessions created meanwhile (`docs/plans/mvp/REVIEW-UPD01-dev.md`, two `.claude/skills/eventar-static-gates/references/evidence-*.md`) plus this report.
