# REVIEW-EXPORTBATCH-dev: dev-lens review of 0959370 (batched export lookups, 1000-row refusal)

Reviewer: dev lens (code and tests only; no browser, no build, no RLS suite, nothing against Seoul). 2026-10-24.
Commit reviewed: 0959370 "fix(export): lookups run in batches of 100 ids...". Files read in full: `lib/supabase/inBatches.ts`, `app/events/[id]/details/exportAttendanceActions.ts`, `exportCollegeActions.ts`, `exportEvidenceActions.ts`, `exportBatching.test.ts`, `app/dashboard/data.ts` (import swap), `evidence/src/ledger/participationSource.ts` (reads), `docs/plans/mvp/EXPORT-BATCH.md`.
Evidence tags: [X] executed by me, [R] read, [I] inferred.

Verdict: the batching is correct and complete for every id list that can grow. A failed batch fails the whole export in all three actions. No blocker and no major. The findings are about the new 1000-row refusal (honest but not actionable), two silent 1000-row cuts that sit just outside the diff but weaken the "regulator file is never short" claim, and small test and constant hygiene items.

## Findings

| ID | Severity | File:line | Finding | Evidence | Suggested fix |
|---|---|---|---|---|---|
| X1 | MINOR | `exportAttendanceActions.ts:48`, `exportEvidenceActions.ts:164` (same wording already in `exportCollegeActions.ts:95`) | The refusal message "Contact support for a bulk export" names a path that does not exist (the hand-back admits it, open question 2). It also does not say the limit or what is counted: attendance counts evidence rows, not attendees, so a two-occurrence event is refused at about 500 attendees. Events with 1000 or more rows cannot be exported at all from this surface. The message is honest (it does not pretend success) but the organiser cannot act on it. | [R] | Preferred: add `selectAllPages` beside `selectInBatches` (`.range()` loop ordered by `chain_seq`) and drop the refusal. Otherwise state the limit ("exports are limited to 999 rows; this event has 1000 or more") and name a real contact. |
| X2 | MINOR | `participationSource.ts:120-125`, stamped at `:168` (called from `exportEvidenceActions.ts:203`) | Silent 1000-row cut remains inside the evidence export, and the new guard lets it through. `listEntries` reads `registrations` for the event with no limit and no guard, then stamps `registration_count` and `checkin_count` on every entry in the JSON. An event with 1200 registrations and 300 credit rows passes the new ledger check (300 < 1000), and the regulator JSON carries `registration_count: 1000` with a matching cut `checkin_count`. Because both counts come from the same cut list the agent's overflow check cannot fire. The new comment at `exportEvidenceActions.ts:161-162` and the commit message read as if the file is guarded. Pre-existing and disclosed in the hand-back, not caused by this commit; recorded here because the guard creates false assurance. Local data cannot reproduce it (largest event has 230 registrations). | [R] | Same card as X1: paginate that read, or refuse when `regs.length >= MAX_ROWS`. |
| X3 | MINOR | `participationSource.ts:147` (`rpc('verify_ledger_chain')`) | `verify_ledger_chain` returns the whole ledger as a set (`TABLE(chain_seq, link_valid, content_valid)` [X]). PostgREST applies `max_rows` to set-returning RPC results, so once the ledger passes 1000 rows in total (local: 405) entries past the cut get `chain_verified` null, shown as `unknown` / human review. That degrades visibly (not a false "yes"), but every export after that point loses chain verdicts for recent entries. Not in the diff; nothing in the hand-back mentions it. I could not execute it: reaching 1000 ledger rows needs permanent rows (hard rule 11). | [X] function signature; [I] cut behaviour | Verify on a scratch stack with 1001 ledger rows; if confirmed, pass `.range()` or move the per-event verdict into SQL. |
| X4 | MINOR | `exportCollegeActions.ts:150-157` | College evidence enrichment still logs and continues when one batch returns 1000 rows. The card asked for a visible failure; the executor kept the earlier author's "best-effort" rule and asked Ivan (open question 1). Now that the read is per batch of 100 practitioners it needs about 10 evidence rows per practitioner to trigger, so it is unlikely. The log line is the only signal; the organiser sees a complete-looking file with blank evidence cells. Listed so the decision is not lost; recommended option (c) pagination fits X1. | [R] | Ivan's call per open question 1. |
| X5 | NIT | `exportBatching.test.ts` / `exportCollegeActions.ts:93` | The college ledger refusal `ledger.length >= EXPORT_ROW_LIMIT` has no test. Mutant B9 (replace the condition with `false`) passes all 14 tests. It is the gate that keeps every batch loop at 10 requests or fewer (ledger under 1000 means under 1000 ids). Pre-existing code, but now load-bearing. | [X] mutant B9 survives | One test: 1000 ledger rows returns `ok: false`, 999 passes through batching. |
| X6 | NIT | `lib/supabase/inBatches.ts:20-25` | `selectInBatches` does not de-duplicate ids, so "the batches add up to the unbatched result" holds only for unique ids. Mutant B10 (doubled id list) returns duplicate rows and fails 4 tests, which shows the tests would catch it, but no test feeds duplicates through a caller. All five call sites build their lists with `new Set` [R], so this is latent. | [X] mutant B10; [R] call sites | `[...new Set(ids)]` inside `selectInBatches` (one line). |
| X7 | NIT | `inBatches.ts:4`, `exportCollegeActions.ts:58`, `supabase/config.toml:18` | The same cap is written three times: `MAX_ROWS = 1000`, college `EXPORT_ROW_LIMIT = 1000`, and the config. The comment on `MAX_ROWS` cites `supabase/config.toml`, which is the local stack only; the hosted project's `max_rows` is a dashboard setting. If hosted is lower than 1000, every `>= 1000` guard never fires and the cut stays silent. | [R]; [I] hosted value | Import `MAX_ROWS` in the college file; check the hosted value at Stage 8 (needs Ivan's go). |
| X8 | NIT | `exportEvidenceActions.ts:163-165` | The evidence-action refusal writes no `console.error`, unlike attendance (`:47`) and college (`:94`). Ops gets no log line when an organiser is turned away. | [R] | Add the same one-line log with `{ eventId, limit }`. |
| X9 | NIT | `exportCollegeActions.ts:127`, `exportEvidenceActions.ts:177`, `:229` | Three `.in()` over accrediting-body ids stay unbatched. The hand-back says "a handful by construction"; it is by habit, not construction: the local database holds 191 accrediting bodies and an event's ledger may name any of them. 191 ids make a URL of about 7.1 KB, under the roughly 8 KB (about 220 ids) limit but with a thin margin. Not a bug today. | [X] body count; [I] URL length from 37 bytes per id | None now; reuse `selectInBatches` if bodies pass about 200. |
| X10 | NIT | `exportBatching.test.ts` fake client | The fake's `.limit()` is a no-op and it never enforces a row cap, so the 1000-row behaviour is tested only by handing the action 1000 rows. That is adequate for the `>=` decision but means nothing proves the action reads `limit` the way PostgREST cuts. Accepted limit of a unit test; the live check covered the 260-row path. | [R] | None. |

## Every `.in(` over an id list in app/, lib/, components/, evidence/ (grep, then each context read)

Batched through `selectInBatches` or `idBatches` (at most 100 ids per request):
- `app/events/[id]/details/exportAttendanceActions.ts:56` (registration ids)
- `exportCollegeActions.ts:105` users, `:114` professional_profiles, `:121` licences, `:133` registrations, `:148` participation_evidence
- `exportEvidenceActions.ts:236` licences
- `app/dashboard/data.ts:57` (credit count) and `:81` (registrations), via `idBatches` (CX-04, import swap only in this commit)

Not batched, and why they cannot reach a 414:
- `exportCollegeActions.ts:127`, `exportEvidenceActions.ts:177` and `:229`: distinct accrediting bodies of one event. Ceiling 191 ids, see X9.
- `app/account/actions.ts:526` and `:588`: event ids from registrations and ledger queries that end in `.limit(100)` (`:499`, `:569`) [R, checked]. At most 100 ids. `:425` (body ids from one user's licences) and `:578` (at most 100) are smaller still. `:977` society codes: small.
- `app/checkin/page.tsx:58` and `app/analytics/page.tsx:52,53`: ids from events queries with `.limit(100)`. At most 100.
- `app/dashboard/page.tsx:121`: `slice(0, 60)`.
- `app/events/[id]/details/page.tsx:255`, `app/events/[id]/edit/page.tsx:179`: bodies an event references that are missing from a list. Small.
- `lib/cpd/authorisedBodies.ts:55`: bodies an organisation is authorised for. Largest local organisation has 24; ceiling 191.
- Literal status lists only (no ids): `app/dashboard/page.tsx:73`, `app/api/cron/dispatch/route.ts:160`, `app/analytics/page.tsx:37`.
- `app/events/[id]/checkin/page.tsx:78` is a comment. `evidence/src` has no `.in(`. No `.or('...in.(...)')` or `.filter(col, 'in', ...)` forms exist (grep).

## Verified OK

- A failed batch fails the whole export in all three actions [X][R]. Mutants B2 (first-batch error only) fails 7 tests, B8 (error swallowed, data kept) fails 7. Each caller checks `.error` straight after the call and returns `{ ok: false }` with no file (attendance `:58`, college `:106,116,123,135,163`, evidence `:238`). `selectInBatches` returns `data: []` with the error, never partial rows.
- Merge is complete and ordered [X]. B3 (drop the last partial batch) fails 3 tests. `Promise.all` keeps batch order; per-user evidence rows live in a single batch, so first-evidence-per-user (`captured_at` ascending) is unchanged for the college file.
- Batch size [X]. B1 (size 1000) fails 11 tests (every size and second-batch test). Fixtures use 250 ids so the split is 100/100/50, which also exercises the partial last batch.
- A missed call site would be caught [X]. B6 (licences unbatched in the evidence action) and B7 (registrations unbatched in attendance) each fail 2 tests, because the size assertion covers every recorded `.in()` list.
- Guard boundary [X]. B4 and B5 (`>=` to `>`) each fail the one test that feeds exactly 1000 rows, and 999 is accepted. That is the intended rule: a read of exactly 1000 rows cannot be told from a cut one, so it is refused. A legitimate export of exactly 1000 rows is therefore refused (rare, safe direction, same rule the college action already had); an exact answer would need `select(..., { count: 'exact' })` and a compare of `count` with `data.length`.
- The evidence action's single ledger check does cover the per-body ledger read [R]. Both reads filter the same `event_id` (the per-body read uses every distinct body of that event), so they return the same rows; a count below 1000 for one is a count below 1000 for the other.
- Behaviour for events under about 220 attendees [R]. With 100 ids or fewer there is one batch, the request is the one that was sent before, ordering is the same (primary read still ordered by `chain_seq`; lookups are keyed into Maps), and ids are de-duplicated by `new Set` before batching, so no duplicate rows come from crossing batches. New only: an empty id list sends no request (the old `.in(col, [])` was an invalid filter), and events with 1000 or more rows are now refused instead of exported short.
- Concurrency [R]. At most 10 parallel requests per lookup (ledger under 1000), lookups run one after another. Builders are lazy thenables, so `Promise.all(map(run))` fires them together. A network-level throw would reject out of the action, same as before.
- `'use server'` files [R]. `MAX_ROWS` and `selectInBatches` are imported, not exported, from the action files, so Next's server-action export rule is not hit.
- Gates on the touched files [X]. `pnpm exec vitest run` (page test, `exportBatching.test.ts`, `app/dashboard`): 4 files, 33 tests passed. `pnpm exec eslint` on every touched file: exit 0. `pnpm exec tsc --noEmit`: exit 0.

## Not reached

- Live run of the college and evidence exports with more than 100 ledger rows (needs permanent `credit_ledger` rows; hard rule 11). The hand-back also says these two were not live-verified. Unit tests only.
- Hosted `max_rows` value, and a PostgREST cut on RPC results (X3): barred or needs rows that cannot be created.
- `next build`, `pnpm test:rls`, browser: barred by the brief.
- `app/dashboard/data.ts:81` registrations per batch can still be cut at 1000 rows silently; it carries its own `ponytail:` comment from CX-04 and is not touched here.

## Method note

Mutants were run on copies in the session scratchpad (`.../scratchpad/devlens/`; own vitest config, `@` aliased to the repo, `@/lib/supabase/inBatches` aliased to the copy, `node_modules` symlinked). No repo file was edited. Killed: B1, B2, B3, B4, B5, B6, B7, B8, B10. Survived: B9 (college ledger refusal removed).

B/M/m/n = 0/0/4/6
