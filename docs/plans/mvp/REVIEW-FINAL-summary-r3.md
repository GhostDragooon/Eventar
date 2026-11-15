# MVP acceptance walk, run 3 (2026-11-14): summary

**Verdict: the MVP spine is closed on the working tree. The declaration carries three conditions, and each one is yours.**

The spine is create, publish, register, check in, record. The live walk found no BLOCKER and no new MAJOR. Every spine row has an executed result.

The conditions:
1. **M1 stays open.** The consent copy names Terms and Privacy pages that return 404. It is a MAJOR that predates this phase. Your scope parked legal, so I did not fix it. By the skill's strict bar, one open MAJOR keeps "done" open, so this is your ruling (Decide 2).
2. **Nothing is committed.** The walk and the gates ran on `1f3d958` plus uncommitted changes. The clean-worktree gate chain at a final HEAD is NOT RUN until you give a commit go.
3. **Seoul has none of the five migrations.** They are local only until your separate go.

Tags: [X] executed this run, [R] read in code, [I] inferred. A row without [X] is not a pass.
Walk: server :3100, `EVENTAR_REVIEW_MODE=false` (signed-out `/events/new` gave 307 to `/login`), local stack only, Seoul untouched.
Lens files (all untracked, not committed): `REVIEW-FINAL-organiser-r3.md`, `-practitioner-r3.md`, `-roles-r3.md`, `-gapfill-r3.md`.

## Checklist

| Row | Status | Evidence |
|---|---|---|
| O1 sign in, land on Events | PASS [X] | Mailpit magic link, sidebar Check-in / Events / History / Settings, role read from the page |
| O2 create, Save draft | PASS [X] | DB row `draft`, `created_by` set. Drafts-tab membership shown by tab count only (R2), not by reading the title |
| O3 agenda, no silent loss | PASS [X] | 3 blocks in, 3 out, ids stable across saves (S6), block removed cleanly, window refusal reads in plain words (S5) |
| O4 publish gate | PASS [X] | Creator (organiser lens) and non-creator admin (R1): confirm dialog, `published_at` set, `created_by` unchanged. Member publishes own draft: creator only |
| O5 one Events home | PASS [X] | Tabs match SQL (26 / 5 / 2 / 2 before and after a publish). See MINOR 300-event cap |
| O6 Registrations vs Check-in | PASS [X] | Each page says where the other job lives. Tab counts match the DB |
| O7 check-in only inside the window | PASS [X] | Before, inside, after, and a stale page. Server refusal text read. DB-level speaker gate is F1 (Decide 1) |
| O8 walk-in, no staff identity | PASS [X] | `source=walk_in`, `user_id` and `profile_snapshot` NULL, no staff id in any attendee column |
| O9 post-event path | PARTIAL | 2-click path PASS [X]. The registrants CSV was not exported live |
| ux-member (R3a to R3g) | PASS [X] | Lands on Events, Settings explains Team, creates and publishes own draft. Another's draft is read-only. Direct REST write refused 42501 `not_event_writer`. Enter-code check-in as a member: G2, creator only |
| ux-body (R4) | PASS [X] | Read-only everywhere. REST write refused 42501. `publish_event` refused |
| A1 doors | PASS [X] | Landing and public event page, every door lands somewhere |
| A2 sign-up, wizard, consent | PASS [X] | Cold start from `/login` (G1) lands on `/account/registrations`. Both consent rows written by the wizard. M1 applies |
| A3 browse from the portal | PASS [X] | |
| A4 register, linked record | PASS [X] | `user_id` = auth id, `profile_snapshot` present |
| A5 record state | PASS [X] | Upcoming list, licence prompt visible. `/account/check-in` and `/account/record` not walked |
| A6 organiser door while signed in | PASS [X] | Honest explanation, still signed in |
| A7 staff on the public page | PASS [X] | Guest row, `user_id` NULL, no profile created |
| S1 consent write path | PASS [X] | Wizard still writes both rows. Direct write 42501 (RLS matrix) |
| S2 `X-Frame-Options: DENY` | PASS [X] | `curl -I` on the running server, plus `tests/nextConfigHeaders.test.ts`. Orchestrator-run, no lens file |
| S3 zod | PASS [X] | `pnpm why zod` shows 4.6.7. `pnpm audit --prod` has no zod row (re-run today) |
| S4 confirmed email | PASS [X: DB-claims only] | GoTrue refuses the unconfirmed sign-in first, so no authenticated REST call can exist. Forged claims in psql see 0 rows. Confirmed control sees 9 / 310 / true. Realtime for a confirmed staff user still works (probe, see F2) |
| S5 block inside window | PASS [X] | Form flag, action refusal, DB trigger. DB unchanged after the refusal |
| S6 block ids returned | PASS [X] | Same 3 ids across two saves |
| S7 CSV formula guard | PASS [X: unit] | `lib/csv.test.ts` 31 of 31. Registrants, attendance, College and participants exports route through `buildCsv` [R]. Live export NOT RUN |
| S8 capacity | PASS [X] | Staff walk-in refused. Public form refused on a full event. Row inserted mid-form: "This event is at capacity." and the count stayed 1. Parallel clicks: RLS test |
| tsc | PASS [X] | exit 0 |
| eslint | PASS [X] | 0 errors, 11 warnings |
| check:ui-colours | PASS [X] | clean |
| check:ui-primitives | FAIL, pre-existing | 4 hits, none in a file I touched: `ProfileClient.tsx:510`, `OrgOnboardingClient.tsx:120` and `:142`, `MultiBodyAccreditationWizard.tsx:245`. Same four as r2 |
| vitest, plain run | NOT A CLEAN RUN | 2832 of 2833. The one failure is a DDL deadlock in `registrations_link_immutability` (`error: deadlock detected`). That file runs in the serial stage. It passes alone: 5 files, 87 tests, re-run today |
| `pnpm test:rls`, two stages | PASS [X] | 50 files / 483 tests, then 5 files / 57 tests |
| next build | PASS [X] | exit 0, dirty tree |
| gates on a clean worktree at a final HEAD | NOT RUN | nothing is committed |
| Phase protocol: dev review, separate user review, backtest | PASS | The two reviews ran as separate agents before the fix wave. Their findings are fixed test-first. Hand-backs are not saved as files. This walk with its DB read-backs is the backtest |
| Commit and push | NOT RUN | needs your word |
| PROJECT_STATE, vault, graph | see handoff | written after this summary |

## What this phase changed (all local, uncommitted)

| Id | Change | Where |
|---|---|---|
| S1 | `consent_records` writable only through `grant_consent` and `withdraw_consent`. Self-write policies dropped. `service_role` keeps DELETE | `20261114100000_consent_records_definer_only.sql`, `seed.sql`, `audited_table_writes` matrix |
| S2 | `X-Frame-Options: DENY`, `poweredByHeader: false` | `next.config.ts` |
| S3 | zod 4.4.3 to 4.6.7 | `package.json`, `pnpm-lock.yaml` |
| S4 | `app_private.auth_email()` returns the JWT email only for a confirmed account whose `sub` matches. Kernel K1 change, Decisions Log Q52 | `20261114110000_auth_email_requires_confirmed_account.sql` |
| S5 | An agenda block must sit inside its event window. Deferred constraint trigger, VOLATILE so `set constraints immediate` sees its own rows | `20261114120000_agenda_block_inside_event_window.sql`, `updateAction.ts` |
| S6 | `update_event_with_blocks` returns `{event_id, block_ids[]}` | `20261114130000_update_event_with_blocks_returns_block_ids.sql` |
| S7 | `csvEscape` prefixes `'` to cells starting `= + - @ tab CR`. Signed plain numbers stay numbers | `lib/csv.ts` |
| S8 | Capacity is checked under an event-row lock. Walk-ins are exempt, as before | `20261114140000_registration_capacity_guard.sql` |
| Fix | `updateEvent` refreshes the pages after the RPC commits. An unreadable reply says "saved, reload before saving again" | `updateAction.ts` |
| Fix | `PublishDraftButton` test pinned its clock. The hard-coded date had passed | `PublishDraftButton.test.tsx` |
| Fix | Seven RLS fixtures repaired: claims now carry `sub`, windows are derived or frozen, one role changed | `tests/rls/*`, `tests/cpd/event_freeze_trigger` |

## Decide (recommendation first)

1. **F1 MINOR. Add a DB-level window gate to `speaker_checkins`?** Today only the Server Action refuses. Any authenticated member of the organisation can INSERT directly, 5 hours before the window opened in the walk. Recommend: yes, as a small trigger like the attendee one. Cost: one migration and one test. Not a regression of this phase.
2. **M1 MAJOR. Reword the consent copy now, or wait for legal?** The copy says the Terms and Privacy "will be published before launch", and neither page exists. Recommend: wait, as your brief parked legal. If you want the strict bar met, rewording the sentence is the smaller fix.
3. **Commit and push go.** Then I run the clean-worktree gate chain at the final HEAD.
4. **Seoul apply of the five migrations.** `supabase db push --linked`. Only on your separate go, and only after the commit.

## Findings that stay open (none blocks the spine)

| Sev | Finding | Source |
|---|---|---|
| MAJOR, known | M1 above | practitioner, gapfill |
| MINOR | F2: the check-in roster did not update after an Enter-code check-in until reload. Ruled on today: **S4 is not the cause.** A confirmed staff subscriber receives the `registrations` UPDATE through the real `mark_attended` path (probe: subscribed, checked in, event arrived, `credit_ledger` 920 before and 920 after). The browser pane was not re-walked, so the cause in the pane is unproven | gapfill, orchestrator probe |
| MINOR | Events home counts under-count when the organisation has more than 300 events (test data has 533). One generic footer line warns | roles |
| MINOR | A member on another organiser's draft sees the ownership reason next to an unrelated accreditation sentence. The disabled Save has no `aria-describedby` | roles |
| MINOR | A practitioner who enters through the organiser door sees an error-styled page after a valid link. Recovery exists | gapfill |
| MINOR | Public registration: the confirmation says "this browser tab is your proof" to a signed-in user. The capacity race message has no next step. Register is greyed for a whitespace-only name with no reason | practitioner |
| NIT | Several. See the lens files | all |

## Latent, found this session, not walked

- `components/analytics/ExportAnalyticsCsv.tsx` builds CSV with its own `esc` and no formula guard. Its cells are fixed survey option labels today, so it is not exploitable now. Fold it into `buildCsv` when it is next touched.
- `components/dashboard/EventsHome.tsx` keeps a duplicate `csvEscape`. It neutralises formulas but lacks the signed-number exception.
- A cancelled registration may still hold a seat toward capacity. Not walked.
- The registrants CSV header `Start ...+00:00 (Asia/Hong_Kong)` is mislabelled (parked in the brief).
- `scripts/walk-window.sh` now fails on any event with agenda blocks, because the S5 trigger blocks the plain `update events`. The guard works. The helper needs the delete and re-insert shape.
- `pnpm update zod` also re-resolved a few transitive packages in the lockfile (lightningcss 1.33.0, postcss 8.5.33, tinyglobby 0.2.17, tslib 2.9.1, `@napi-rs/wasm-runtime`, rolldown `pluginutils`). Every gate passes on it. Review the lockfile diff at commit time.
- `pnpm audit --prod` still lists 6 advisories (browserslist, source-map-js, `@babel/core`, `baseline-browser-mapping`, deepmerge). None is zod and all are build-tool transitives under next and `@react-email`. Not triaged.

## Not run (gaps)

O2 Drafts-tab title; O9 registrants CSV file and a live S7 export; O3 add-a-block-past-the-end as its own step; R6 (landing with no `next`) was covered by G1 instead; `/account/check-in` and `/account/record`; invalid-email and duplicate-registration wrong turns; the Enter-code check-in as a non-creator member; the self-serve check-in window (self-serve is off by default); F2 in the browser pane.

## Honesty notes

- The walk ran on the uncommitted tree. Source did not change after the last full gate run (`gate3.out`); only docs did.
- Screenshots: none on disk for any lens. Evidence is page text and DB read-backs.
- Wizard selects (profession, specialty, position) were set with `form_input` as setup only. Every button and link was a real click.
- Four lenses hit their call caps. Their unreached steps are listed above, not counted as passes.
- Fixtures: every lens cleaned up and counted leftovers with stderr visible. Expected residue is `audit_events` (permanent by Hard Rule 11). `credit_ledger` grew from 889 to 920 rows on the local stack during the gates and the walk. It is append-only by design and local only.
- My Realtime probe left a fixture behind once (a `participation_evidence` row blocked its delete). I removed it with a counted dry run, then a commit, and the leftover count is 0.
