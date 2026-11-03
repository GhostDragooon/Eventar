# REVIEW R3 — Backtest of the fix-round server actions and RPCs

Date: 2026-11-03. Lens: backtest only (no browser, no source edits). Target: local stack, dev server :3100, review mode OFF.
Method: disposable fixtures `ZZ-RB3-*` (2 orgs, 7 staff rows with real auth users and session cookies, 5 events, registrations). Every action was called over HTTP with the real `Next-Action` header and a real signed-in cookie; every result was read back from the local DB (`127.0.0.1:54322`).
Tags: [X] executed and read back, [R] read from source only, [I] inferred.
Tool calls used: about 36 of 60.

Verdict summary: 6 of 7 items PASS. One MAJOR: `createEvent` does not store the start-order `display_order` that its comments promise (item 2).

---

## Findings (ranked)

### MAJOR

**M1. `createEvent` does not make `display_order` follow start order [X]**
- Where: `app/events/new/actions.ts:127-137`, `create_event_with_blocks` (local definition, line ~80: `coalesce((block->>'display_order')::int, 0)`).
- The action sorts the array with `startOrder`, and the comment says "display_order is the position in this array". For create it is not: the RPC stores the client's `display_order` field (zod default 0). Only the INSERT order changes, which guarantees nothing when a reader sorts by `display_order`. `update_event_with_blocks` does the right thing (`display_order = v_idx`), so create and update disagree.
- Evidence (executed):
  - Payload B(10:00) A(09:00) C(09:00, same instant, `.000Z` spelling) D(11:00), no `display_order` field: stored `display_order` = 0,0,0,0 (a tie, order unspecified). It read back A,C,B,D only by heap luck.
  - Same payload with the form-style `display_order: i` in payload order (B=0, A=1, C=2, D=3): stored B=0, A=1, C=2, D=3. Ordered by `display_order` the agenda reads B,A,C,D. It should be A,C,B,D.
- Reach: the real `NewEventForm` pre-sorts with `sortBlocksByStart` and sends `display_order: i`, so the form path is correct today. The server-side sort is therefore a no-op for create, and any stale client, second form, or hand-built call that sends an unsorted array gets a wrong stored order, which is exactly what the server sort was added to prevent. Rule 5 (deterministic code owns the invariant) is not met on the create path.
- Proposed fix (not applied): in `createEvent`, overwrite `display_order` with the sorted index (`orderedBlocks.map((b, k) => ({ ...b, display_order: k }))`), mirroring what the update RPC does. One line plus a test that posts an unsorted array with conflicting `display_order` values.

### MINOR

**m1. Speaker check-in and un-check-in leave no audit row [X] / [I]**
- After 3 attendee check-ins and 3 contact edits, the audit delta contained no speaker rows. Four speaker toggles (set, clear, and a cross-org attempt) added 0 audit events. This is consistent with the existing design (speaker_checkins is not an audited-mutation table), so it is not a regression of this round. Flagged only because Ivan's ruling is "attendance must not change quietly"; a toggle that clears a speaker's check-in is silent apart from `updated_by`. Decision for Ivan, not a defect in the fix round.

**m2. A refused multi-occurrence walk-in leaves a counted, unchecked registration [X]**
- Item 5 behaves as designed (see below), but the row occupies capacity and appears on the roster until staff finish it by code. The message tells staff so. Noted for completeness; no change proposed.

### NIT

- n1. `markAttended` writes two audit rows per check-in (`attendee_checked_in` and `evidence_recorded`). Expected; noted so the audit-delta arithmetic in future backtests is +2 per check-in, not +1.

---

## Item-by-item results

### 1. Speaker check-in role gate — PASS [X]
Fixture: published event E1, one agenda host "ZZ Speaker One", staff in one org with roles organiser_admin, organiser_member, body_admin, auditor, eventar_staff, plus an organiser_admin of a second org.
| Call | Result | DB read-back |
|---|---|---|
| body_admin toggle | `{"error":"Your role cannot check people in. Ask an organiser admin or member."}` | `speaker_checkins` rows = 0 |
| auditor toggle | same message | rows = 0 |
| organiser_member toggle | `{"ok":true,"checkedInAt":"..."}` | row exists, `checked_in_at` set, `updated_by` = member |
| organiser_admin toggle again | `{"ok":true,"checkedInAt":null}` | `checked_in_at` null, `updated_by` = admin |
| eventar_staff toggle | ok | row created |
| name not on agenda | "That name is not a speaker on this event's agenda." | no write |
| other-org organiser_admin, row exists | `{"error":"You do not have access to this event."}` HTTP 200 | row unchanged |
| other-org organiser_admin, no row | same message HTTP 200 | rows = 0 |
- The 42501 path was reached for real: E1 is published, so `agenda_blocks_public_read_when_event_published` lets the other org read the blocks and pass the name check, then `speaker_checkins_org_member_insert` WITH CHECK refuses. The action returned the NO_ACCESS message with HTTP 200, not a 500.

### 2. Agenda sort — createEvent FAIL on stored order (M1), updateEvent PASS, missing start PASS
- createEvent, unsorted payload, no `display_order` [X]: redirect to `/edit?saved=1`; stored display_order 0,0,0,0 (tie). FAIL against "ordered by display_order = start order".
- createEvent, unsorted payload with `display_order: i` [X]: stored B,A,C,D by display_order. FAIL (see M1).
- updateEvent on a draft, payload order D(11:00), N(new, 08:30), B(10:00), A(09:00), C(09:00 same instant, different ISO precision) [X]: `{"ok":true,"blockIds":[...]}`. Stored display_order: 0 N, 1 A, 2 C, 3 B, 4 D. Equal starts stable (A before C, payload order). `blockIds` in payload order mapped to the right rows: D, N, B, A, C ids matched row titles one for one. PASS. The numeric-instant compare held for `...09:00:00Z` vs `...09:00:00.000Z`.
- Missing start [X]: createEvent with no `start_time` and with `start_time: ""` both return `block 0.start_time: Every agenda block needs a start time.`; 0 blocks and no extra event written. updateEvent with a missing start returns the same message; the block list stayed at 5 and the rename in that payload was not applied. PASS.
- Note: the message arrives prefixed with `block 0.start_time: ` (from `zodErrors`), not the bare sentence quoted in the brief. The sentence is there; the prefix is an existing convention. [X]
- Offset timestamps (`+08:00`) were not tested: `blockInputSchema` uses `.datetime()` without `offset`, so they are rejected before sorting [R].

### 3. markAttended method and idempotency — PASS [X]
- Methods `"bogus"`, `"QR"`, `null`, `"manual; drop"`: all `{"error":"Invalid check-in request."}`; `registration_checkins` rows = 0, attended = 0, audit and ledger unchanged.
- body_admin and auditor with a valid code: role message; no rows.
- organiser_admin `manual`: ok; 1 `registration_checkins` row (method manual), registration `attended`, `check_in_method` manual.
- Repeat `manual` and repeat `qr` on the same code: `Already attended.` with the original timestamp; rows still 1.
- organiser_member `qr` on a second code: ok; 1 row, method qr. Final state: two registrations attended, one registered, exactly one checkin row each.

### 4. Walk-in by body_admin (no orphan) — PASS [X]
- body_admin and auditor walk-in on E1, body_admin on E2: role message each. Registrations on E1 stayed 3, on E2 stayed 0; `email_log` 0; no walk_in rows anywhere. The insert-first-then-gate defect is gone.
- Control: organiser_admin walk-in on E1: ok, registration `walk_in`, `attended`, 1 checkin row, `email_log` status `skipped`.

### 5. Multi-occurrence walk-in, no session open — PASS (expected state) [X]
- Event E2 live by its envelope; session 1 ended, session 2 opens in 7 hours. organiser_admin walk-in returned: "ZZ Walk MO was registered (code GDZ338) but not checked in. No session is open for check-in right now. When one opens, use Enter code with GDZ338 to finish."
- Row state: 1 registration, `source = walk_in`, `status = registered`, `check_in_at` null, 0 `registration_checkins`, 1 `email_log` row with status `skipped`. No audit rows from this call.

### 6. `update_registration_contact` email lock — PASS [X]
- Attended, unlinked registration, email change via the action: the "already checked in" message; email unchanged in the DB; audit count unchanged.
- Raw RPC call (service role, actor override) for the same case: HTTP error body `code 22023`, `details "email_locked_attended"`, message prefix `email_locked_attended:`.
- Name-only change on the attended registration: ok; name updated; audit payload `{"fields": ["full_name"]}` with no hash keys.
- Non-attended registration, email change (mixed case input): ok, stored lower-cased; audit payload `{"fields":["email"],"email_before_sha256":...,"email_after_sha256":...}`. Both hashes equal the sha256 of the lower-cased old and new address computed independently in SQL.
- Name and email together on a non-attended registration: `fields ["full_name","email"]` plus both hashes; `email_before` chained to the previous `email_after`.
- No-op (same name and email): ok, no audit row (3 contact audit rows total for 4 successful calls, one being a no-op).
- Plaintext scan of those audit payloads for `@` or `example.test`: 0 matches.
- Second lock branch (`registration_checkins` row exists while `status` is still `registered`, set up as superuser on the multi-occurrence walk-in): email change refused with the same message; email unchanged. Both arms of the OR are live.

### 7. Nothing moved quietly — PASS [X]
- `credit_ledger`: 764 before, 764 after; 0 rows created since the fixture org existed. Check-in credit summary lines were empty for the unlinked registrations (no credit attempted to post).
- Audit delta from all calls: `attendee_checked_in` 3, `evidence_recorded` 3, `registration_contact_updated` 3 (all with `subject_id` = the fixture registrations). Nothing else. No attendance, email or credit change happened without an audit row, except the speaker toggles noted in m1.
- Refused calls (bad method, wrong role, locked email, missing start, cross-org) produced 0 audit rows and 0 data changes.

---

## Cleanup and residue
- Deleted: 5 events (cascade: blocks, occurrences, registrations, checkins, speaker rows, email_log), 3 participation_evidence rows (superuser, `session_replication_role = replica`, because they reference registrations without cascade), 7 staff rows, 2 organisations, 6 auth users (admin API, HTTP 200 each), 3 `rate_limits` rows keyed to the fixture staff ids, scratch cookie files.
- Verified zero left: organisations, staff, events, registrations, auth users for `zz-rb3`.
- Permanent residue (expected): 9 `audit_events` rows (hash-chained, append-only; chain total 68519 -> 68528). `credit_ledger` unchanged at 764.
- Repo untouched by me: `git status --porcelain` before and after differ by one line, `docs/plans/mvp/REVIEW-R3-organiser-user.md`, written by the parallel user-lens agent. No source file was edited. This report is the only file I added.
- Scratch scripts and the cookie minter live in the session scratchpad, not the repo.

## Verified by execution vs not
- Executed: every row in the tables above.
- Read only: the `+08:00` timestamp rejection (schema), the claim that the real form pre-sorts (`NewEventForm.tsx:451-461`), and which RPC line stores `display_order` on create (checked in the local function definition via `pg_get_functiondef` and by the stored rows).
- Not covered: review-mode behaviour (OFF per brief), HTTP-level concurrency races, the Resend path (stubbed).
