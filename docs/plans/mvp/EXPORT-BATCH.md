# EXPORT-BATCH Export actions batch their id lookups, so an event with more than about 220 attendees can be exported
STATUS: DONE (code, tests, gates and live check). Not yet reviewed by the dev, user and backtest lenses: this executor did not run them, the coordinator's protocol does.
Changed: lib/supabase/inBatches.ts (new: `idBatches`, `selectInBatches`, `MAX_ROWS`), app/dashboard/data.ts (imports `idBatches` from the new file instead of defining it; nothing else), app/events/[id]/details/exportAttendanceActions.ts, exportCollegeActions.ts, exportEvidenceActions.ts, exportBatching.test.ts (new).
Origin: CX-04 review, dev F8 / "Needs Ivan" item 9. The old shape sent every id in one `.in()`; about 220 uuids make a 9 KB URL and the gateway answers 414, so the organiser saw "Could not load ... Please try again" for an export that could never succeed.

## What changed
- `idBatches` moved out of `app/dashboard/data.ts` (it was module-private) into `lib/supabase/inBatches.ts`, with a 15-line `selectInBatches(ids, run)` beside it: one request per 100 ids, `Promise.all`, rows merged, the first error returned with no rows. Callers keep their existing `if (res.error)` branch and their error copy. `countCreditsIssued` and the registrations lookup in data.ts use the same `idBatches` as before [X, data.test.ts 9/9 still pass].
- exportAttendanceActions.ts: the registrations lookup (`.in('id', regIds)`) is batched.
- exportCollegeActions.ts: users, professional_profiles, practitioner_licences, registrations and participation_evidence lookups are batched (the five `.in()` the card names). The evidence cap check moved inside the batch callback, so it still fires when one request reaches 1000 rows and does not fire when three batches merely add up past 1000.
- exportEvidenceActions.ts: the `practitioner_licences` lookup (line 232) is batched.
- Not batched on purpose: `accrediting_bodies` lookups (college line 119, evidence lines 171 and 223). Their ids are the distinct accrediting bodies of one event's ledger, a handful by construction, far under 100 [R].

## Row-cap ceiling (PostgREST `max_rows = 1000`, supabase/config.toml:18)
A batch is still cut at 1000 rows without an error. Which reads can reach it:
- Id-keyed lookups on a unique column (registrations by id, users by id, licences by id, profiles by user_id, bodies): at most 100 rows per batch. Cannot [R].
- college `registrations` by (event_id, user_id): unique per (event_id, email), so a user could hold a few rows; 100 users would need about 10 each. Cannot in practice [I].
- college `participation_evidence` by user_id: can (a multi-occurrence event writes several evidence rows per practitioner; 100 users x 10 rows). It already had a deliberate rule: best-effort enrichment, so log and go on. Kept, now checked per batch. See Open question 1.
- The two primary reads that feed the id lists were unbounded and unguarded: attendance `participation_evidence` by event (any event with 1000 or more evidence rows came back as a silent 1000-row file) and evidence-export `credit_ledger` by event (same). These CAN reach the cap, so each now fails visibly when the read returns 1000 or more rows: "This event has more attendance records / credit records than a single export can safely include. Contact support for a bulk export." (the college wording). One check on the all-rows ledger read covers the per-body ledger read, which is a subset. Behaviour change: an event with 1000 or more such rows used to export a short file and now gets a refusal. See Open question 2.
- `ponytail:` comment in lib/supabase/inBatches.ts names the ceiling and the upgrade path (`.range()` pagination).

## Tests added or changed
All in `app/events/[id]/details/exportBatching.test.ts` (14 tests). A fake admin client applies eq/in and records every `.in()` list; the Nth `.in()` of a named table can be made to fail.
- exportAttendanceEvidence: "asks in batches of at most 100 ids and still names every attendee" (250 attendees: no list over 100, all 250 ids sent once, CSV has 251 lines and each row carries its own code, name and email); "a failing batch fails the export, even when it is not the first batch" (second registrations batch fails: ok false, no csvBase64); "refuses a 1000-row evidence read (it may have been cut) and accepts 999".
- exportCollegePackage: "asks in batches of at most 100 ids and still fills every row" (250 practitioners: no list over 100, each of the five tables got every id once, every row has its code, name, licence number and an evidence time); "a failing second <table> batch fails the export" for each of users, professional_profiles, practitioner_licences, registrations, participation_evidence; "does not log when only the merged total passes 1000"; "logs once, and still exports, when one batch reaches 1000".
- exportEventEvidence: "asks in batches of at most 100 ids and still fills every licence number"; "a failing batch fails the export, even when it is not the first batch"; "refuses a 1000-row ledger read (it may have been cut) and accepts 999".
- Fail-first [X]: run against the unfixed actions, all 12 tests of the first version failed (250-id list; no second batch to fail; no 1000-row refusal). The 2 evidence-cap tests were added after the fix and are covered by the mutants below.
- Mutants, each applied alone, test run, file restored, `cmp` byte-identical every time [X]: batch size 100 to 1000 in `idBatches` (11 fail: 3 size tests, 7 second-batch tests, 1 merged-total log test); error check `results.find((r) => r.error)?.error` to `results[0]?.error` (7 fail: every second-batch test); attendance guard `>= MAX_ROWS` to `>` (1 fails); evidence guard `>=` to `>` (1 fails); college cap log condition to always true (2 fail); to never true (1 fails).

## Gates [X]
tsc --noEmit clean · eslint 0 errors, 11 warnings, none in a file this card touches (eslint on lib/supabase/inBatches.ts, app/dashboard/data.ts, app/events/[id]/details/ prints nothing) · vitest plain 204 files passed, 49 skipped; 1804 tests passed, 464 skipped, 0 failed. `next build` and `pnpm test:rls` NOT run: the coordinator holds them for DB-04.

## Live check [X] (local stack, :3100, `ux-admin@eventar-review.invalid`)
- Fixture: event `EXP-BATCH event` (published, ux-admin's organisation) with 260 registrations `EXP-BATCH Person n` and 260 `participation_evidence` rows, inserted with local psql.
- Old call shape against the local gateway: one `.in()` with the 260 registration ids gives HTTP 414; the same call with 100 ids gives HTTP 200. So the local stack reproduces the bug.
- Signed in with a magic-link token minted from the local GoTrue admin API (no Mailpit mail), session cookie held in a 600-mode scratch file. `exportAttendanceEvidence` invoked as a Server Action over HTTP on `/events/<id>/details`: `{"ok":true,...,"rowCount":260}`. The CSV was decoded and diffed against a SQL join of the same event ordered by chain_seq: 260 rows, 0 diff.
- `exportCollegePackage` and `exportEventEvidence` were called on the same event: both returned their normal "No credit has been posted for this event yet" refusal. Their batching is covered by the unit tests only: a live run needs `credit_ledger` rows, which are permanent and cannot be deleted (hard rule 11), so none were created. NOT live-verified.
- Cleanup: session logged out (HTTP 204); events, registrations and evidence for the fixture are 0; `participation_evidence` is back to its 376 rows from before the run; scratch cookie, token and decoded files deleted. Permanent residue: `auth.audit_log_entries` rows from the magic-link sign-in and sign-out (shared table); app `audit_events` untouched [I: no audit-writing action ran].

## Siblings of the 414 bug (grep of every `.in(` under app/, lib/, components/, evidence/src)
- app/account/actions.ts:526 and :588 (the card's "report, fix only if trivial"): both id lists come from queries ending in `.limit(100)` (registrations at line 499, credit_ledger at line 569), so at most 100 ids, about 3.7 KB. They cannot return 414. No change [R]. :425 and :578 are accrediting-body ids from the same capped rows.
- app/checkin/page.tsx:58 and app/analytics/page.tsx:52,53: ids from events queries ending in `.limit(100)`. Cannot [R].
- app/dashboard/page.tsx:121: `attentionEventIds` is `.slice(0, 60)`. Cannot [R]. app/dashboard/data.ts: the two other sites were fixed in CX-04.
- app/events/[id]/details/page.tsx:255, app/events/[id]/edit/page.tsx:179, lib/cpd/authorisedBodies.ts:55, app/account/actions.ts:977: body ids, society codes, constant status lists. Small by construction.
- app/events/[id]/checkin/page.tsx:78 already avoids a registration-id `.in()` on purpose (comment there).
- evidence/src has no `.in(`. `SupabaseParticipationSource` (evidence/src/ledger/participationSource.ts:121,133) reads registrations and credit_ledger by event with no limit and no guard, so the Q2 orchestrator behind the evidence JSON can hit the same silent 1000-row cut. Not touched (outside the three files). See Open question 2.
After this card, no `.in()` in app/, lib/ or components/ takes an id list that can pass about 100 other than the batched ones [R].

## Deviations from the card and why
1. The two 1000-row refusals (attendance evidence read, evidence-export ledger read) are new behaviour. The card said to add one where a query can reach the cap, and these two can, so I added them. Drop: delete the `if (... >= MAX_ROWS)` block in exportAttendanceActions.ts and the one in exportEvidenceActions.ts, and the two "refuses a 1000-row" tests.
2. `idBatches` was moved, not exported in place: data.ts loses 7 lines and gains an import. Chosen over exporting from `app/dashboard/data.ts` so the export actions do not import from the dashboard module. Revert: put the function back in data.ts.
3. The college evidence enrichment keeps "log and continue" rather than failing, against the card's "fail visibly rather than silently truncating". Reason in Open question 1.

## Open questions for Ivan
1. College export, evidence columns: when one batch of 100 practitioners has 1000 or more evidence rows, the export still succeeds, with a server log line only, and some practitioners' evidence cells are blank. The credit rows themselves are complete. That was the earlier author's documented choice ("best-effort enrichment"), so I kept it. The card asked for a visible failure. Options: (a) keep as is; (b) fail the export with the same "Contact support" message (3 lines; the cost is that a multi-occurrence event with 10 or more evidence rows per practitioner cannot be exported at all); (c) paginate the evidence read with `.range()` so nothing is cut. I recommend (c) in a later card; (b) if the file goes to a regulator before then.
2. The "Contact support for a bulk export" message sends the organiser to a path that does not exist. Events with 1000 or more attendance or ledger rows cannot be exported at all (attendance, evidence) or at all beyond the ledger rows (college, already so before this card). Recommend one card that paginates the primary reads (attendance evidence, the ledger reads in the evidence export, and `SupabaseParticipationSource`) with `.range()`; the batching helper here is the right place for a `selectAllPages` sibling.

## Needs from other cards
None. data.ts is CX-04's file; the change there is the import swap only.
Executor: Claude (side session b3b257, asked by the MVP execution coordinator), 2026-10-24.
Committed:
Suggested commit message: fix(export): attendee, licence and practitioner lookups run in batches of 100 ids, so an event with more than about 220 attendees can be exported; a 1000-row read is refused instead of exported short
