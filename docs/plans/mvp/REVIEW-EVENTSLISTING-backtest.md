# REVIEW-EVENTSLISTING backtest lens

Commit under review: b5696ca (public listing `app/(public)/events/page.tsx` now filters `end_time >= now` in the query, before `.limit(100)`).
Lens: backtest. Real HTTP on http://localhost:3100 and real local Postgres (127.0.0.1:54322). No code read beyond the page, its previous version, `lib/lifecycle/eventLifecycle.ts`, `lib/auth.ts`, and the sibling pages named below. Date of run: 2026-10-24, 14:47 to 14:57 UTC.
Reviewer: backtest-lens subagent for the coordinator.

## Verdict

The fix works against the live system. With 227 past published events in the local database (more than the 100 cap), `/events` shows exactly the upcoming and live events, in start order, and drops none of the soonest ones until the 100 cap is passed. The old query shape reproduces the original bug on this same data (0 upcoming among the first 100 rows). One real sibling of the same bug is still open and live: the staff check-in picker (`/checkin`, finding EL-1). The fix itself has no defect.

Count line (B/M/m/n): 0/1/2/1

## Findings

| ID | Severity | Route / function | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|---|
| EL-1 | Major (pre-existing sibling of the fixed bug, not part of b5696ca) | `app/checkin/page.tsx` lines 38 to 46, GET `/checkin` | Same shape as the fixed bug: `.eq('status','published').order('start_time', asc).limit(100)` runs first, the lifecycle filter (`live`, `upcoming`, `registering`) runs afterwards in JavaScript. The door-picker shows "No open events. Check-in unlocks 60 minutes before an event starts." while upcoming and live events exist. | Signed in as ux-admin (organiser_admin, default organisation): GET /checkin returned 200 with the empty message and 0 links of the form `/events/<id>/checkin`. SQL for the same organisation: 232 past and 117 upcoming published events; among the first 100 by start ascending, upcoming = 0. Fixture "EVL-BT live-now" (live at that moment) and "EVL-BT starts-in-10min" were both absent (0 occurrences in the HTML). | Put the cut in the query as b5696ca did: `.gte('end_time', new Date(nowMs).toISOString())` before `.limit(100)` (move `nowMs` above the query). Keep the JS lifecycle filter. |
| EL-2 | minor (pre-existing, now more visible) | `app/(public)/events/page.tsx` line 54, `.order('start_time')` | No tiebreaker. Events with identical `start_time` come back in a different order on different requests or roles. At the 100 cap, a tie that straddles the 100th place can make which event drops change from one reload to the next. | Signed-in page vs the same query sent to PostgREST with the anon key: same 100 ids (set equal), but order differs where start_time is identical: positions 17/18 (two rows at 2026-10-27 14:48:04.292648) and 24 to 27 (rows at 2026-12-11 01:00:00 and 2026-12-14 01:00:00). Two signed-out loads in a row were identical, so the flip depends on the path, not on every request. I did not build a tie across the 100th place. | Add `.order('id', { ascending: true })` as the second key. |
| EL-3 | minor (known ceiling, documented in the code comment) | `app/(public)/events/page.tsx`, `.limit(100)` | Past 100 upcoming or live events the furthest-future ones disappear from the public site with no sign that there are more (no "more events" link, no paging). | 118 qualifying events (23 real + 5 boundary + 90 fixtures): page showed 100; fixtures cap-001 to cap-072 shown, cap-073 to cap-090 (18 events) not shown. | None needed for this fix. Track pagination or a "load more" for when the real catalogue approaches 100. |
| EL-4 | nit (environment, not a product defect) | server on :3100 | The briefing said review mode is off. It is on: signed-out `/dashboard`, `/events/new` and `/events/<id>/details` all returned 200 with no cookie, and `scripts/demo/dev-local.sh` line 90 defaults `EVENTAR_REVIEW_MODE` to true. Per the page comment, review mode makes the signed-out public listing use the service-role client, so my signed-out GET /events did not go through anon RLS. | Gap closed by running the page's exact query against PostgREST with the anon key (RLS on): 100 ids, same ids and same order as the signed-out page. | Tell the coordinator; no code change. |

## Verified OK

1. Baseline before any fixture: signed-out GET /events returned HTTP 200, 114,350 bytes, 23 distinct event links. SQL (`status='published' and deleted_at is null and end_time >= now()`) gave 23. The 23 ids in the HTML and the 23 from SQL were identical in the same order (`diff` clean).
2. The data already reproduces the original bug: 227 past published events at baseline (228 later, after the "ended 1 minute ago" fixture). The old shape, the first 100 published rows by start ascending, contains 0 rows with `end_time >= now` (SQL: `0|100`). The fixed page shows the upcoming ones.
3. Boundary fixtures (all prefix `EVL-BT`, default organisation), fetched at 14:48:04 UTC:
   - ended 1 minute ago (published): not shown.
   - ends in 1 minute (published): shown at 14:48:04; re-fetched at 14:49:11, after its end_time (14:49:04.29), it was gone. The cut moves with the clock.
   - live now (started 30 min ago, ends in 30 min): shown.
   - starts in 10 minutes (inside the 60-minute check-in window): shown.
   - soft-deleted upcoming: not shown.
   - draft upcoming: not shown.
   - cancelled upcoming: not shown (status filter).
   - status `completed` with a future end_time: not shown.
   - registration opens in the future (event in 3 days): shown (lifecycle `upcoming`).
   - registration already closed (event in 3 days): shown (lifecycle `upcoming`).
   - Page total 28 = 23 real + 5 shown fixtures; ids and order equal to the SQL result.
4. Cap: with 90 extra upcoming fixtures (`EVL-BT cap-001` to `cap-090`, starting 2027-01-01, hourly), 118 events qualified. The page rendered exactly 100 cards, 100 distinct ids, identical ids and order to `order by start_time asc limit 100`. cap-001 and cap-072 present, cap-073 and cap-090 absent. The soonest events survive; only the furthest-future fall off, as the code comment says.
5. Anon RLS path: the page's query sent with the anon key (status, deleted_at, end_time and order filters, limit 100) returned 100 rows, same ids and order as the signed-out page.
6. Signed-in path (real session cookie for ux-admin, so the cookie-bound client): 200, 100 cards, same set as the anon query (order differs only on ties, EL-2).
7. Past-events view: none before or after. `git show b5696ca^:app/(public)/events/page.tsx` filtered the same three lifecycles in JavaScript and rendered no past list; the directory holds only `[id]/`, `EventsListClient.tsx`, `page.tsx`, `page.test.ts`. Nothing regressed.
8. `end_time >= now` and `computeLifecycle` agree: lifecycle is `completed` only when `now > end_time`, so every row the query returns survives the JS filter unless it is draft, cancelled or completed by status (none are, given the `published` filter).

## Not reached

- The exact instant `end_time == now` (sub-millisecond, cannot be hit over HTTP). Query uses `gte`; lifecycle uses `>`; they agree by reading.
- A tie in `start_time` straddling the 100th position (would need a second set of fixtures); EL-2 is shown only on ties inside the first 100.
- True anon behaviour of the page itself (the server is in review mode, EL-4); covered by the same query over PostgREST with the anon key.
- Hosted or production behaviour; local stack only.

## Fixtures and cleanup

Created, all in the default organisation (00000000-0000-0000-0000-000000000001), created_by ux-admin's staff id: 10 boundary events `EVL-BT ...` and 90 events `EVL-BT cap-001..090`. All deleted at the end in one transaction (together with the export fixtures, see the other hand-back).

Residue by prefix after cleanup: events with title `EVL-BT%` or `EXP-BT%`: 0. Registrations with `exp-bt-` email or `EXPBT` code: 0. `participation_evidence` total 385, equal to the count before I started. `audit_events` rows created since 14:45 UTC: 0 (no audit-writing action ran). `events` total is 263 against 262 at the start: the extra row is "DB-04 live check draft" created at 14:51:53 by another session, not mine (I inserted and deleted 104).

Permanent or shared residue: GoTrue `auth.audit_log_entries` rows for two magic-link sign-ins and two sign-outs (inferred; I did not query that table). Both sessions were logged out (HTTP 204 each). My two Mailpit messages were deleted; the private cookie jars and scratch files were deleted. No server was started or stopped; the coordinator's lock file was not touched.
