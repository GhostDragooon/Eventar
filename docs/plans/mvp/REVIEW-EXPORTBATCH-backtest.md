# REVIEW-EXPORTBATCH backtest lens

Commit under review: 0959370 (`lib/supabase/inBatches.ts`, batched id lookups in the export actions under `app/events/[id]/details/`, and a refusal when a read returns 1000 or more rows).
Lens: backtest. Real HTTP (Server Action over curl with the `Next-Action` header) on http://localhost:3100, real local Postgres (127.0.0.1:54322), real PostgREST/Kong on 127.0.0.1:54321. Run on 2026-10-24, 14:47 to 14:57 UTC.
Reviewer: backtest-lens subagent for the coordinator.

## Verdict

`exportAttendanceEvidence` works live after the fix. A 230-attendee event exports 230 rows and the decoded CSV matches a SQL join of the same event row for row (0 differences), including the rows that sit on the batch boundaries (100/101 and 200/201). The 101-row and 100-row controls match too. The 414 is real on this stack and happens at about 220 ids; 100 ids always pass. The 1000-row guard behaves at the exact edge: 999 rows exports, 1000 rows is refused. No defect in the fix. `exportCollegePackage` and `exportEventEvidence` were not reached (they need permanent ledger rows).

Count line (B/M/m/n): 0/0/1/2

## Findings

| ID | Severity | Route / function | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|---|
| EB-1 | minor | `exportAttendanceEvidence`, the `evidence.length >= MAX_ROWS` guard (exportAttendanceActions.ts) | The refusal counts evidence rows, not attendees, so a small multi-session event hits it. And its text sends the organiser to "Contact support for a bulk export", a path that does not exist (the executor's own Open question 2). Such an event cannot be exported at all. | Event with 100 registrations and 999 evidence rows (about 10 per person): export ok, rowCount 999. Add one more row (1000): `{"ok":false,"error":"This event has more attendance records than a single export can safely include. Contact support for a bulk export."}`. | Not for this fix. Paginate the primary evidence read with `.range()` (the follow-up the hand-back already proposes). Until then, reword so it does not promise a path that is missing. |
| EB-2 | nit (pre-existing, by design, not changed by the fix) | `canManageEvent` (lib/auth.ts line 27) | Any staff member of the event's organisation can export names and emails, not only the creator or an admin. | ux-member (role `organiser_member`, a different staff row from the event's creator ux-admin): export of the 230 event returned `ok:true, rowCount 230`. | Policy question for Ivan, outside this card. |
| EB-3 | nit (environment) | server on :3100 | The briefing said review mode is off. It is on (signed-out `/dashboard` returns 200; `scripts/demo/dev-local.sh` line 90 defaults `EVENTAR_REVIEW_MODE` to true). A signed-out call of the export action therefore succeeded (`ok:true`, rowCount 230) through the review-mode branch in `requireStaff` (lib/auth.ts line 129). This is the local-only bypass, not a hole in the fix, but it means I could not check "signed-out is refused" live. | Signed-out curl, no cookie: `ok:true, rowCount 230`. My authenticated calls carried a real session cookie, so they used the real staff lookup (the bypass applies only when no real cookie is present). | Tell the coordinator. For an auth-refusal probe, the server needs `EVENTAR_REVIEW_MODE=false`. |

## Verified OK

1. Setup: three published events in the default organisation, created_by ux-admin, each ended 1 hour ago, with registrations and `participation_evidence` check-in rows (type `check_in`, method `self_serve`, source `live_checkin`, strength `weak`): 230, 101 and 100 registrations, one evidence row each. Registration 001 of each event was named `EXP-BT Person, "Q" 001` to put a comma and quotes through the CSV writer.
2. Signed in as ux-admin@eventar-review.invalid by magic link: the login Server Action posted from curl, the mail read from Mailpit, the `auth/v1/verify` link followed with a private cookie jar. Landed on `/dashboard` with an `sb-127-auth-token` cookie.
3. Export results (HTTP 200 each, action id 408325485a8b703fbab654150352691f196a139210):
   - 230 event: `ok:true`, rowCount 230, 230 data rows in the decoded CSV, 12 columns. Compared with a SQL join (`participation_evidence` joined to `registrations`, ordered by `chain_seq`) on id, registration id, code, name, email, type, method, source, strength, captured_at (as UTC instants), occurrence id and chain_seq: 0 differing rows, same row count (230 = 230). No blank code, name or email cell in any row, so every batch's lookup filled its rows. The comma-and-quote name round-tripped.
   - 101 event (one more than a batch): rowCount 101, 101 rows, 0 differences, 0 blank cells.
   - 100 event (exactly one batch): rowCount 100, 100 rows, 0 differences, 0 blank cells.
   - Filenames as designed, for example `attendance-evidence-exp-bt-230-attendees-2d94a46a.csv`.
   - Time for the 230 export: 0.143 s total.
4. The 414 is gone, shown without reverting code. The old action put all ids in one `.in()`. Same PostgREST call (anon key, `registrations?select=id&id=in.(...)`, ids taken from the 230 fixture) at different sizes:
   - 100 ids, URL 3,762 chars: 200
   - 150 ids, 5,612 chars: 200
   - 200 ids, 7,462 chars: 200
   - 210 ids, 7,832 chars: 200
   - 220 ids, 8,202 chars: 414
   - 230 ids, 8,572 chars: 414
   So the old call for the 230 event (all 230 registration ids) was a 414, and the limit sits between 210 and 220 ids (about 8 KB). With the fix the same 230 ids go out as three requests of 100, 100 and 30 ids; each of those (offsets 0, 100, 200) returned 200. The 414 is the local gateway's; I did not check the hosted gateway's limit.
5. Row-cap guard at the exact edge (event with 100 registrations, evidence rows 10 per person): 999 rows gives `ok:true, rowCount 999`; after inserting the 1000th row, the next call gives the refusal quoted in EB-1. A nonexistent event id gives `{"ok":false,"error":"Event not found."}`.
6. Authorisation with a real session: ux-admin (organiser_admin, same organisation) is allowed; ux-member (organiser_member, same organisation) is also allowed (EB-2). A staff member from a different organisation was not tried.

## Not reached

- `exportCollegePackage` and `exportEventEvidence`: both need `credit_ledger` rows, which are permanent (hard rule 11). I created none, so their batching is covered only by the unit tests in `exportBatching.test.ts` and was not exercised live by me.
- A failed batch failing the whole export: needs a lookup to fail mid-export; I did not break the shared local database or grants to force it. Unit tests only.
- More than three batches live. The largest live run was 230 registrations (3 batches). The most the guard allows is 999 distinct registrations (10 parallel batches); not run.
- Signed-out refusal and a cross-organisation refusal (EB-3, EB-2).
- Hosted gateway behaviour; local stack only.

## Fixtures and cleanup

Created: 4 events `EXP-BT 230 attendees`, `EXP-BT 101 attendees`, `EXP-BT 100 attendees`, `EXP-BT cap1000 event`; 531 registrations (emails `exp-bt-...@eventar-review.invalid`, codes `EXPBT...`); 1,431 `participation_evidence` rows (431 + 1,000). Also 100 `EVL-BT` events for the other hand-back. All deleted in one transaction at the end (DELETE counts 1,431 evidence, 531 registrations, 104 events).

Residue by prefix after cleanup: events `EXP-BT%` and `EVL-BT%`: 0. Registrations with `exp-bt-` email or `EXPBT` code: 0. `participation_evidence` total 385, the same as before I started. `audit_events` rows created since 14:45 UTC: 0, so no audit rows came from my work (the export actions write none). `events` total 263 vs 262 at start: one row is "DB-04 live check draft", created at 14:51:53 by another session.

Permanent or shared residue: GoTrue `auth.audit_log_entries` rows for two magic-link sign-ins and two sign-outs (inferred, not queried). Both sessions were logged out (HTTP 204). My two Mailpit messages were deleted. Cookie jars, decoded CSVs and scratch scripts were deleted. No server started or stopped; the coordinator's lock file untouched.
