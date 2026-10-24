# REVIEW-DB03-backtest: live behaviour after DB-03 (backtest lens)

Reviewer: backtest agent, 2026-10-24. Local stack only (DB `127.0.0.1:54322`, PostgREST `127.0.0.1:54321`, app `http://localhost:3100`, review mode OFF). curl + psql only. No server started or stopped, no `.env.local`, no :3000, no Supabase MCP, no `pnpm test:rls`. Migration `20261024100000` confirmed applied locally; `events_public_read_published` reads `(status = 'published') AND (deleted_at IS NULL)`.
Evidence tags: [X] executed here, [R] read in code, [I] inferred.

## Verdict

Both claims of the card held under live execution. Claim 1 (teammate eligibility): creator and teammate get identical rows; another organisation's admin gets 42501 "not in your organisation"; anon is refused. Claim 2 (deleted events private): anon and an outside organisation's admin get nothing for a soft-deleted published event across PostgREST (events, agenda_blocks, event_occurrences, listing), the event page, the poster and the calendar file; organisation members still see it. No BLOCKER and no MAJOR against DB-03. Findings below are side effects found while exercising the surface; F1 is the only one that touches the card's own subject.

## Findings

| ID | Severity | Route / function | What I saw | Evidence | Suggested fix |
|---|---|---|---|---|---|
| F1 | MINOR | `/events/[id]`, `/events/[id]/poster`, `/events/[id]/calendar.ics` (public routes) as an organisation member | A soft-deleted published event renders to its organisation's staff exactly like a live one: full page, poster, `.ics` all HTTP 200 for both the creator and the teammate, no `noindex`, no "deleted" marker, and the registration form is present (one email input, same as the live event). Submitting it via the Server Action returns "Registrations are not open for this event." (the generic closed message). The same URL is a not-found payload for anon and for the other organisation. So an organiser who deletes an event and later opens or shares its public link sees a working-looking page that no visitor can open. Cause: `app/(public)/events/[id]/page.tsx` selects without `deleted_at` and relies on RLS alone; poster and `.ics` the same. | [X] pages and action; [R] page.tsx select (no `deleted_at`) | Decide in a design pick, not here: either `notFound()` on `deleted_at` for every caller on the three public routes (organisers use the dashboard, which lists deleted events with a `deleted` flag and has Restore), or render a "Deleted, only your team can see this" banner and hide the form. Before-and-after render needed per Ivan's frontend-review rule. |
| F2 | MAJOR (pre-existing, outside DB-03, does not block it) | `app/(public)/events/page.tsx` listing | Query is `status=published, deleted_at is null, order start_time asc, limit 100`, and the upcoming/live filter is applied AFTER the limit. Local data has 139 past published events, so the 100 rows are all past and the page shows no upcoming event at all: neither my fixtures A and C nor the seeded upcoming event `DB03UL live event` appear in `/events`. I could therefore not show A in the HTML listing; the listing semantics were proven through PostgREST instead (Verified OK table). Latent in production once more than 100 past published events exist. | [X] 145 events start before A; 0 of 3 upcoming titles present in the body; [R] limit(100) then filter | Filter by `end_time >= now()` in the query (or order descending from now) before `limit`. Separate card; flagged, not fixed. |
| F3 | NIT | `/events/[id]` and `/poster` for a deleted event vs `/calendar.ics` | Same hidden event, three status codes: page and poster return HTTP 200 with a not-found payload (noindex meta plus the not-found digest, the known streamed `loading.tsx` behaviour), `.ics` returns a real 404. Anon and other-org get the same. | [X] | None needed; known caveat. Only note: a status-code-based monitor sees the page as healthy. |
| F4 | NIT | `rpc/event_registration_eligibility`, unknown event id | A teammate calling with a non-existent event id gets HTTP 500 with SQLSTATE P0002 (PostgREST does not map P0002 to 4xx). Unchanged by DB-03. The check-in page cannot reach it (it loads the event first). | [X] | Optional: map to 404 via `PT404` or leave. |
| F5 | NIT | Review mode (`lib/supabase/server.ts`) | With `EVENTAR_REVIEW_MODE` on and no auth cookie, `supabaseServer()` returns the service-role client, so every public-route check above would read a deleted event as visible. Dev-only (NODE_ENV guarded), but a reviewer walking with review mode on cannot see claim 2. | [R]; not exercised (mode off) | Reviewers must run the noindex/not-found walk with review mode OFF, as done here. Optionally add the `deleted_at` filter from F1 to the public routes as defence in depth, as `/events` already does. |

## Verified OK

Fixture ids: A = live published event (creator's staff row, default organisation), B = identical but `deleted_at` set (status still `published`), C = a third published event deleted through the app. Roles: creator and mate = active `organiser_admin` in the default organisation; other = active `organiser_admin` of `DB03BT other org`.

| # | Probe | Role | Observed |
|---|---|---|---|
| 1 | PostgREST `events?id=eq.A` | anon / creator / mate / other | row returned for all four |
| 2 | PostgREST `events?id=eq.B` | anon | `[]` HTTP 200 |
| 3 | `events?id=eq.B` | other | `[]` |
| 4 | `events?id=eq.B` | creator, mate | row returned (organisation member sees own deleted event) |
| 5 | `agenda_blocks?event_id=eq.B` | anon, other | `[]`; creator and mate see the block |
| 6 | `event_occurrences?event_id=eq.B` | anon, other | `[]`; creator and mate see the row |
| 7 | `agenda_blocks` / `event_occurrences` for A | anon, other | rows returned (control) |
| 8 | Listing `events?status=eq.published&title=like.DB03BT*` | anon, other | `live`, `toDelete` only (B absent) |
| 9 | Same listing | creator, mate | `deleted`, `live`, `toDelete` |
| 10 | Policy sweep: all policies readable by anon on tables with event links | n/a | `events` policy carries `deleted_at IS NULL`; `agenda_blocks`, `event_occurrences`, `event_accreditation_*` select from `events` as the caller and inherit it. Only anon-executable public function that reads `events` is `update_event_with_blocks` (SECURITY INVOKER, RLS applies) |
| 11 | `GET /events/A`, `/poster`, `/calendar.ics` | anon | 200, title present |
| 12 | `GET /events/B` | anon | 200 streamed, `noindex` x2 and not-found digest x2, title absent |
| 13 | `GET /events/B/poster` | anon | 200 streamed, `noindex` and not-found, title absent |
| 14 | `GET /events/B/calendar.ics` | anon, other | HTTP 404 |
| 15 | `GET /events/B`, `/poster` | other | not-found payload, title absent |
| 16 | `GET /events/B`, `/poster`, `.ics` | mate, creator | 200 with title, poster, `.ics` (see F1) |
| 17 | `rpc/event_registration_eligibility` for A | creator | 200, 2 rows |
| 18 | same | mate (did not create A) | 200, the same 2 rows (`cancelled`, `no_account` once A carries an accrediting body and 1 CPD hour; `not_cpd` before) |
| 19 | same | other organisation's admin | HTTP 403, SQLSTATE 42501, "event_registration_eligibility: event ... is not in your organisation" |
| 20 | same | anon | HTTP 401, 42501 "permission denied for function" |
| 21 | same, mate role/status matrix | `organiser_member` active | 200, rows |
| 22 | same | `body_admin`, `auditor`, `organiser_admin` suspended, `organiser_admin` invited | 403, 42501 "require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}" |
| 23 | same for deleted B | mate | 200 rows (a READ of the organisation's own roster, consistent with claim 2) |
| 24 | `GET /events/A/checkin` | mate | 200; roster rendered with the registrant name and the label "No practitioner account for this email ... won't post a CPD credit"; the phrase "be checked just now" appears 0 times |
| 25 | same | creator | identical to mate (0 warnings, 1 label) |
| 26 | same | other organisation's admin | streamed `NEXT_REDIRECT` to `/events/A/detail`; no roster, no registrant name |
| 27 | same | anon | 307 to `/login?next=...` |
| 28 | Soft delete through the product: Server Action `softDeleteEvents([C])` at `/dashboard` | creator | `{"ok":true,"count":1}`; row `status=published, deleted_at set`; audit row `event_soft_deleted` written |
| 29 | After 28: PostgREST `events`, `agenda_blocks` for C | anon | `[]` immediately; `/events/C` not-found payload with noindex; `C/calendar.ics` 404 |
| 30 | Dashboard (`/dashboard`, `/dashboard/manage`) after 28 | creator, mate | C still listed (the loader selects `deleted_at` and sets `deleted: true`; stat counts exclude deleted rows [R]); other organisation: nothing of ours |
| 31 | `restoreEvents([C])` | creator | `{"ok":true,"count":1}`; anon reads C again |
| 32 | `registerForEvent` (Server Action) on deleted B | anon, mate, other | all "Registrations are not open for this event."; no row created |
| 33 | `registerForEvent` on live A | anon | succeeded; registration row created (control) |
| 34 | Direct PostgREST INSERT into `registrations` for A and B | anon | 42501 "permission denied for table registrations" on both (SEC-01 grant revoke; the policy change is unreachable over PostgREST, as the card says) |

## Not reached

- `/events` listing HTML cannot show A, B or C on this database (F2). Listing behaviour was proven at PostgREST level only.
- Accreditation public-read tables (`event_accreditation_groups`, `_accreditations`, `_occurrences`): no accreditation fixtures were built. Inheritance of the events policy is [R] from the policy text and [X] only for `agenda_blocks` and `event_occurrences`.
- `/events/B/detail` and `/events/A/detail` as the other organisation's admin (target of the check-in redirect): not fetched.
- A signed-in practitioner who is not staff: not built; the policy has no staff term, so the outside-organisation admin result applies [I].
- Check-in window: A starts in 3 days so the desk showed "Not open yet"; the roster and eligibility label still rendered. Eligible-state labels (`eligible`, `no_licence`) not exercised (needs a verified licence fixture).
- Review mode ON behaviour (F5): not exercised.
- Hosted push: not in scope (SEC-01 "Hosted").

## Fixtures and cleanup

Created (prefix `db03bt` / `DB03BT`): 3 auth users (`db03bt-creator@`, `db03bt-mate@`, `db03bt-other@db03bt.invalid`), 1 organisation `DB03BT other org`, 3 staff rows, 3 events (A live, B deleted, C toDelete), 3 agenda blocks, 3 event_occurrences, 6 registrations plus 1 live registration made through the action, 1 email_log row from that registration. Temporary edits to my own fixtures: A's start time moved and restored; A given an accrediting body and 1 CPD hour; mate's role/status cycled and restored; one registration set cancelled.

Cleanup order: email_log, registrations, agenda_blocks, event_occurrences, events, staff, organisation, auth users (admin API DELETE, 3x HTTP 200), scratch files (env, tokens, cookies, response dumps).

Residue count by prefix: `events=0 staff=0 orgs=0 auth=0 registrations=0 agenda=0 occ=0 email_log=0`.

Permanent residue (hard rule 11, audit is append-only): 2 `audit_events` rows on C (`event_soft_deleted`, `event_restored`) [X: 2 rows found by subject before cleanup]. Whole-database totals rose from events 165, staff 120, orgs 25, auth 468 at the start to 168, 122, 25, 472 at the end: these are peer sessions' fixtures (prefix queries are all zero), not mine.

Caveats on my own hygiene:
- The `:3100` lock file `scratch-demo/locks/dev-3100.lock` was held by `claude-e94a72 DB-03 reviews` (the caller); I reused the running server per the brief and neither wrote nor removed a lock.
- My scratch cleanup used broad globs (`b*.txt`, `c_*.txt`, `d*_*.txt`, `tok_*`, `cookie_*`) in the shared session scratchpad without listing it first. A listing afterwards shows no file matching them, but I cannot rule out that a sibling's scratch output of that shape existed and was removed. No repo file is affected.
- `git -C /Users/ivan/Eventar status --porcelain | grep -i 'db03\|REVIEW'` showed nothing before this report was written; I edited no repo file, and this report is the only file I wrote.
