# DB cleanup — dependency map (2026-11-05)

_Read-only survey of the **local stack** (127.0.0.1:54322, read-only session), plus Seoul production (`muieupgkpbxpqsrjjwol`). Seoul was read with Ivan's go, through the Supabase MCP, inside `begin transaction read only … rollback`; the results are in §9. Nothing in either DB or in the code was changed. Each claim is tagged **[EXEC]** (measured by running a query or reading the code path) or **[INFERRED]**._

## §0 Ivan's action list

**Decide** (recommendation first):
0. **DECIDED 2026-11-06 (Q49, Ivan: "Start Decide 0"). Built as `20261106100000_pin_chain_hash_session_settings.sql` (`e43cb38`), applied locally and to Seoul 2026-11-06 on Ivan's go ("Commit and apply Seoul"). Seoul now verifies 0 of 38,081 audit rows bad from a Hong Kong session.** **Kernel K2: audit + evidence chain hashes depend on the session time zone** (§8, [EXEC]). Under `Asia/Hong_Kong`, all 70,274 audit rows and all 590 evidence rows fail content verification. Under UTC they pass. The credit ledger is unaffected because it pins `TimeZone=UTC`. The DB default is UTC today, locally and on Seoul (§9), so nothing is wrong yet. But one non-UTC session would raise a false tamper alarm or write a hash that is permanently wrong. Recommendation: pin `TimeZone=UTC, DateStyle=ISO` on the 4 audit/evidence hash and verify functions, exactly as the ledger does. That is a kernel change, so it needs a Decisions Log entry and your sign-off. **Top priority.**
1. **Fix `event_registration_eligibility` before retiring anything** (B1/B2, bug). It reads only the legacy single-body columns, so every multi-body event shows its whole roster as `not_cpd`. Recommendation: rewrite it to read `event_accreditation_groups`, as its own card. This is a fix, not cleanup, and it blocks item 2.
2. **Retire `events.accrediting_body_id` / `cpd_hours`** (B2 block contract) — only after item 1 lands. Seoul is ready for it: no event there has the two stores out of step (§9). The full dependency list is in §1.
3. **Best-effort evidence writes** (B1, ADR-0003): a check-in can succeed with no `participation_evidence` row, and the College/attendance exports read that table. Keep the current behaviour (attendance is authoritative) or make the gap visible? This is a decision, not a bug.
4. **Local fixture debt**: 422 fixture events carry credit and can never be deleted (Hard Rule 11, by design). The only clean-up is a fresh replay (`db reset`), which CLAUDE.md forbids. Allow a local reset, or run the RLS suite against a disposable DB?
5. **Squash** (Tier 3): keep it for Singapore provisioning. §5 lists what a naive squash would lose.
6. **Seoul production holds test traffic that cannot be removed** (§9). 19 of its 26 events are fixtures. It has 16,007 `attendee_checked_in` audit rows for 31 real check-ins, plus test-only event types such as `chain_test_concurrent_4`. `audit_events` is append-only, so this stays for good. Recommendation: Singapore starts from migrations plus reference seed only, and no rows are copied from Seoul. Record that in the Stage 8 plan.

7. **K2 gaps found by the Q49 reviews (2026-11-06), not caused by it; each is a kernel decision.** **(a) and (c) DECIDED 2026-11-06 (Q50, Ivan: "Audit every delete"), built as `20261106110000_audit_evidence_deletes_align_verifiers.sql`. Applied locally and to Seoul 2026-11-06 on Ivan's go (`supabase db push --linked`, exit 0; the file's own grant and trigger assertions ran there). Commit `43f3821`, on origin since `bdc87c4`. Seoul not read back: Ivan stopped that read on 2026-11-07.** (b) is a `docs/DEFERRED.md` row (Claude's recommendation: Stage 11), not ruled.
   - (a) **Evidence deletes leave no audit trace.** Locally, 19,767 `evidence_recorded` audit rows point at evidence rows that no longer exist (test teardown via the retained `service_role` DELETE). `verify_evidence_chain` returns only `chain_seq, link_valid, content_valid`, so an auditor cannot tell those breaks from tampering. Options: write an audit event on every evidence delete (chain_seq + hash + reason), or revoke the DELETE and handle erasure another way. [EXEC]
   - (b) **The hashes do not cover every column.** The evidence hash omits `user_id`, `organisation_id`, `actor_id` and the metadata columns. The audit hash omits `organisation_id`, `actor_role`, `subject_type` and `id`. UPDATE is revoked from every API role, so only the table owner could edit them, and nothing anchors the chain head externally. "content_valid" means consistent for the hashed columns, not "history unchanged". [read from source; grants EXEC]
   - (c) **Verifier EXECUTE grants disagree.** `verify_audit_chain` / `verify_ledger_chain`: `service_role` only. `verify_evidence_chain`: `authenticated` only (also Low finding in `security-audit-20261104.md`). No single role can run all three. `scripts/ci/replay-and-verify.sh` checks audit and ledger but not evidence. [EXEC]

**Execute** (only Ivan):
1. Update anything outside the repo that held the old Seoul DB password (a linked `supabase` CLI, psql or a GUI). You reset it today so the MCP could connect.

**Queued for Claude** (after the picks above): Tier 1 (schema map + function-dump script, no DB change).

**Other sessions:** none running at survey time. On 2026-11-07, "Handoffs and silence consolidation" shipped Q51 (role rights) to Seoul; §10 maps its reach.

## §1 Legacy accreditation columns — `events.accrediting_body_id`, `events.cpd_hours`

Owner: B2/B3 (multi-body accreditation, ADR-0002). New source of truth: `event_accreditation_groups` / `event_accreditations` / `event_accreditation_occurrences`.

| Layer | Dependents [EXEC] |
|---|---|
| DB functions | `set_event_cpd_config` (writes both, then deletes and rebuilds the event's accreditation group as a one-group bridge); `freeze_cpd_config_if_credited` (trigger: refuses changes once credit exists); `event_registration_eligibility` (**reads them — see bug below**) |
| Constraints | `events_accrediting_body_id_fkey` → `accrediting_bodies`; `events_cpd_hours_check` (0 < h ≤ 24) |
| Policies / indexes / views / trigger WHEN | none |
| Column grants | anon/authenticated SELECT; service_role INSERT/UPDATE (app roles' writes revoked in July) |
| App source | `app/events/[id]/details/page.tsx` (selects + `hasConfig` + passes to the section), `app/events/[id]/edit/page.tsx`, `app/events/[id]/details/cpdActions.ts` (calls `set_event_cpd_config`), `app/events/new/actions.ts` (same RPC), `components/details/CpdAccreditationSection.tsx`; `accreditationCell.ts` is a comment only |
| Tests | 12 files: `tests/cpd/*` (6), `tests/rls/*` (3), `tests/helpers/staffPageFakes.ts`, `cpdActions.test.ts`, `createEvent.test.ts` |
| Seed / scripts | `supabase/seed.sql`, `scripts/demo/seed-demo.ts` |
| Migrations / docs | 21 migrations, 26 docs mention them |

**Drift [EXEC]:** 24 events have a legacy body and no group, and 49 have groups and no legacy body. All of them are fixture events. The multi-body RPCs (`add_event_accreditation_group`, `remove_…`, `add_event_accreditation_row`) never write the legacy columns, which is by design.

**Bug [EXEC]:** `event_registration_eligibility` returns `not_cpd` when `accrediting_body_id is null`, and matches licences only against that one body. On event `043018e9…` (has groups, 1 credit row, 5 attended) it returns `not_cpd ×5`, including the one registrant who holds a verified licence at the group's body and actually received credit. The caller is the check-in roster (`app/events/[id]/checkin/page.tsx:83`). Credit posting is **not** affected, because `award_attendance_credit` reads the groups.

What the user sees (verifier, [R] `RosterClient.tsx:43-55`): `not_cpd` renders **nothing**, so staff see no wrong label. Instead they **lose the warnings**: "no licence", "no account", and also "Registration cancelled", because `not_cpd` is checked before `cancelled`. Scale: 49 of the 237 events with groups have null legacy columns, and 24 events have more than one body; all of these are fixtures locally.

Eligibility also over-predicts: it matches registrants to `auth.users` **by email**, not by `registrations.user_id`, and skips the award's F1–F3 checks. All 73 registrations it currently calls `eligible` have `user_id IS NULL`, so the award would skip every one of them (F5) with no warning on the roster [EXEC by verifier]. `tests/cpd/roster_eligibility.rls.test.ts:124,229-241` already notes "KNOWN DRIFT … Flagged, not fixed", and its fixture hides the drift by setting both shapes.

Also missed in the first pass (verifier):
- `app/events/new/NewEventForm.tsx` (cpdHours state).
- `app_private.events_draft_only_detail_edits` touches both columns implicitly, through `to_jsonb(new)`.
- `set_event_cpd_config` writes both keys into the `event_cpd_config_set` audit payload. Old audit rows keep those keys forever, which is fine because audit is append-only.
- `scripts/demo/seed-demo.ts:240,432` writes the columns **directly through service_role**, skipping the authorisation check and the audit row; its bridge group never updates afterwards.

Only one live reader uses the legacy columns alone: `event_registration_eligibility` [R]. The public pages, the registration flow, analytics, emails and the exports do not read them. The details and edit pages handle both shapes (`accreditationCell.ts` `bridgeButLocked`).

## §2 Low-use `events` columns

| Column | Rows set | App source | DB fns | Verdict [EXEC] |
|---|---|---|---|---|
| `poster_path` | 0 | 0 | 0 | Dead. Remaining refs: `seed.sql`, 1 RLS test, 5 migrations (grant lists) |
| `hero_image_url`, `hosted_by`, `organized_by` | 0 locally | 6–7 files | create/update_event_with_blocks | Live in code, just empty locally — keep |
| others (`topic`, `category`, `region`, geo, `checkin_modes`) | used | used | used | keep |

## §3 `organisations` (K1) vs `organisers` (B2 profile)

- `organisations` (7 cols) is the tenancy root: 7 inbound FKs (staff, events, accrediting_bodies, organisers, organisation_body_authorisations, invite_tokens, participation_evidence).
- `organisers` (16 cols) is a 1:1 organiser profile: `organisers_one_per_organisation` unique index, written only by `app/settings/orgActions.ts`, read by `app/settings/page.tsx`, no DB function. It has 0 rows locally.
- Grants: authenticated has INSERT/UPDATE/DELETE but only a SELECT policy exists, so RLS denies those writes. **[INFERRED]** harmless today; the grants are wider than they need to be.
- Merging the two touches K1 = constitutional change. **Recommendation: leave both.** This is a 1:1 extension table, not duplication.

## §4 Check-in is written to four stores

| Store | Writers [EXEC] | Readers [EXEC] |
|---|---|---|
| `registrations.check_in_at/method` | trigger `sync_registration_checkin_summary` (from `registration_checkins`), `mark_attended` | 12 app files (roster, details, analytics, account record) |
| `registration_checkins` (per occurrence) | `mark_attended`, `self_check_in` | DB fns only (credit, roles, contact edit) |
| `participation_evidence` (hash chain, ADR-0003) | `record_participation_evidence`, called **best-effort** from `mark_attended` / `self_check_in` (`exception when others → raise warning`) | College + attendance exports, details page |
| `audit_events` `attendee_checked_in` | `mark_attended`, `self_check_in` | check-in actions |

Measured drift [EXEC]:
- summary vs `registration_checkins`: 0.
- `registration_checkins` vs audit: 0.
- 155 registrations have a check-in but **no evidence row**. All of them belong to the `burst-throughput` fixture. The event has 156 `evidence_recorded` audit rows, so the evidence was written and then deleted: this was cleanup, not a failed write [EXEC]. Cause [INFERRED]: one `self_check_in` call errored, so `Promise.all` rejected while other calls were still running. `afterAll` then ran an unchecked evidence delete. A late call committed one more evidence row, which made the `registrations` delete fail on `participation_evidence_registration_id_fkey`, and `mustDelete` threw before the event, `rate_limits` and staff deletes ran. **The race is still in the current test file.**
- The DB log holds 3 genuine best-effort failures (`participation_evidence_actor_id_fkey`, on 2026-10-01 and 2026-10-24, during test runs).
- The best-effort design is deliberate: migration `20260912010000_checkin_writes_evidence.sql` says "attendance is authoritative", and so does `handoff_12092026.md:32`. It is not recorded in ADR-0003 or DEFERRED.
- Cost: `exportAttendanceEvidence` is built only from evidence, so an attendee whose evidence write failed is left out of the export without notice. The College export is ledger-based and only leaves the evidence columns blank [R].
- Under load, a `lock_timeout` on the evidence advisory lock is caught by `WHEN OTHERS`, so the evidence is dropped while the check-in succeeds [INFERRED].
- Missed stores: `registrations.status='attended'` (a fifth signal) and `speaker_checkins` (speakers only).

## §5 Squash (Tier 3) — what a naive `pg_dump`-based baseline would lose [EXEC counts]

- 103 migrations self-assert (`raise exception` guards) → those checks vanish from replay.
- 99 migrations set grants/revokes. The Hard Rule 11 posture must survive byte-for-byte, so run `tests/rls/audited_table_writes.rls.test.ts` after the squash.
- 21 migrations touch `auth.users` / `storage.*` (for example the `on_auth_user_created` trigger and the buckets). A public-schema dump omits them.
- 6 migrations seed reference data (bodies, professions, specialties …). A schema-only dump omits it.
- The first migration re-states default privileges for CLI 2.109 (DEFERRED row 70).
- Gate after any squash: `scripts/ci/replay-and-verify.sh` (replay + tamper probe) plus full `test:rls`.
- Local history matches the files exactly (162/162 after `a26e1ff`). Seoul matches too: same 162 versions, with an identical md5 of the sorted version list (§9).

## §6 Identity keyed on email (Hard Rule 1 debt, K1)

`staff` has **no `user_id` column**; its key is `UNIQUE(email, organisation_id)`.
- 10 DB functions resolve staff by `app_private.auth_email()`, which reads the JWT email claim.
- 7 tables have policies that mention email directly, and **27 public tables plus `storage.objects`** have policies that call the email-keyed helpers [EXEC by verifier].
- `lib/auth.ts:119,193` and `proxy.ts:101` look staff up with `.eq('email', …)`.
- RLS trusts the JWT email even when it is unconfirmed; `lib/auth.ts:182-188` admits the confirmed-email check covers only the app layer.
- Multi-org staff rows are picked by earliest `created_at`.
- 97 of the 265 local staff rows have no auth user: 91 are `@rls-test.invalid`.

Other paths keyed on email:
- `claim_registrations_for_user`, `update_registration_contact` and `event_registration_eligibility`.
- `award_attendance_credit` falls back to email when it is not enforcing full setup.
- `reconcile_group_credit` maps ledger users back to registrations by email and silently `continue`s when there is no match [R; 0 such rows locally].

This is the known `staff.user_id` debt (Hard Rule 1, Q47). It is a kernel change, so it is out of scope for a DB tidy.

## §7 Fixture debt (local only)

- Events: about 428 fixture events, 38 others (also test-made).
- Credit: 422 fixture events have `credit_ledger` rows. `credit_ledger_event_id_fkey` is NO ACTION and the ledger is append-only for every role, so they are undeletable by design.
- Blast radius: the same ledger rows also block deleting 434 `users` (and their `auth.users`, whose cascade is refused), 506 `practitioner_licences` and 126 `accrediting_bodies`. "Never" holds for app roles only: the owner `postgres` keeps DELETE/TRUNCATE, but using it breaks the ledger chain [EXEC by verifier].
- Accrediting bodies: 144 fixture bodies carry no credit and could be deleted.
- `users`: 240 rows have no auth row. They came from an 11-02 14:40–14:58 burst (`elig-*`, `softdel-*`). How they survived a validated `ON DELETE CASCADE` FK is **not explained**.

## §8 Kernel (K2) integrity findings

| Check | UTC session | `Asia/Hong_Kong` session |
|---|---|---|
| `verify_audit_chain` content-invalid | 0 / 70,274 | **70,274 / 70,274** |
| `verify_evidence_chain` content-invalid | 0 / 590 | **590 / 590** |
| `verify_ledger_chain` invalid | 0 / 795 | 0 / 795 |

[EXEC]
- **Cause:** `compute_audit_hash`, `compute_evidence_hash` and both verifiers pin only `search_path`, and they hash timestamps as text. `compute_credit_ledger_hash` and `verify_ledger_chain` pin `TimeZone=UTC, DateStyle=ISO, MDY, bytea_output=hex`, which is why the ledger passes.
- **Today:** the local DB default is UTC, and no app role overrides `TimeZone` (role configs set only timeouts). Seoul is the same: `TimeZone=UTC`, no role overrides, and the same unpinned `proconfig` on the four audit/evidence functions (§9).
- **Risk:** an auditor or tool connecting with a local time zone sees every audit and evidence row as tampered. A hash written from a non-UTC session would be permanently wrong.
- **Evidence chain links:** 70 broken links even under UTC, with `chain_seq` gaps. The cause is `service_role` DELETE on `participation_evidence` (the lifecycle grant row, by design): fixture teardown deletes rows. The verifier cannot tell a legitimate erasure from a tamper [EXEC].
- **Throughput ceiling:** every check-in passes through two global advisory locks (evidence, then audit) held until commit. That is a cross-tenant ceiling [INFERRED from source].

## §9 Seoul production (read-only, 2026-11-05) [EXEC]

Three read-only transactions on `muieupgkpbxpqsrjjwol` (PG 17.11, `ACTIVE_HEALTHY`):

| Check | Seoul | Local | Meaning |
|---|---|---|---|
| `TimeZone` / role overrides | UTC / none | UTC / none | §8 risk is latent on Seoul too; no hash is wrong today |
| Hash function `proconfig` | ledger pinned; audit + evidence pin only `search_path` | same | Decide 0 applies to Seoul |
| Migrations | 162, max `20261105100000` | 162, same | Version sets identical (md5 `c8135903…`) |
| Public tables | 35 | — | — |
| Events (fixture) | 26 (19) | ~466 (~428) | Test fixtures reached production |
| Events with legacy body but no matching group / group but no legacy body | 0 / 0 | 24 / — | Retiring the legacy columns (Decide 2) has no data to reconcile on Seoul |
| Fixture bodies (`A2-`/`MB-`) | 0 of 43 | 144 | — |
| `users` with no `auth.users` row | 0 of 41 | 240 | The orphan burst (§7) is local only |
| Staff / registrations | 19 / 67 | — | — |
| Check-ins / check-ins with no evidence | 31 / 31 | — / 155 | All 31 are from 2026-06-16 to 2026-07-02, before the evidence migrations (`20260912*`). Expected, not a failure of the best-effort write (Decide 3) |
| `participation_evidence` | 0 | 590 | Same reason |
| Summary drift (`check_in_at` vs `registration_checkins`) | 0 | 0 | — |
| `credit_ledger` | 22 | 795 | — |
| `audit_events` | 38,081 | 70,274 | 2026-07: 30,158; 2026-08: 7,880; 2026-11: 43 |

`audit_events` by type (top 8): `attendee_checked_in` 16,007 · `consent_granted` 583 · `licence_declared` 581 · `consent_withdrawn` 176 · `dsr_transitioned` 154 · `licence_marked_primary` 119 · `event_published` 109 · `chain_test_concurrent_4` 97. 16,007 check-in audits against 31 check-in rows, plus a `chain_test_*` type, mean test suites ran against Seoul in July and August [INFERRED from the counts; the timing matches CLAUDE.md's warning that `pnpm dev` on :3000 points at Seoul]. Those rows are append-only (Hard Rule 11), so this is Decide 6, not a cleanup task.

**How Seoul reached 162:** at about 08:25 HKT on 2026-11-05, the session "Event accreditation product review" ran `supabase db push --linked`. It first dry-ran, found 19 pending migrations (`20261002000000` to `20261105100000`), stopped and recommended holding them. Ivan replied "Push all 19", and all 19 applied in order. Commit `6bba7cf` records it. Before that push, the last migration on Seoul predated 2026-10-02 [EXEC: transcript, reflog and commit read].

The first MCP attempt failed with `password authentication failed for user "postgres"`: the platform's stored DB password no longer matched. Ivan reset it in the dashboard, and the reads then ran.

## §10 Re-map after three pushes (local, 2026-11-07) [EXEC]

Three migrations landed since this map: Q49 `20261106100000` (UTC pin), Q50 `20261106110000` (evidence deletes audited, verifiers `service_role` only), and Q51 `20261107100000` (role rights, from the session "Handoffs and silence consolidation"). All three are on origin and on Seoul. Seoul was **not** re-read for this pass; §9 still shows 2026-11-05. Every number below is from the local stack, read-only.

| § | 2026-11-05 | 2026-11-07 | Change |
|---|---|---|---|
| Schema | 162 migrations; 35 tables, all RLS; 65 public fns (56 definer) | 165 (max `20261107100000`); 35, all RLS; 65 (56); `app_private` 19 | Q50 added 1 trigger fn, Q51 added 4 helpers |
| §1 drift (legacy body without group / group without legacy) | 24 / 49 | 24 / 49 | none. Events 482, 230 with legacy body, 255 with groups |
| §1 eligibility bug | `not_cpd ×5` on `043018e9…` | `not_cpd ×5` (run as `service_role` with an org admin override, rolled back) | **still live**. Last defined in `20261024100000`; Q51 does not touch it. Decide 1 stands |
| §1 legacy-column fns | 3 | 3 (`event_registration_eligibility`, `freeze_cpd_config_if_credited`, `set_event_cpd_config`) | Q51 has 0 references to `accrediting_body_id` / `cpd_hours` |
| §2 `poster_path` | 0 rows | 0 | none |
| §3 `organisers` | 0 rows; authenticated INSERT/DELETE granted | same | none |
| §4 check-in stores | summary drift 0/0; 155 check-ins with no evidence | 0/0; 155; 817 check-ins | Q51 rewrote `mark_attended`; it and `self_check_in` still catch `when others`, so evidence stays best-effort. Decide 3 stands |
| §6 identity | staff has no `user_id`; 10 fns use `auth_email()` | same; staff 283, 108 with no auth user | **New:** Q51's `enforce_event_writer` and `can_write_hero_object` find the actor through `current_staff_id()`, which resolves by email. The new role rule inherits the email key and the earliest-`created_at` multi-org pick |
| §7 fixtures | 422 events with credit; 240 orphan `users`; 144 creditless fixture bodies | 439; 240; 144 (of 264 `A2-`/`MB-`) | credit-locked fixture events +17 from test runs |
| §8 audit chain | 0 / 70,274 bad (UTC); all bad under HK | 0 / 81,198 bad, UTC **and** HK | Q49 holds |
| §8 evidence chain | 0 / 590 bad content; 70 link breaks | 0 / 662 (UTC and HK); 73 breaks: 70 old, 3 explained by an `evidence_deleted` chain_seq in the gap | Q50 holds. 2,262 `evidence_deleted` rows; 0 untraced deletes since the first trail (newest untraced 2026-11-06 00:43 UTC, first trail 11:23 UTC). 19,788 older deletes stay untraced |
| §8 ledger | 0 / 795 | 0 / 820 | none |

Q51's `event_writer_guard` trigger sits on 9 tables (`events`, `agenda_blocks`, `registrations`, `speaker_checkins`, `registration_checkins`, `event_accreditation_groups`, `event_accreditations`, `event_accreditation_occurrences`, `registration_roles`), all enabled. It is not on `participation_evidence` or `credit_ledger`, so it does not interact with the Q50 delete trigger.

**Effect on §0:** items 1–6 are unchanged and still open. Item 0 is done. Item 7 (a) and (c) are done and on Seoul. Item 7 (b) is still a DEFERRED row. One addition for item 1's card: retiring the legacy columns (item 2) must keep `set_event_cpd_config` passing the Q51 guard on `events`.

The Q51 absence claims (no legacy-column, eligibility or `auth_email()` references) come from one grep pass of the migration file, not an independent second pass.

## Verification

The first pass was mine. A separate read-only agent then re-derived §1, §4, §6 and §7. Its additions are tagged "verifier". I re-ran the §8 time-zone result myself.
