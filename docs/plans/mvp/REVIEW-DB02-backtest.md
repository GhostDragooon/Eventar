# DB-02 backtest review (live behaviour of check-in after DB-02)
Lens: backtest. Date 2026-10-24 (UTC 03:3x). Local stack only: :3100 dev server (review mode off, started by the coordinator at about 03:36Z), Postgres :54322, PostgREST :54321. No browser tools. Fixtures prefixed `db02bt`; all removed (counts below).
Evidence tags: [X] executed, [R] read, [I] inferred.

## Verdict
The five claims on the card hold on the live stack. One new defect, outside what the card tested, makes DB-02 refuse check-in at events that are live by their own start and end times (F1). I rate it BLOCKER for shipping DB-02 as is.

## Findings

| ID | Severity | Route / function | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|---|
| F1 | BLOCKER | `mark_attended`, `self_check_in` (new occurrence-only window); writers `update_event_with_blocks` (what `updateEvent` calls), `scripts/demo/seed-demo.ts` | Nothing keeps `event_occurrences.starts_at/ends_at` in step with `events.start_time/end_time`. The only occurrence writer is the `events_create_default_occurrence` AFTER INSERT trigger. I created a draft 3 days ahead, edited it with the real `update_event_with_blocks` RPC to start 30 min ago and end in 90 min, published it with `publish_event`, then used the real actions. Event row: live. Occurrence row: still 3 days ahead. `markAttended` returned "Check-in has not opened yet. It opens 60 minutes before the event starts." and `walkInRegisterAndCheckIn` returned the same. Registration stayed `registered`, 0 check-ins. The desk page did not show the "not opened" note (it derives from the event row), so the desk says open and every scan refuses. Before DB-02 the single-occurrence "any time" fallback hid this. Same cause breaks the new run-sheet step: `seed-demo.ts` moves an existing event with `.update({ start_time, end_time })` only, so `DEMO_START_OFFSET_MIN=-30` will leave Beat 4's scan refused. The reverse also follows: an event moved later whose stale occurrence is still open lets a staff scan through days early, because `mark_attended` has no event-level gate (not executed). | [X] edited-draft path; [R] `seed-demo.ts` lines 271-277 and no `event_occurrences` write in app code (grep: only reads in `edit/page.tsx`, `details/page.tsx`); [I] the seed and the reverse case | Keep the single default occurrence in step with the event: an AFTER UPDATE OF start_time, end_time trigger on `events` that updates the occurrence when the event has exactly one (mind `freeze_occurrence_window_if_credited`), or have both functions use `events.start_time/end_time` when there is one occurrence. Add a test that edits the times and then checks in. Also fix `seed-demo.ts` if the trigger is not chosen. |
| F2 | MINOR | `walkInRegisterAndCheckIn` | The action passes the event-level gate, inserts the registration and the `email_log` row, then calls `markAttended`. When that refuses, the registration stays and the message names only the check-in. On event E (F1 state): row `walk-e@...` exists, `source = walk_in`, 0 check-ins. A retry returned "This email is already registered. Use code entry to check them in.", and code entry refuses too. Dead end at the desk. The card lists this as a known limit for a multi-occurrence gap; F1 makes it reachable on a single-occurrence event. | [X] | Resolve the window before the insert, or delete the just-created registration when `markAttended` returns `not_open_yet` or `closed`, or say "registered but not checked in" in the message. Moot for single-occurrence events once F1 is fixed. |
| F3 | NIT | `checkInClosedMessage` docblock vs `selfCheckIn` | The docblock says one voice for "the desk, the server action and the self-serve page". `selfCheckIn` still has its own copy: "Check-in isn't open yet. It opens an hour before the event starts." and "Check-in for this event has closed. Please see a member of staff." The walk-in gate says "This event has not opened for check-in yet." Different audiences, so the copy may be right; the docblock overclaims. | [X] strings; [R] docblock | Reword the docblock, or reuse the helper for the self-serve page. |

## Verified OK (all [X] unless noted)

Server Actions driven with curl on :3100 as the admin (cookie `sb-127-auth-token` built with the repo's `@supabase/ssr` from a password sign-in), then read back with psql.

| Claim | Result |
|---|---|
| `markAttended` before the window (A, starts in 3 h) | error "Check-in has not opened yet. It opens 60 minutes before the event starts." Registration `registered`; `registration_checkins` 0, `participation_evidence` 0, `attendee_checked_in` audit 0 |
| `markAttended` after the end (C, ended 2 h ago) | error "Check-in is closed. This event has ended." Same zero rows and unchanged status |
| `markAttended` live (B, started 30 min ago) | `ok`; status `attended`; 1 check-in (`manual`), 1 evidence (`manual_entry/staff_attestation/standard`), 1 audit (`attendee_checked_in`, `organiser_admin`, via `staff_scan`); `credit` summary empty (event is not CPD) |
| `markAttended` inside the pre-open (D, starts in 40 min) | `ok`; check-in `qr`, evidence `qr_scan`, 1 audit |
| `markAttended` again on B | "Already attended." with the original timestamp; no second row |
| `markAttended` as the other organisation's admin on B | "Code not recognised." (info-hiding preserved); nothing written |
| RPC `mark_attended` over PostgREST with the admin JWT, A | raw result `not_open_yet` (registration_id returned, other columns null) |
| Same RPC, C | `closed` |
| Same RPC, live and pre-open on two extra registrations | `ok` for both, one check-in, one evidence, one audit each; repeat gives `already` |
| Same RPC, other-org admin, A and B | `not_recognised` |
| `self_check_in` RPC with the service role, A (self-serve on) | `not_open_yet`; C: `closed`; nothing written. An authenticated JWT calling it gets HTTP 403 |
| `selfCheckIn` Server Action (public, no sign-in), A | "Check-in isn't open yet. It opens an hour before the event starts."; C: "Check-in for this event has closed. Please see a member of staff."; nothing written |
| `selfCheckIn`, registration on D inside the pre-open, self-serve on | `ok`; evidence `self_serve/live_checkin/weak`; 1 audit |
| Walk-in on B (admin) | `ok`. New row: `source = walk_in`, `user_id IS NULL`, status `attended`, `check_in_method = manual`, 1 check-in, 1 evidence, 1 audit, `email_log` `confirmation:skipped` |
| Walk-in on D (pre-open) | `ok`, same row shape |
| Walk-in as the other organisation's admin on C (ended), A (not open), B (live) | "You do not have access to this event." in all three; no lifecycle wording; no registration created |
| Walk-in as admin on A | "This event has not opened for check-in yet."; no registration row for that email |
| Walk-in as admin on C | "This event has ended — walk-in registration is closed."; no registration row (the em-dash is pre-existing copy, not changed by DB-02) |

## Not reached
- `no_matching_occurrence` (event with no occurrence rows), multi-occurrence gap, overlap and second-occurrence pre-open: covered by `checkin_window.rls.test.ts` per the card; I did not execute them.
- Exact boundaries (59 and 61 minutes before start, the end minute): not probed.
- Cancelled, unpublished and soft-deleted registrations or events through the new window: not probed.
- CPD credit issuance after a staff scan: the fixtures are not accredited events, so the award path was only seen skipping.
- Concurrency and rate-limit exhaustion: not probed.
- The browser desk (disabled controls, the status note): user lens.

## Environment notes
- At the start nothing listened on :3100 (the lock file named another agent). I did the DB, PostgREST and cookie work first, then waited. The coordinator started the server and told me to continue; I did not start or stop a server.
- Fixture codes first used `WK-DB02x`, which `isValidRegistrationCode` rejects (`0` is outside the alphabet, and 5 characters is neither 4 nor 6). The action answered "Invalid code format." I renamed them `WK-DB2xxx` (6 characters) and reran. The DB functions accept any string, which is why the earlier RPC probes passed with the old codes.

## Fixtures and cleanup
Created: 2 auth users (`db02bt-admin@`, `db02bt-other@` at `db02bt.invalid`), 2 staff rows (admin in the default organisation, other in the new `DB02BT other org`, slug `db02bt-other-org`), 5 published events (A not open, B live, C ended, D pre-open, E edited draft then published), 11 registrations (7 seeded or extra, 3 walk-ins, 1 on E), plus check-ins, evidence, `email_log` and `rate_limits` rows from the probes.

Removed in order: participation_evidence 7, registration_checkins 7, email_log 3, registrations 11, rate_limits 10, events 5 (occurrences cascade, 0 orphans), staff 2, organisation 1, auth users 2 (admin API DELETE, HTTP 200 each), scratch files (keys, JWTs, cookies, helper scripts).

Leftover counts: `events=0 staff=0 orgs=0 auth=0 registrations=0` (also `email_log=0`, `rate_limits=0`, orphan occurrences 0, orphan evidence 0).

Permanent audit residue (by design, hard rule 11): 15 `audit_events` rows tied to these fixtures: 7 `attendee_checked_in`, 7 `evidence_recorded`, 1 `event_published`. Other audit rows in the table come from peer sessions.

Repo: this review file is the only file I wrote in `/Users/ivan/Eventar`. `git status --porcelain` lists 82 entries from the shared tree (peer and card work, as at the start); none is a `db02bt` artefact. No git add, commit, stash or checkout.
