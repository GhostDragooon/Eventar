# REVIEW R2 wave 1 - backtest-db lens

- Date: 2026-11-02
- Base: 4c04977 + uncommitted working tree. Migration `20261102100000_registration_email_locked_after_attendance.sql` (already applied to the LOCAL stack).
- Lens: backtest-db (real local Postgres :54322, real GoTrue :54321 sign-in, real PostgREST RPC, plus raw `pg` sessions for the lock proofs). No browser, no server, no code edits, no git writes.
- Tool calls: about 21 of the 70 cap (stop line 60). Scope complete.
- Tags: [X] = executed and read back. [I] = inference (labelled where used).
- Fixtures: 2 orgs (`ZZ-BT2 org A/B`), 7 staff rows (organiser_admin, organiser_member, body_admin, auditor, eventar_staff in A; organiser_admin and eventar_staff in B), 1 practitioner auth user with no staff row, 1 claimant auth user, 2 events (`ZZ-BT2 ...`), all addresses `zz-bt2-*@final.invalid`. Callers signed in with `signInWithPassword` and called `rpc(...)` through PostgREST (real JWT, real `authenticated` role). No `ZZ-FINAL` object touched.

## Verdict

No BLOCKER. The email lock does what the migration says on every path tried, and the forbidden outcome (check-in committed, then email changed afterwards) never occurred: 0 in 160 racing trials, and the lock order is proven by three deterministic hold tests. The one new finding is a lock-upgrade deadlock between a racing check-in and an email edit (MINOR, about 3 percent of tightly-timed trials, one party gets 40P01 after a 1 s stall, no data damage).

## Case table

| Case | Actor | State | Result | Read-back | Tag |
|---|---|---|---|---|---|
| E1.pre | organiser_admin | registered, unlinked, real `mark_attended` | `ok` | status attended, 1 checkin row, user_id null | [X] |
| E1 | organiser_admin | attended + checkin row, unlinked, email changed | 22023 `email_locked_attended: this person has already checked in, so their email cannot be changed`, details `email_locked_attended` | email unchanged, 0 `registration_contact_updated` rows (0 -> 0), global audit count unchanged (44728 -> 44728) | [X] |
| E1 | organiser_member | same row, same change | 22023, same message and details | same read-back, audit rows 0 -> 0 | [X] |
| E2a | organiser_admin | status `attended`, NO checkin row | 22023 `email_locked_attended` | email unchanged, 0 checkins, 0 audit | [X] |
| E2b | organiser_admin | status `registered`, 1 checkin row (inserted by hand) | 22023 `email_locked_attended` | email unchanged, status still registered, 1 checkin, 0 audit | [X] |
| E3a | organiser_admin | attended, name-only change | OK (returns event id) | name updated, 1 audit row, payload exactly `{"fields":["full_name"]}`, no hash keys | [X] |
| E3b | organiser_admin | attended, same name and email re-sent | OK, no-op | audit rows 1 -> 1 | [X] |
| E3c | organiser_admin | attended, same email with other case and padding (`  ZZ-BT2-E1@FINAL.INVALID `) | OK, no-op | email unchanged, audit rows 1 -> 1 | [X] |
| E4 | organiser_member | unattended, unlinked, email change (new value `" ZZ-BT2-E4-New@Final.invalid "`) | OK | email stored lower-cased and trimmed; 1 audit row, payload `{"fields":["email"],"email_before_sha256":"3be7a9a0...ba046","email_after_sha256":"cdfd6b5a...a1358"}` | [X] |
| E4 digests | - | - | both digests equal my own recomputation with `encode(sha256(convert_to(lower(btrim(x)),'utf8')),'hex')` AND node `sha256(trim().toLowerCase())` | before_ok=true, after_ok=true | [X] |
| E4 leak scan | - | - | whole audit row (all columns, payload jsonb) searched case-insensitively for `zz-bt2-e4-old`, `zz-bt2-e4-new`, `final.invalid`, `e4-old`, `E4-New` | 0 hits. Only the actor id, role, org id, subject id, hashes | [X] |
| E4b | organiser_admin | unattended, name-only after the edit | OK | payload `{"fields":["full_name"]}`, no hash keys | [X] |
| E5a | organiser_admin | linked (user_id set), unattended, email change | 22023 `linked_registration: this registration belongs to an Eventar account, so its email cannot be changed here` | email unchanged | [X] |
| E5a2 | organiser_admin | linked AND attended, email change | 22023 `linked_registration` (not `email_locked_attended`): the guard order is linked first, lock second | email unchanged | [X] |
| E5b | organiser_admin of org B | registration in org A | 42501 `registration ... is not in your organisation` | email unchanged | [X] |
| E5b2 | eventar_staff (row in org B) | registration in org A, unchanged values | OK, no-op (eventar_staff is cross-org by design in this function) | n/a | [X] |
| E5c | practitioner JWT (no staff row) | any | 42501 `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}` | email unchanged | [X] |
| E5c | body_admin, auditor | any | 42501, same message | email unchanged | [X] |
| E5c | anon (anon key, no user) | any | HTTP 401, 42501 `permission denied for function update_registration_contact` (EXECUTE revoked, so it never reaches the body) | email unchanged | [X] |
| E5d | organiser_admin | name `""` | 22023 `invalid_name: a name is 1 to 200 characters` | - | [X] |
| E5d | organiser_admin | name of 201 chars | 22023 `invalid_name` | - | [X] |
| E5d | organiser_admin | emails `not-an-email`, `a@b`, `""`, `a b@c.com` | 22023 `invalid_email: that is not an email address` (each) | - | [X] |
| E5e | organiser_admin | email already used by another registration of the same event | 23505 `already_registered: another registration for this event already uses that email` | email unchanged | [X] |
| E6 | claimant whose email = the address E1 tried to set (email confirmed) | `claim_registrations_for_user()` | returns 1 | E1's attended registration: user_id still NULL, email still the old address. Control: an unattended unlinked registration holding the claimant's address (in the org B event) WAS linked to the claimant, so the claim works and the lock is what stopped E1 | [X] |
| R1 | organiser_admin + organiser_member via PostgREST, parallel | unattended unlinked, check-in racing an email edit, 160 trials | see Race section | forbidden outcome 0/160 | [X] |
| H1 | raw pg sessions | check-in open (uncommitted), edit started | edit waits (`wait_event_type = Lock` seen in `pg_stat_activity`); after the check-in commits the edit returns 22023 `email_locked_attended` | email unchanged, status attended, audit order `[attendee_checked_in]` | [X] |
| H2 | raw pg sessions | edit open (uncommitted), check-in started | check-in waits on Lock; after the edit commits the check-in returns `ok` | email changed, status attended, audit order `[registration_contact_updated < attendee_checked_in]` (edit strictly before check-in, so the new address is what attended; this is the allowed order) | [X] |
| H3 | S1 = first two statements of the edit (lock `for no key update`, then `update ... set email`), S2 = real `mark_attended` | edit-style session holds the row, check-in arrives, edit then updates the email | S2 waits, then Postgres raises 40P01 `deadlock detected` on S2 after 1018 ms; S1's update succeeds | email changed, status registered, no audit rows from S2 (clean rollback) | [X] |
| D1 | body_admin | in-window published event, registered row | 42501 `require_active_staff: caller is not active staff in {organiser_admin,organiser_member,eventar_staff}` | status registered, 0 checkin rows, 0 `attendee_checked_in` audit | [X] |
| D1 | auditor | same | 42501, same message | same, nothing written | [X] |
| D1 | practitioner (no staff row) | same | 42501, same message | same, nothing written | [X] |
| D1 | anon | same | HTTP 401, 42501 `permission denied for function mark_attended` | nothing written | [X] |
| D1 | organiser_admin | same | `ok` | status attended, 1 checkin row, 1 audit row | [X] |
| D1 | organiser_member | same | `ok` | status attended, 1 checkin row, 1 audit row | [X] |
| D1 | eventar_staff (row in org A) | same | `ok` | status attended, 1 checkin row, 1 audit row | [X] |
| D1 | eventar_staff (row in org B), code of an org A event | same | result `not_recognised` (no error) | nothing written | [X] |
| D1 | organiser_admin of org B, code of an org A event | same | result `not_recognised` | nothing written | [X] |
| D2 | psql superuser inserts a `registered` `walk_in` row; body_admin calls `mark_attended` | the old orphan | 42501 | row stays `registered`, 0 checkin rows, 0 audit: the orphan state exists exactly as the old flow created it, so the up-front `canCheckIn` guard is needed | [X] |
| D2 control | organiser_admin, same row | same | `ok` | attended, 1 checkin row | [X] |

Role-set equality (D1): staff roles in `staff_role_check` are organiser_admin, organiser_member, body_admin, auditor, eventar_staff. `mark_attended` calls `resolve_actor(..., 'organiser_admin','organiser_member','eventar_staff')`; `lib/auth.ts` `canCheckIn(role)` returns true for exactly those three. No difference in the role set [X for the DB side, read for the TS side]. One difference in what the two check: the DB also requires the actor's staff row to be in the event's organisation (otherwise result `not_recognised`, including for `eventar_staff`); `canCheckIn` is role-only and cannot know the org. That is fine for an up-front guard (the DB stays the authority).

## Race section (R1 and H1-H3)

Method: for each trial a fresh unattended unlinked registration; `mark_attended` (organiser_admin) and `update_registration_contact` with a changed email (organiser_member) fired in parallel through PostgREST, the edit delayed or advanced by a random 0 to N ms offset. Final state read back; order of the two commits taken from `audit_events.chain_seq` (the audit insert is the last statement and the chain advisory lock is held to commit, so chain order is commit order). Forbidden = email changed AND attended AND the contact-update audit row has a HIGHER chain_seq than the check-in row.

| Run | Offset range | Trials | Check-in won, edit refused (`email_locked_attended`) | Edit committed first, then check-in | Forbidden (edit after check-in) | Other |
|---|---|---|---|---|---|---|
| 1 | +/-25 ms | 40 | 18 | 21 | **0** | 1: 40P01 deadlock, check-in was the victim, edit committed |
| 2 | +/-10 ms | 120 | 52 | 63 | **0** | 4 x 40P01 deadlock (edit victim 3, check-in victim 1), 1 x PGRST303 on the check-in call (harness/JWT noise, unrelated) |
| Total | | 160 | 70 | 84 | **0** | 6 (5 deadlocks, 1 PostgREST JWT error) |

Why it serialises (not luck): `registration_checkins` has an AFTER INSERT trigger `sync_registration_checkin_summary` that UPDATEs the registration row inside the same statement as the check-in insert, so check-in takes the row lock at insert time, long before commit. The edit takes `for no key update` on the same row and re-reads it under the lock. H1 shows the edit waiting on that lock and then seeing the check-in; H2 shows the opposite order is allowed and produces edit-then-check-in. So the answer to "does the DB serialise them" is yes: one of the two always sees the other's committed effect, except where the deadlock below aborts one of them.

Honest limit: 160 timed trials plus three deterministic orderings do not prove absence in general. What supports the claim is the mechanism (row lock taken at check-in insert, edit re-reads under its own lock), not the trial count. The deadlock path is the only way the two ever failed to serialise cleanly, and it fails safe (one transaction rolled back whole).

## Findings

### BLOCKER
None.

### MAJOR
None.

### MINOR

**M1. Check-in and email edit on the same registration can deadlock (40P01, 1 s stall, one side fails).** Observed 5 of 160 trials (4 of 120 at +/-10 ms, 1 of 40 at +/-25 ms) and reproduced by hand in H3 (1018 ms to detection).
- Cause: `mark_attended`'s check-in insert takes a key-share lock on the registration row (the FK check) and then its trigger wants `no key update`. The edit holds `no key update` (from `select ... for no key update`) and then `update ... set email` changes the key column `(event_id, email)` unique key, which needs a full `for update` lock, conflicting with the check-in's key-share. Each waits for the other. Postgres kills one after `deadlock_timeout` (1 s here), at random: in the trials the check-in was the victim twice and the edit three times. [X for the behaviour; the cause is read from the schema and the function bodies, confirmed by H3 where a hand-made "lock, then update email" session deadlocks against the real `mark_attended`.]
- Impact: the door scan can fail with a raw 40P01 after a one-second hang. `app/events/[id]/checkin/actions.ts` line 164-165 maps only 42501 and then does `if (error) throw error`, so a 40P01 would surface as an unhandled error, not a message. A retry works (check-in is idempotent). No data is lost or half-written (the loser rolled back; E3-style read-backs show clean state). It needs the same registration to be edited and scanned within about 10 ms, so it is rare in practice.
- It is not new with this migration: the lock-then-update-email shape is the same in the previous definition (`20261025100000_...`, line 66 `for no key update`, line 82 `update ... set full_name, email`) [I: read from git, I did not run the old body]. The new lock adds a re-read inside the same window but not a new lock mode.
- Proposed fix, one word in the function: take the row lock as `for update` (not `for no key update`) when the email may change (or always). The edit then holds the strongest lock before the check-in can take its key-share, so the check-in waits at the FK check, there is no upgrade, and no cycle. Optionally also map 40P01 and 40001 in the check-in action to "Try again" instead of a throw. Not applied; I did not edit code. [I: the fix is reasoned, not executed.]

### NIT

**N1. Refused email edits leave no audit trail.** E1 and E2 raise before the audit write, so nobody can later see that someone tried to re-route an attended person's email. This matches the migration header (refusal before UPDATE and audit) and the "audit insert last" rule (a raise rolls the transaction back, so an audit row could not survive anyway). Mention only so it is a conscious choice.

**N2. `eventar_staff` asymmetry between the two functions.** `update_registration_contact` lets an `eventar_staff` row from any org edit any org's registration (E5b2, by design), but `mark_attended` returns `not_recognised` for an `eventar_staff` row that is not in the event's org (D1). `canCheckIn('eventar_staff')` says true, so the desk could show check-in controls to an `eventar_staff` user whose scan then answers "not recognised". Probably irrelevant in production (eventar_staff is the platform operator); flag only.

**N3. Edit-before-check-in is allowed and the credit follows the new address.** H2 shows an edit committed a moment before the check-in leaves the registration attended on the edited address. That is the designed boundary ("locked after attendance"), but it means the lock protects only people already checked in. If Ivan's ruling also covers "email edits close at event start", that is a separate rule not implemented here.

**N4. `service_role` still holds UPDATE on `registrations.email`.** The lock lives in the function, not in a grant (`has_column_privilege('service_role', 'registrations', 'email', 'UPDATE')` is true; anon and authenticated are false). A scan of `app/` and `lib/` for `.from('registrations')` followed by `.update(` found no direct update, so no current code path bypasses it [I: grep, not exhaustive for dynamic builders]. A future service-role write would bypass the lock silently.

## Cleanup proof

Counts taken before my fixtures existed (psql), and after cleanup:

| Table | Before | After cleanup |
|---|---|---|
| events | 446 | 446 |
| registrations | 915 | 915 |
| registration_checkins | 713 | 713 |
| professional_profiles | 361 | 361 |
| auth.users | 1091 | 1091 |
| public.users | 1091 | 1091 |
| staff | 255 | 255 |
| organisations | 25 | 25 |
| participation_evidence | not counted before; 724 with my rows, 558 after deleting my 166 | 558 |
| audit_events | 44726 | 45151 (+425, permanent by design) |

- Delete order, one transaction, no `session_replication_role` trick needed (the append-only FKs did not block): participation_evidence (166), registration_checkins (167), registrations (185), one rate_limits key, events (2), staff (7), organisations (2); then the 9 auth users through the admin API.
- Audit residue: 424 of the +425 rows carry my two org ids (166 `attendee_checked_in`, 166 `evidence_recorded`, 92 `registration_contact_updated`); the remaining +1 came from another session. The 92 contact-update rows hold hashes only, no raw addresses (E4 scan).
- Residue query after cleanup (events titled `ZZ-BT2%`, registrations with `zz-bt2-%` email or `ZZBT2%` code, staff, organisations, auth users): all 0.
- Scratch env and state files holding the service key and test password were deleted from the scratchpad. Test password lived only there.

## Not covered / gaps

- The Next.js server-action layer (`app/events/[id]/registrations/actions.ts`, `checkin/actions.ts`), including how the UI renders `email_locked_attended`, the 42501 message and a 40P01, was NOT executed here (no server running). Only the DB function and the PostgREST RPC surface were exercised.
- The UI, copy, venue search box, agenda changes and the rest of the uncommitted diff are not covered.
- Not tested: registration with status `cancelled` plus a checkin row; multi-occurrence events (several checkin rows); an email edit racing the `claim_registrations_for_user()` itself (the claim and the edit racing each other); `p_actor_override` with the service role; the old (pre-20261102) function body, which I did not run.
- The race counts are timing samples on one machine with a local single Postgres; they illustrate, not prove. The mechanism (H1/H2/H3) is the argument.
- The deadlock rate in real use is unknown and probably far lower than 3 percent, because my trials aimed both calls at the same row within 10-25 ms on purpose.
