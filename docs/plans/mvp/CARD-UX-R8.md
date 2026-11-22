# CARD UX-R8 — day-of check-in and walk-ins open to every org writer (reverses part of Q51)

Card type: role-model change (kernel K1). Raised 2026-11-22 by Ivan. Status: PARTIAL (code, gates, live backtest and both review lenses done; four copy/role calls wait on Ivan, see Open decisions). LOCK-UX-R8 stays until he answers. Supersedes the open copy calls in `CARD-UX-R7.md` that concern an organiser member on a colleague's event.

## Ivan's ruling (2026-11-22)

"For check in at the gate on the day, everyone in the org should be able to check people in. Where the auth or RLS matter is the reg list, esp with deleting any info. Everyone should also be able to reg walk-ins." Asked who: "all org members".

Follow-up, same day: "not the auditor". Read as: `organiser_admin`, `organiser_member`, `body_admin` and `eventar_staff` of the event's organisation may check in, tick speakers and register walk-ins on ANY event of that organisation, whoever created it. `auditor` stays read-only. The registration list (edit, delete, roles) keeps the Q51 creator-or-admin rule for every role, `body_admin` included.

## Why today refuses it (investigated 2026-11-22)

1. Q51 (decided 2026-11-06/07) put check-in under "admin any, member own". [X] decision text read.
2. `mark_attended` calls `app_private.can_write_event` and answers `not_recognised` for an organiser_member scanning a colleague's event. [X] live definition read on the local DB; `can_write_event` admits eventar_staff, organiser_admin of the same org, and organiser_member only for events they created.
3. `event_writer_guard` triggers sit on `registrations`, `registration_checkins`, `speaker_checkins` (and six other event tables). [X] pg_trigger listing. Q51 says the trigger acts for a staff JWT only; service_role paths keep their own gates.
4. App gates: `checkin/actions.ts:177` and `:310-312` (`canWriteEvent` then `NOT_EVENT_WRITER`), `speakerActions.ts`, `checkin/page.tsx` (desk shows read-only unless `canCheckIn && canWriteEvent`), `registrations/page.tsx`. [I] the walk-in insert path; not executed.
5. Tests pinned to the old rule: `tests/rls/role_rights_q51.rls.test.ts`, the checkin page and action tests.

## Change (proposed, nothing edited)

- New migration: a second helper `app_private.can_run_door(event, actor)` = active staff of the event's organisation with role organiser_admin, organiser_member or body_admin (eventar_staff any org); not auditor. `mark_attended` and the three door tables' guards use it for check-in, speaker ticks and walk-in registration; every other guarded write (event edit, registration edit/delete/roles, accreditation) keeps `can_write_event`.
- The walk-in insert must be limited to the door path. A member may INSERT a walk-in registration for any org event but not UPDATE or DELETE a registration they did not create. Needs a guard split by operation on `registrations`; check it against `audited_table_writes.rls.test.ts` and Hard Rule 11.
- App: `canCheckIn(role)` gains `body_admin` (and its comment, which says body_admin cannot check in, is rewritten); the same edit covers the walk-in pre-check. The desk, walk-in action and speaker ticks drop their `canWriteEvent` clause. The desk's third branch ("You can view this desk but not check people in.") goes away; only `auditor` sees the read-only desk.
- Decisions Log: new entry that narrows Q51 (check-in, speaker ticks and walk-ins no longer follow the event-writer rule).
- UX-R7 follow-on: copy decisions 1 and 2 then apply to `auditor` only.

## Needs Ivan's sign-off before any edit

K1 change plus a migration. Local stack only; hosted apply is Stage 8 and needs his separate go.

## Open questions

1. `body_admin` can now write attendance, which feeds credit. Confirm that is wanted for a `body_admin` of the event's own organisation only (default here: yes).
2. Should a member's walk-in on a colleague's event record who added it? (`registered_by` or audit event; default: audit event only, as today.)

## Tests (must fail first)

- RLS: organiser_member checks in, ticks a speaker, adds a walk-in on a colleague's event: succeeds. Same member edits or deletes a registration on that event: refused with the writer-guard SQLSTATE. auditor on the same calls: refused. body_admin: check-in, speaker tick and walk-in succeed; registration edit or delete refused. Another organisation's member: refused.
- Update `canCheckIn` and `canChangeEventStatus` tests: only `canCheckIn` widens.
- Action and page tests: desk for a member on a colleague's event is the full desk; registrations page still read-only for them.
- Backtest on :3100 and :54322 as organiser_member on a colleague's event.

## Review

Dev lens, separate user lens, backtest, per `eventar-mvp-card-handback`.

## Outcome (2026-11-22)

STATUS: PARTIAL, as above. Commits: `e45e45f` (door rights), review follow-up commit named in Committed.

### Changed
- Migration `20261122100000_door_rights_ux_r8.sql`: `app_private.can_run_door`; `mark_attended` accepts body_admin and uses it; `enforce_event_writer` door exemption (speaker ticks, and the two registration writes only while `mark_attended` names that registration in `app.door_registration`). [X] applied locally.
- Migration `20261122110000_door_rights_ux_r8_hardening.sql` (review follow-up): speaker_checkins insert/update policies admit eventar_staff of any organisation; the speaker door branch pins `updated_by` to the caller's staff id and `checked_in_at` to within 5 minutes of now (or null). [X] applied locally.
- App: `canCheckIn` adds body_admin; `canRunDoor(staff, event)`; desk, check-in action, speaker action, walk-in action, dashboard row and Registrations page follow it. Auditor is the only read-only desk.
- Comments and tests that still described the old rule corrected; `SpeakersCard` dead `NOT_EVENT_WRITER` branch and its test removed; `walkIn.test.ts` uses the real `canManageEvent`.

### Tests
- `tests/rls/door_rights_ux_r8.rls.test.ts`: per role (admin, member, body_admin, auditor, eventar_staff of another org, body_admin of another org): check-in, speaker insert/tick, speaker rename/delete, registration edit/role/delete/status, direct check-in row, forged `updated_by`, back-dated tick, and the kept check-in chain (status, check-in row, evidence, audit). Refusals asserted as SQLSTATE 42501.
- `role_rights_q51.rls.test.ts`: speaker probe now stamps its own `updated_by` so it reaches the window trigger (23514).

### Gates (after the follow-up) [X]
- `tsc --noEmit` clean; eslint on touched files 0 errors (1 warning, `page.test.tsx:43 EDIT_DETAILS`, pre-existing); `vitest run` 238 files passed / 63 skipped, 2308 tests passed / 670 skipped; `next build` ok.
- RLS: door_rights_ux_r8, role_rights_q51, mark_attended, audited_table_writes, speaker_checkin_window: 5 files, 83 of 83 passed. Not run: whole `test:rls`.

### Live check [X]
Organiser member on a colleague's live event (earlier turn) and the user lens on :3300 for member, body_admin, auditor, other-org admin at 375px and desktop. Fixtures cleaned and counted; 9 `audit_events` rows remain by Hard rule 11.

### Findings
Dev lens (a92ba4fe...): no BLOCKER; 2 MAJOR, 3 MINOR, 2 NIT. User lens (a73ab69f...): no BLOCKER; 2 MAJOR, 3 MINOR, 2 NIT.
Fixed, mechanical (before -> after):
- eventar_staff could not tick speakers on another organisation's event (policies required own org) -> policies admit `is_eventar_staff()`; test rows `eventar_b:speaker_ins/tick`.
- A door role could stamp another staff id or a back-dated time on a speaker row -> guard pins both; test rows `speaker_forge_by`, `speaker_backdate`.
- Stale comments in `speakerActions.ts`, `actions.ts`, `EventsHome.tsx`, `RosterClient.test.tsx` (2), `checkin/page.tsx` -> rewritten to the UX-R8 rule.
- `walkIn.test.ts` kept its own `canManageEvent` -> real helper.
- `SpeakersCard` dead `closedMessage !== NOT_EVENT_WRITER` -> removed with its test.
Not applied (known ceiling): `app.door_registration` stays set to the end of the transaction. Nothing runs after `mark_attended` in the same call today; noted in the hardening migration header.

### Open decisions (Ivan)
1. body_admin desk shows a false "CPD eligibility couldn't be checked just now" banner, because `event_registration_eligibility` refuses body_admin. Options: let body_admin read eligibility (migration), hide the banner for body_admin, or say plainly that eligibility warnings are not shown to this role. Both lenses found it.
2. Auditor status line says "Ask an organiser admin or member" although body_admin can now check in too.
3. Dashboard hero banner tells an auditor "open check-in" while the row button says "View desk".
4. Registrations page, body_admin: "an organiser admin or member can edit them" is wrong for a member on a colleague's event.
5. Original open questions still stand: body_admin writes attendance (feeds credit); should a walk-in record who added it (default: audit event only).

### Found outside the card, not fixed
- Roster counter and rows do not update after a successful check-in or walk-in until reload; the desk relies on realtime only and local-stack realtime logs `subscription_errors`. Seen for every role, so not caused by R8. Hosted behaviour untested. Needs its own card (update local state after success, then investigate realtime).
- "+ Walk-in" button is 32px tall at 375px (Scan and Enter code are 64px).

### Deviations
The hardening migration is extra to the card's list; drop it by deleting the migration and reverting the two test blocks. Hosted apply of both migrations is Stage 8 and needs Ivan's separate go.

Executor: Claude (this session). Committed: (see git log, subject starts "feat(door)" and "fix(door)").
