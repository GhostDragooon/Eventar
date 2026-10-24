# EVENTS-LISTING — public listing showed no upcoming event past 100 past events

STATUS: DONE (code, tests, gates and live check). Not done: the three-lens review (dev, user, backtest agents); the brief did not ask for it, so that is the coordinator's call. Not pushed.

Origin: `REVIEW-DB03-backtest.md` finding F2 (MAJOR, pre-existing).

## Changed

- `app/(public)/events/page.tsx`: the query now carries `.gte('end_time', new Date(nowMs).toISOString())` before `.order('start_time', asc).limit(100)`. `nowMs` is read once, ahead of the query, and feeds both the DB filter and the existing `computeLifecycle` call, so the page uses one clock.
- Definition kept: an event is listed while `end_time >= now`. That is `computeLifecycle`'s rule (`nowMs > endMs` means completed, so an event ending exactly now is still live). The comparison is an instant (ISO UTC string against `timestamptz`), no calendar date, no zone maths.
- Over the cap: if more than 100 events are upcoming or live, the page keeps the **soonest 100** (ascending start). Only the furthest-future events past the 100th fall off. There is no notice and no pagination (copy and layout unchanged; adding either is a design decision, see Open questions).
- "Past events" view: none exists on this page. `EventsListClient` has category tabs only. Nothing to keep working.
- Existing JS filter (`registering | upcoming | live`) is left in place. After the DB cut it no longer removes anything; deleting it is a separate simplification, not part of this fix.

## Tests added or changed

New file `app/(public)/events/page.test.ts` (4 tests). The clock is pinned with `vi.useFakeTimers({ toFake: ['Date'], now: 2026-10-24T05:00:00Z })`. The Supabase fake applies `eq / is / gte / order / limit` in PostgREST order (filter, sort, then cut), so a limit ahead of the date filter fails here the way it does against the DB.

1. `lists the upcoming events when 120 past published events exist`: 120 past + 3 upcoming returns exactly the 3, in start order.
2. `keeps the soonest 100 in start order when more than 100 events are upcoming`: 105 upcoming (fed in reverse) returns 100, first `Upcoming 0`, last `Upcoming 99`.
3. `lists an event that has started and not ended, and one ending exactly now, but not one that ended a millisecond ago`: boundary cases plus 120 past rows. Expects `['Ends right now', 'Started, still running']` (start order).
4. `still hides drafts and soft-deleted events`: guards the existing `status` and `deleted_at` filters.

Must-fail-first [X], run against the unfixed page: tests 1 and 3 fail with `expected [] to deeply equal [...]` (the bug's symptom); tests 2 and 4 pass on the old code, as intended (they guard behaviour that must not change).
One test-authoring slip, fixed before the mutation runs: test 3 first expected the wrong order (the page sorts by start, so `Ends right now` comes first). Confirmed from the assertion diff that only the order was wrong.

Mutants [X], fixed page = `page.tsx.fixed` copy, restored with `cmp` byte-identical afterwards:

| Mutant | Result |
|---|---|
| M1 remove the `.gte('end_time', …)` line | 2 fail (tests 1, 3) |
| M2 `end_time` → `start_time` | 1 fails (test 3) |
| M3 `new Date(nowMs)` → `new Date(nowMs + 1)` (excludes end == now) | 1 fails (test 3) |
| M4 `.limit(100)` → `.limit(1000)` | 1 fails (test 2) |
| M5 `ascending: true` → `false` | 3 fail (tests 1, 2, 3) |

## Gates

Run one at a time, on this tree [X]:

- `pnpm exec tsc --noEmit`: exit 0, no output.
- `pnpm exec eslint .`: exit 0; 0 errors, 11 warnings (`no-img-element` and unused `no-console` disables, none in the two files this card touches; `eslint` on those two files alone: no issues).
- `pnpm exec vitest run`: 203 files passed | 49 skipped (252); 1790 tests passed | 464 skipped (2254); 0 failed.
- `next build` and `pnpm test:rls`: not run. The coordinator holds both for DB-04.

## Live check

Local stack only (`:3100` against `127.0.0.1:54322`). `.env.local` not read, nothing touched on Seoul [X].

- `:3100` was not running (no listener on 3000/3100/3200, stale `.next/dev/lock`, no Next process). I started it with `scripts/demo/dev-local.sh` (PID 92762) and left it running.
- Local DB at check time: 227 published past events, 21 published upcoming or live (`end_time >= now()`), soft-deleted excluded.
- `curl http://localhost:3100/events`, no cookies (signed out): HTTP 200.
  - 21 distinct `/events/<uuid>` card links in the HTML = the 21 upcoming/live rows in the DB.
  - All 21 upcoming/live titles present, 0 of the 227 past-only titles present.
  - The DB count was read before and after the fetch (21 both times).
- Not done: a before-fix live reproduction on this run (the brief recorded the 0-of-3 result on the unfixed page; the unit test reproduces it). No screenshot: markup and copy are unchanged.

## CI assertion

`app/(public)/events/page.test.ts` runs in the normal `vitest run`; no new CI job.

## Evidence tags

Everything above is [X] (executed), including the `timestamptz >= ISO-string` comparison, which the live check ran against the real local DB. [I] only: the effect on the hosted Seoul project (not run; same query shape).

## Findings

1. **Same bug class, not fixed (outside the brief):** `app/checkin/page.tsx:45` reads `status = 'published'` ascending by `start_time` with `.limit(100)`, then keeps live/upcoming/registering in JS (`app/checkin/page.tsx:52`). It is scoped to the staff member's own organisation, so it fails only for an organisation with 100+ past published events, and then the check-in door picker would list nothing. Same one-line fix applies. Proposed as its own card.
2. `app/analytics/page.tsx:39` is `limit(100)` descending with a JS `completed` filter: it shows up to the 100 most recent, so it degrades by showing fewer rows, not by showing none. Not the same failure. Not changed.
3. The local DB holds many `… fixture — DELETE ME` rows (11 of the 21 upcoming events are `set_event_cpd_config CREDITED fixture`). They are test leftovers from other sessions; I did not touch them.
4. `git diff -- package.json pnpm-lock.yaml` shows a pre-existing dependency change that no card names. Not mine; left unstaged.

## Deviations from the card and why

- None to the fix. Extra: I started the `:3100` dev server because none was running (the brief said it normally is).

## Open questions for Ivan

- If an event list ever has more than 100 upcoming events, should the page paginate or show "load more"? Today it silently shows the soonest 100 (design decision, not made here).
- Fix `app/checkin/page.tsx` the same way (finding 1)? Say go and it is a small card.

## Needs from other cards

None.

## Executor

Side session started by the MVP execution coordinator.

Committed: b5696ca

## Suggested commit message

```
fix(events): list upcoming and live events however many past events exist

The events query cut to 100 rows by start_time before the upcoming filter ran in JavaScript, so
100+ past published events left an empty listing. end_time >= now is now part of the query; past
the cap the soonest 100 are kept.
```

## Review round (REVIEW-EVENTSLISTING-dev.md, REVIEW-EVENTSLISTING-backtest.md), 2026-10-24
Counts: dev 0/1/2/3, backtest 0/1/2/1 (blocker/major/minor/nit). Live (curl, psql): signed-out /events listed 23 cards = SQL 23, same ids and order; the old query shape held 0 upcoming among the first 100 of 227 past events; boundary fixtures behaved (ended 1 minute ago hidden, ends in 1 minute shown, live shown, deleted, draft, cancelled hidden); with 118 qualifying events the page showed exactly the soonest 100.
Fixed after the review, in the commit that carries this note: the SAME bug in the staff door picker `app/checkin/page.tsx` (major: `.limit(100)` ahead of the JavaScript filter; as ux-admin on the local database /checkin showed "No open events" and no link while 117 upcoming and live events existed). Now `end_time >= now` is in its query; new test file `app/checkin/pageWindow.test.ts` (fails without the filter: 2 tests). Both pages also order by `id` after `start_time`, so events that start together are cut the same way on every load (backtest EL-2); the shared fake `tests/helpers/staffPageFakes.ts` learned `gte`. Listing tests hardened (dev E2, E3): events that ended days ago do not use the slots; upcoming drafts do not use the slots; tie-break. Mutants (each restored `cmp`): no date filter, no tie-break, no status filter each fail a named test.
Left as is, for Ivan: past 100 upcoming events the furthest-future ones fall off with no "more" cue (EL-3, documented in the code); `app/analytics/page.tsx` and other lists capped at 100 are newest-first and unaffected. The :3100 server is in review mode (dev-local.sh default), which makes signed-out staff pages open: reviewers must check it before trusting an auth walk.
