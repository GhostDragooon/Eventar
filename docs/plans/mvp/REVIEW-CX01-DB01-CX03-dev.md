# REVIEW CX-01 + DB-01 + CX-03: dev lens

Reviewer: dev lens (Claude, Sonnet 5.5). Tree: uncommitted on HEAD e1bd06f. Date: 2026-10-23.
Evidence tags: [X] executed by me, [R] read, [I] inferred.
Not done (by instruction): `pnpm test:rls`, `supabase db reset`, `next build`, any dev server, the CI script itself. Every claim below about what `test:rls` does when it runs rests on the hand-backs' [X], not mine.
Ceiling: partial on three points, listed at the end under "Not checked".

## Verdict

0 BLOCKER, 1 MAJOR, 4 MINOR, 5 NIT. No bug in the code that was added. The one MAJOR is a Hard Rule 11 gap that DB-01's new test now records as the expected posture.

## Findings

### MAJOR-1 (DB-01): `invite_tokens` is a definer-only, audited table, but `service_role` keeps INSERT/UPDATE/DELETE, and the new test pins that as correct

- Where: `tests/rls/seed_grant_posture.rls.test.ts:36` (`service_role: ALL`), `supabase/seed.sql:167` (revokes anon and authenticated only), `supabase/migrations/20260911000000_invite_tokens.sql:27-28` (the comment says "No direct writes", the revoke omits `service_role`), `:170` (`accept_invite_token` stamps `accepted_at` and then calls `write_audit_event('invite_accepted')`).
- Rule: CLAUDE.md Hard Rule 11. A table whose sole write path is a SECURITY DEFINER function must revoke `service_role` too, because `service_role` has BYPASSRLS and only a table-level REVOKE stops it.
- Evidence: local posture of `invite_tokens` is anon S, authenticated S, service_role DISU [X, psql `has_table_privilege` over all public tables]. The only app code touching the table is `app/settings/team/actions.ts:51`, a SELECT through the user's own client. No `service_role`, script or test writes it directly [R, grep of `from('invite_tokens')` and raw SQL across app, lib, scripts, tests]. `create_invite_token` itself writes no audit event [R]; only `accept_invite_token` does.
- Failure scenario: server code or a leaked service key runs `update invite_tokens set accepted_at = now()`, or inserts a row with a hash it chose and `role = organiser_admin`. That skips the 10-active-tokens limit in `create_invite_token`, and for the UPDATE it also skips the `invite_accepted` audit event. A later `accept_invite_token` on a planted row creates a staff row for the planted role.
- Why it is DB-01's business: it is not a regression (hosted has the same grants, and the migration is applied history). But the hand-back reasons "none of the three is definer-only including service_role" from the current grants, which is circular. The card said to add the tables to `audited_table_writes` "only if definer-only", and by Rule 11 `invite_tokens` is. DB-01's matrix, seed comment (`seed.sql:153`, "service_role is deliberately NOT revoked on any of them") and test now record the gap as intended.
- Fix (a new `sql` card, Ivan's call because it touches hosted): a migration `revoke insert, update, delete on public.invite_tokens from service_role`; extend `seed.sql:167` to `from anon, authenticated, service_role`; flip `EXPECTED.invite_tokens.service_role` to `['SELECT']`; add an `invite_tokens` row to `tests/rls/audited_table_writes.rls.test.ts` with the SQLSTATE `42501` negative test. Callers to re-verify first: none found [R]. Decision needed: Rule 11 as written, or an explicit carve-out recorded in the Decisions Log.

### MINOR-1 (DB-01): `controlled_lists.rls.test.ts` now has misleading titles and comments, and its RLS-layer purpose is masked

- Where: `tests/rls/controlled_lists.rls.test.ts:20` ("RLS blocks despite table grant"), `:28-29` ("Table-level grant exists (seed.sql blanket)"), `:66` and `:80` ("RLS silently affects zero rows"), and the intent paragraph at `:60-65`.
- Evidence: after DB-01 the seed revokes INSERT/UPDATE/DELETE from anon and authenticated on `professions`, `positions`, `degrees`, `specialties`, `societies`. The grant is no longer there, so these attempts fail with 42501 "permission denied", not an RLS row filter [R: `seed.sql:168-172`, local posture `S|S|DISU` via psql X]. The tests still pass because they assert `error` is not null, or `void error` plus an unchanged row.
- Failure scenario: someone reads "RLS blocks despite table grant" and believes the RLS layer is under test. A future accidental `for update to authenticated using (true)` policy, the exact case the `:60-65` comment says the test exists to catch, now stays green, because the grant layer blocks first. This is the same on hosted, so it is a loss of local coverage of the RLS layer, not a security regression.
- Fix: retitle and re-comment the four tests to say they pin the grant layer (assert SQLSTATE `42501`). Optional: one rolled-back-transaction test that grants UPDATE to authenticated and asserts RLS still blocks, restoring the RLS-layer check. That is a test-only change.

### MINOR-2 (CX-03): the token list in `lib/utils.ts` is hand-copied twice and not tied to `globals.css`

- Where: `lib/utils.ts:7-18` (comment says "Keep this list in step"), `lib/utils.test.ts:17` (a second copy of the same ten names).
- Evidence: today the list is complete. The `--text-*` base tokens in `app/globals.css` are display, headline-lg/md/sm, title-lg, body-lg/md/sm, label-md, label-sm (lines 164-207). Lines 222-236 are Tailwind's own xs to 4xl, which tailwind-merge already knows. `--text-scale` (line 292) is a `:root` variable, not a utility [X: awk over globals.css, peer-added tokens: none; `git log` shows no pending change to the file].
- Failure scenario: a peer adds `--text-label-lg`. `cn('text-label-lg', 'text-on-primary')` silently evicts the colour again (the probe shows an unregistered `text-label-lg` is read as a colour), and `lib/utils.test.ts` stays green because it asserts the copy, not the CSS. This is the exact failure CX-03 fixed.
- Fix: in `lib/utils.test.ts`, read `app/globals.css`, collect `^\s*--text-([a-z]+(?:-[a-z]+)?)\s*:` names, drop Tailwind's defaults (xs, sm, base, lg, xl, 2xl..9xl) and `scale`, and assert each is registered by checking that `cn('text-<name>', 'text-primary-ink')` keeps both. About ten lines, no new dependency.

### MINOR-3 (CX-03): registering sizes also makes them conflict with `leading-*`; neither the hand-back nor the test mentions it

- Where: `lib/utils.ts:20-22`.
- Evidence [X, node probe over the real tailwind-merge 3.6.0, scratchpad `probe.mjs`]: `cn('leading-snug','text-label-md')` was `leading-snug text-label-md` and is now `text-label-md`. `cn('text-sm leading-6','text-label-md')` is now `text-label-md`. The reverse order (`text-label-md leading-snug`) keeps both. This is tailwind-merge's built-in `font-size` conflicts with `leading` rule, now applied to the project tokens, consistent with how `text-sm` already behaves. In Tailwind 4 the `leading-*` utility wins in CSS regardless of class order, so dropping it changes a rendered line height from the explicit leading to the token's own [I].
- Impact today: none found. Every same-line `cn(` call with `leading-` that I could see puts the size first (`components/landing/WhyEventar.tsx:130`, `app/dev-preview-uiport/ux-01/parts.tsx:217`), and `components/ui` carries no `leading-` [R]. Multi-line `cn(` blocks and `className` props merged inside primitives were not scanned.
- Fix: no code change needed. Add one assertion to `lib/utils.test.ts` that documents the behaviour (so a later override of `conflictingClassGroups` is a deliberate change), and one line in the CX-03 hand-back.

### MINOR-4 (CX-01): `deleteTestUser` still swallows the same error that CX-01 made loud on the create side

- Where: `tests/helpers/clients.ts:91` (`await admin.auth.admin.deleteUser(user.id)`, result ignored), against the new throw at `:66-67`.
- Evidence: the CX-01 hand-back traces its failures to a crashed 09-19 run whose `lm-user-b` could not be deleted ("Database error deleting user", non-cascading `practitioner_licences` rows). Teardown ignores exactly that error, so the residue is created silently and only fails the next run's `beforeAll`. Local `auth.users` holds 191 `@rls-test.invalid` users now [X]; I did not classify which are residue.
- Failure scenario: a suite leaves `practitioner_licences` rows for a static-name user (`lic-owner`, `lm-user-b`). The suite's own afterAll reports green. Every later run of that file fails at `createTestUser` with `deleting leftover ...` until someone deletes the licences by hand, and the message gives no hint which FK rows block it.
- Fix: make `deleteTestUser` throw on error (or at least `console.error` the id and message) so the failure appears in the run that caused it. Add the likely recovery hint to the `:67` message ("a non-cascading FK row, e.g. practitioner_licences, may block the delete"). Note a throw in teardown can turn currently green files red; run the three files once before merging.

### NIT-1 (DB-01): CI gate query ignores views and materialised views, and its failure message names no table

- Where: `scripts/ci/replay-and-verify.sh:51-57`.
- Evidence: `c.relkind in ('r','p','f')`. The 20261010175112 migration revokes on "all tables in schema public", which covers views and matviews, and TRIGGER is grantable on a view. There are no views, matviews, foreign or partitioned tables in `public` today [X, psql]. The query returns 0 on the current local DB [X, run read-only]. `[ "$HELD" = "0" ] || {...}` is reachable and fails closed (an empty `HELD` also prints the message). Under `set -euo pipefail`, a psql or docker failure inside `$(q ...)` aborts the script via `set -e` with psql's own error, with no custom message [R].
- Fix: `relkind in ('r','p','f','v','m')`, and print offenders: `select string_agg(r.role||' '||p.priv||' '||c.relname, ', ')` in the failure branch.

### NIT-2 (CX-03): the `text-on-primary!` workaround comments are now false

- Where: `app/error.tsx:89-91`, `app/events/[id]/edit/PublishDraftButton.tsx:95`, `components/auth/MagicLinkSignInForm.tsx:103`, `app/login/page.tsx:305`, tests `app/error.test.tsx:159`, `app/events/[id]/edit/PublishDraftButton.test.tsx:139`, `components/auth/MagicLinkSignInForm.test.tsx:69-77`, `app/login/page.test.tsx:417`.
- Evidence: they say tailwind-merge reads `text-label-md` as a colour and the `!` keeps both. After CX-03 neither is true. The card says the `!` stays, and the tests assert class presence, so they remain valid ([X] vitest green). The comment in `MagicLinkSignInForm.test.tsx:76` ("Dropping the `!` swaps which one tailwind-merge evicts") no longer describes the merge.
- Fix: leave the code, retire the comments in the next card that touches each file, and drop the `!` only with Ivan's say so (the `!` is also an important-modifier specificity bump).

### NIT-3 (DB-01): the seed header still names three tables as the revoke list

- Where: `supabase/seed.sql:14-16` ("table-level revokes (audit_events / credit_ledger / practitioner_licences)").
- Evidence: the file now re-asserts about 25 tables. The header sentence is the one a future editor reads first. Fix: say "every table-level revoke; the sweep in `tests/rls/seed_grant_posture.rls.test.ts` and `audited_table_writes` are the check".

### NIT-4 (DB-01): the posture matrix is a hand-listed set, so the next drift is again found by audit

- Where: `tests/rls/seed_grant_posture.rls.test.ts:35-46`.
- Evidence: the ten tables were chosen by the card's audit. The test cannot notice an eleventh table whose migration revokes and whose seed line is missing. I audited it by hand (below) and found none missing today. The test's value is the regression guard on the ten, which it provides [R].
- Fix (optional, small): in the same rolled-back transaction, also assert that no `public` table other than the matrix and the `audited_table_writes` matrix holds fewer than all four DML privileges for anon or authenticated. A table that is narrowed but unlisted then fails and forces a classification.

### NIT-5 (CX-01): the leftover lookup is case-sensitive

- Where: `tests/helpers/clients.ts:59-62` (`where email = $1`).
- Evidence: GoTrue stores emails lowercased (0 mixed-case emails in `auth.users` [X]); every static `createTestUser('...')` argument in `tests/` is lowercase [X, grep]. The old `listUsers().find(u => u.email === email)` had the same property, so this is not a regression. Fix: `where lower(email) = lower($1)` if anyone ever passes a capital.

## Answers to the brief

DB-01
1. Missed tables: none. I enumerated every `revoke` line in `supabase/migrations/*.sql` (single-line, multi-line starts, `revoke all on table`, column-level, DO-block `format()`): the table-level ones are audit_events, credit_ledger, practitioner_licences, staff (column), events (table + column), organisation_body_authorisations, email_log, rate_limits, credit_disputes, event_occurrences, registration_checkins, the four accreditation/role tables, professional_profiles, participation_evidence, invite_tokens, the five lookup tables, additional_appointments, society_memberships, data_subject_requests, plus the TRUNCATE/TRIGGER sweep. All are in the seed now [R]. Other `grant`s found are narrowings of the same set.
2. Expected-posture rows: all ten check out against the migrations [R], with MAJOR-1 as the one place where the migration's posture itself breaks Rule 11.
   - `invite_tokens` anon S, auth S, svc ALL: the revoke covers I/U/D for anon+authenticated only, SELECT stays by default privilege (policy is `to authenticated`).
   - `credit_disputes` anon none, auth S+I: `20260804040000:240-241`.
   - Five lookups S/S/ALL: `20260916000000:80-96`.
   - `professional_profiles` anon none, auth S/I/U, svc ALL: `20260829090000:99-101` + `20260829130000:14`.
   - `additional_appointments`, `society_memberships` anon none, auth ALL, svc ALL: `20260916040000:47-49,88-90`.
   - The live local DB matches every row [X, psql].
3. Vacuity: the control (strip anon SELECT on `events`, restored only by the blanket grant) proves the seed ran. A multi-statement simple query either runs all statements or raises, so the DB-01 lines after it ran too. The hand-back's three mutations (seed lines dropped, restored with `cmp`) are the stronger proof; I did not re-run them [I].
4. CI step: correct under `set -euo pipefail`; see NIT-1. `q` is `docker exec ... psql -tA -c`, and `-tA` makes the count compare as `"0"`. Executed the same SELECT against the local DB: `0` [X]. The script itself was not run.
5. Seed comment superseding the `20260916000000` note: accurate. The migration note is at `:150-165`. One overstatement: "the grant layer is the one hosted relies on"; hosted has both layers. Harmless.
6. Local flows broken by the re-assert: none found [R]. No code writes these ten tables as anon or authenticated except the paths whose grants are kept (`app/account/actions.ts` for professional_profiles, additional_appointments, society_memberships as authenticated; `listInvites` SELECT). `scripts/demo/*` writes none of them (`reset-demo.ts:68` deletes `credit_disputes` as superuser). Tests: `controlled_lists.rls.test.ts` still passes by construction but see MINOR-1. The three anon-SELECT tests (`professional_profiles`, `additional_appointments`, `society_memberships`) accept an error or an empty result, so both postures pass.
   - Hermeticity: no other RLS test mutates ACLs at runtime (grep: only comments mention grant/revoke), so the seed test's pg_class row locks cannot deadlock a sibling file. The transaction rolls back, so no NOTIFY reaches PostgREST [I]. `staff` has no audit trigger (only `staff_lowercase_email`), so the seed's trailing insert takes no audit advisory lock [X].

CX-01
- Race in leftover cleanup: none new. Static localParts are unique per file across `tests/` [X, grep of 40 literal call sites]. The five wrapper callers (`dsr_audited`, `licence_mutations`, `confirm_credit_entry` pass their own argument; two use a timestamp) were not cross-checked for collisions (see "Not checked").
- `sqlSuperuserQuery` parameters: `c.query(sql, undefined)` keeps the simple protocol, so existing multi-statement callers are unaffected [X: `select 1; select 2` with `undefined` returned 2 results]. A parameter array uses the extended protocol, which is single-statement; the lookup is single-statement [X: param lookup returned 0 rows for an absent email].
- Failing loudly cannot mask a real failure: it raises at the first point the run is already doomed (`createUser` would hit "already registered"). Residual hazard is MINOR-4.
- Per-run suffix: `WK-` + 3 random + 3 index chars, all from the 31-char `ALPHABET` the file already used, so length 9 and alphabet are unchanged from `WK-BUR...` [R]. There is no DB-level format check on `registration_code`, only `registrations_code_unique` [R]. Collision chance with a leftover run is 1 in 29,791 per leftover [I].
- `afterAll`: deletes exactly the run's `participation_evidence` (by event), registrations (by collected ids), rate_limits key, event and staff row [R]. The hand-back's [X] that no `RLS Burst Attendee` rows are left was not re-run.
- `app/settings/page.tsx:84`: `&apos;` is the correct entity; eslint reports 0 errors [X].

CX-03
- Token list complete against `globals.css` (see MINOR-2). No peer-added `--text-*`.
- Behaviour [X, probe over the real library, old config vs new]:

| Input | Old | New |
|---|---|---|
| `text-label-md text-on-primary!` and the reverse | both kept | both kept |
| `hover:text-label-md hover:text-body-lg hover:text-primary` | `hover:text-primary` | `hover:text-body-lg hover:text-primary` |
| `text-label-md sm:text-body-lg text-primary` | `sm:text-body-lg text-primary` | `text-label-md sm:text-body-lg text-primary` |
| `text-left text-label-md text-on-primary` | `text-left text-on-primary` | all three |
| `text-balance text-body-md` | both | both |
| `text-[calc(13px*var(--text-scale))]` + colour | both | both |
| `text-[calc(...)]` then `text-body-md` | both | `text-body-md` (size replaces arbitrary size) |
| `text-label-md` + `text-[#fff]` | colour only | both |
| `text-label-md` + `text-[14px]` (either order) | wrong one wins | later wins |
| `text-label-lg text-primary` (unregistered) | `text-primary` | `text-primary` |
| `leading-snug` then `text-label-md` | both | `text-label-md` (MINOR-3) |

- A text colour relying on the old eviction: none found. The only places that looked like it are the four `text-on-primary!` workarounds, which keep working (NIT-2). The CX-03 hand-back lists 20 sites whose rendered classes change; I did not re-derive that scan.
- `lib/utils.test.ts` asserts behaviour (merge outputs), not implementation. Gaps: MINOR-2 and MINOR-3.

## Verified clean

- Every new `revoke` in the seed matches its migration for anon and authenticated [R]; none touches `service_role`, matching the migrations.
- The seed block sits after the blanket grant and before the staff insert, and only revokes DML (never `grant all`) [R].
- The posture test reads the real `supabase/seed.sql`, runs it in `begin ... rollback` with the rollback in `finally`, and its `import '../helpers/clients'` carries the local-stack guard [R].
- `tests/helpers/clients.ts` parameter handling and `lib/utils.ts` signature (`cn(...inputs)`) are backward compatible; tsc passes with the other callers [X].
- No missed table, no local flow broken, no concurrency hazard from the seed test (see above).
- `app/settings/page.tsx:84` one-entity change, nothing else in the file.

## Gates (run by me, sequentially, on the tree as found)

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm exec eslint .` | 0 errors, 11 warnings (all "unused eslint-disable"), exit 0 |
| `(unset RLS_TESTS; pnpm exec vitest run)` | exit 0; 195 files passed, 47 skipped (242); 1619 passed, 405 skipped (2024). `PublishDraftButton.test.tsx` passed this run (the known flaky baseline did not fire) |
| `bash -n scripts/ci/replay-and-verify.sh` | OK |
| CI step 3 SELECT, read-only on the local DB | `0` |

The files under review did not change between my first diff and my last (85 insertions, 11 deletions over the six tracked files).
Counts differ from the hand-backs (187 to 190 files) because peers added test files since; not a discrepancy in these three cards.

## Not checked

- `pnpm test:rls`: not run (lock held elsewhere). The posture test, `controlled_lists` and the three anon tests are verified only by reading plus the hand-back's [X].
- Hosted posture: no access; "hosted" above means what the migrations leave.
- Multi-line `cn(` call sites for a `leading-*` placed before a type token (MINOR-3); cross-file collisions among the five wrapper-based `createTestUser` callers; the visual or accessibility effect of the 2px size changes CX-03 lists (user lens).
- Out of scope, pre-existing, noted only: `anon` holds INSERT and DELETE at the grant layer on `staff` (local posture `DIS` [X]; hosted by inference [I]), with staff RLS SELECT-only as the single control. Not a seed drift; worth a Rule 11 look in a later SQL card.

Scratch probe (not part of the repo): `/private/tmp/claude-501/-Users-ivan-Eventar/6195ca69-7fb3-4fb6-9382-ef141dc1321a/scratchpad/probe.mjs`.
